-- Spec automation (additive): honor roll credits, GPA interview band, instructor low-rating
-- warnings, cancellation scan warns/suspends instructors, missing grades when grading→closed,
-- student honor redemption RPC.

-- ---------------------------------------------------------------------------
-- Honor: one credit per semester when semester GPA > 3.75; one cumulative credit
-- when overall GPA > 3.5 with grades in 2+ distinct semesters.
-- ---------------------------------------------------------------------------
create table if not exists public.student_semester_honors (
  student_id uuid not null references public.profiles (id) on delete cascade,
  semester_id uuid not null references public.semesters (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (student_id, semester_id)
);

alter table public.student_semester_honors enable row level security;

alter table public.profiles
  add column if not exists honor_awarded_cumulative_35 boolean not null default false;

create or replace function public.maybe_award_honors_after_grade(p_student_id uuid, p_semester_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  sg numeric;
  ins_rows int;
  nsem int;
  cg numeric;
  cum_flag boolean;
begin
  if p_student_id is null or p_semester_id is null then
    return;
  end if;

  sg := public.rpc_semester_gpa(p_student_id, p_semester_id);
  if sg is not null and sg > 3.75 then
    insert into public.student_semester_honors (student_id, semester_id)
    values (p_student_id, p_semester_id)
    on conflict (student_id, semester_id) do nothing;
    get diagnostics ins_rows = row_count;
    if ins_rows > 0 then
      update public.profiles
      set honor_roll_count = honor_roll_count + 1
      where id = p_student_id;
    end if;
  end if;

  select count(distinct e.semester_id) into nsem
  from public.enrollments e
  where e.student_id = p_student_id
    and e.status = 'enrolled'::enrollment_status
    and e.grade is not null;

  select cumulative_gpa, honor_awarded_cumulative_35
  into cg, cum_flag
  from public.profiles
  where id = p_student_id;

  if nsem >= 2 and cg is not null and cg > 3.5 and not cum_flag then
    update public.profiles
    set
      honor_roll_count = honor_roll_count + 1,
      honor_awarded_cumulative_35 = true
    where id = p_student_id;
  end if;
end;
$$;

create or replace function public.enrollments_after_grade_honors()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op <> 'UPDATE' then
    return coalesce(new, old);
  end if;
  if new.grade is null or new.student_id is null or new.semester_id is null then
    return new;
  end if;
  if new.grade is not distinct from old.grade then
    return new;
  end if;
  perform public.maybe_award_honors_after_grade(new.student_id, new.semester_id);
  return new;
end;
$$;

drop trigger if exists trg_enrollments_grade_honors on public.enrollments;
create trigger trg_enrollments_grade_honors
  after update of grade on public.enrollments
  for each row execute function public.enrollments_after_grade_honors();

-- ---------------------------------------------------------------------------
-- Cumulative GPA 2.0–2.25: registrar interview warning (active students only).
-- ---------------------------------------------------------------------------
create or replace function public.profiles_after_gpa_interview_warning()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  rsn constant text := 'Academic standing: cumulative GPA between 2.0 and 2.25 — registrar interview required.';
begin
  if new.role <> 'student'::user_role then
    return new;
  end if;
  if new.cumulative_gpa is null or new.cumulative_gpa is not distinct from old.cumulative_gpa then
    return new;
  end if;
  if new.status <> 'active'::profile_status then
    return new;
  end if;
  if new.cumulative_gpa < 2.0 or new.cumulative_gpa > 2.25 then
    return new;
  end if;

  if exists (
    select 1
    from public.warnings w
    where w.target_id = new.id
      and not w.is_removed
      and w.reason = rsn
  ) then
    return new;
  end if;

  insert into public.warnings (target_id, reason, issued_by, semester_id)
  values (new.id, rsn, null, null);
  return new;
end;
$$;

drop trigger if exists trg_profiles_gpa_interview on public.profiles;
create trigger trg_profiles_gpa_interview
  after update of cumulative_gpa on public.profiles
  for each row
  when (old.cumulative_gpa is distinct from new.cumulative_gpa)
  execute function public.profiles_after_gpa_interview_warning();

-- ---------------------------------------------------------------------------
-- Class average rating < 2: warn assigned instructor (deduped per class).
-- ---------------------------------------------------------------------------
create or replace function public.classes_after_low_avg_rating_warn()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  rsn text;
begin
  if new.instructor_id is null then
    return new;
  end if;
  if new.avg_rating is null or new.avg_rating >= 2.0 then
    return new;
  end if;
  if new.avg_rating is not distinct from old.avg_rating then
    return new;
  end if;

  rsn := format(
    'Low class average rating (<2.0) for %s — course %s.',
    new.course_code,
    new.title
  );

  if exists (
    select 1
    from public.warnings w
    where w.target_id = new.instructor_id
      and not w.is_removed
      and w.reason = rsn
  ) then
    return new;
  end if;

  insert into public.warnings (target_id, reason, issued_by, semester_id)
  values (new.instructor_id, rsn, null, new.semester_id);
  return new;
end;
$$;

drop trigger if exists trg_classes_low_avg_warn on public.classes;
create trigger trg_classes_low_avg_warn
  after update of avg_rating on public.classes
  for each row execute function public.classes_after_low_avg_rating_warn();

-- ---------------------------------------------------------------------------
-- Grading → closed: warn instructors with missing grades in that semester.
-- ---------------------------------------------------------------------------
create or replace function public.warn_instructors_missing_grades_for_semester(p_semester_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  r record;
  rsn text;
begin
  for r in
    select distinct c.instructor_id, c.id as class_id, c.course_code
    from public.classes c
    where c.semester_id = p_semester_id
      and c.instructor_id is not null
      and exists (
        select 1
        from public.enrollments e
        where e.class_id = c.id
          and e.status = 'enrolled'::enrollment_status
          and e.grade is null
      )
  loop
    rsn := format(
      'Grading period ended: missing grades for enrolled students in %s.',
      r.course_code
    );
    if not exists (
      select 1
      from public.warnings w
      where w.target_id = r.instructor_id
        and not w.is_removed
        and w.reason = rsn
    ) then
      insert into public.warnings (target_id, reason, issued_by, semester_id)
      values (r.instructor_id, rsn, null, p_semester_id);
    end if;
  end loop;
end;
$$;

create or replace function public.semesters_after_grading_closed_warn()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.phase = 'closed'::semester_phase
     and old.phase = 'grading'::semester_phase then
    perform public.warn_instructors_missing_grades_for_semester(new.id);
  end if;
  return new;
end;
$$;

drop trigger if exists trg_semesters_grading_closed_warn on public.semesters;
create trigger trg_semesters_grading_closed_warn
  after update of phase on public.semesters
  for each row execute function public.semesters_after_grading_closed_warn();

-- ---------------------------------------------------------------------------
-- Course cancellation scan: warn instructors; suspend if all their classes
-- in a semester are cancelled.
-- ---------------------------------------------------------------------------
create or replace function public.rpc_course_cancellation_scan()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  cancelled text[] := array[]::text[];
  r record;
  cnt int;
  inst_warn text;
begin
  if public._current_role() <> 'registrar'::user_role then
    raise exception 'only registrars may run cancellation scan';
  end if;

  for r in
    select c.id, c.course_code, c.instructor_id, c.semester_id
    from public.classes c
    where not c.is_cancelled
  loop
    select count(*)::int into cnt
    from public.enrollments e
    where e.class_id = r.id and e.status = 'enrolled'::enrollment_status;

    if cnt < 3 then
      update public.classes set is_cancelled = true where id = r.id;
      cancelled := array_append(cancelled, r.course_code);

      update public.profiles p
      set special_registration_eligible = true
      where p.id in (
        select e.student_id
        from public.enrollments e
        where e.class_id = r.id
          and e.status in ('enrolled'::enrollment_status, 'waitlisted'::enrollment_status)
      );

      if r.instructor_id is not null then
        inst_warn := format(
          'Course %s was cancelled (fewer than 3 enrolled students).',
          r.course_code
        );
        if not exists (
          select 1
          from public.warnings w
          where w.target_id = r.instructor_id
            and not w.is_removed
            and w.reason = inst_warn
        ) then
          insert into public.warnings (target_id, reason, issued_by, semester_id)
          values (r.instructor_id, inst_warn, null, r.semester_id);
        end if;
      end if;
    end if;
  end loop;

  -- Suspend instructors whose entire teaching load is cancelled (at least one class).
  update public.profiles p
  set status = 'suspended'::profile_status
  where p.role = 'instructor'::user_role
    and p.status = 'active'::profile_status
    and exists (select 1 from public.classes c where c.instructor_id = p.id)
    and not exists (
      select 1 from public.classes c where c.instructor_id = p.id and not c.is_cancelled
    );

  return jsonb_build_object('ok', true, 'cancelled', to_jsonb(cancelled));
end;
$$;

-- ---------------------------------------------------------------------------
-- Student: spend one honor credit to remove one active warning (oldest first).
-- ---------------------------------------------------------------------------
create or replace function public.rpc_redeem_honor_for_warning()
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  me uuid := auth.uid();
  wid uuid;
  h int;
begin
  if public._current_role() <> 'student'::user_role then
    raise exception 'only students may redeem honor credits';
  end if;

  select honor_roll_count into h from public.profiles where id = me;
  if coalesce(h, 0) < 1 then
    raise exception 'no honor credits available';
  end if;

  select w.id into wid
  from public.warnings w
  where w.target_id = me
    and not w.is_removed
  order by w.created_at asc
  limit 1;

  if wid is null then
    raise exception 'no active warnings to remove';
  end if;

  update public.warnings set is_removed = true where id = wid;
  update public.profiles set honor_roll_count = greatest(honor_roll_count - 1, 0) where id = me;
  return 'ok';
end;
$$;

grant execute on function public.rpc_redeem_honor_for_warning() to authenticated;
