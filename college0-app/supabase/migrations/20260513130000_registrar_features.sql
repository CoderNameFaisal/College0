-- Registrar dashboard: schema, triggers, and RPCs to support the registrar
-- workflows (warnings/suspension/fines, auto-termination, graduation checks,
-- complaint resolution, and the application auto-accept rule).

-- ---------------------------------------------------------------------------
-- New tables: fines, required_courses
-- ---------------------------------------------------------------------------
create table if not exists public.fines (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references public.profiles (id) on delete cascade,
  amount numeric(10,2) not null check (amount >= 0),
  reason text not null,
  semester_id uuid references public.semesters (id) on delete set null,
  paid boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

drop trigger if exists trg_fines_updated on public.fines;
create trigger trg_fines_updated
  before update on public.fines
  for each row execute function public.set_updated_at();

alter table public.fines enable row level security;

drop policy if exists fines_select on public.fines;
create policy fines_select on public.fines
  for select using (
    student_id = auth.uid()
    or exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'registrar')
  );

drop policy if exists fines_write on public.fines;
create policy fines_write on public.fines
  for all using (
    exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'registrar')
  );

create table if not exists public.required_courses (
  course_code text primary key,
  title text not null,
  created_at timestamptz not null default now()
);

alter table public.required_courses enable row level security;

drop policy if exists required_courses_select on public.required_courses;
create policy required_courses_select on public.required_courses
  for select using (true);

drop policy if exists required_courses_write on public.required_courses;
create policy required_courses_write on public.required_courses
  for all using (
    exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'registrar')
  );

-- ---------------------------------------------------------------------------
-- enrollments.semester_id (denormalized, kept in sync via trigger)
-- ---------------------------------------------------------------------------
alter table public.enrollments
  add column if not exists semester_id uuid references public.semesters (id) on delete cascade;

create or replace function public.set_enrollment_semester()
returns trigger
language plpgsql
as $$
begin
  if new.semester_id is null then
    select c.semester_id into new.semester_id
    from public.classes c
    where c.id = new.class_id;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_enrollment_semester on public.enrollments;
create trigger trg_enrollment_semester
  before insert or update of class_id on public.enrollments
  for each row execute function public.set_enrollment_semester();

update public.enrollments e
set semester_id = (select c.semester_id from public.classes c where c.id = e.class_id)
where e.semester_id is null;

-- Make it required going forward
alter table public.enrollments alter column semester_id set not null;

-- ---------------------------------------------------------------------------
-- Warning count + auto-suspension + auto-fine
-- ---------------------------------------------------------------------------
create or replace function public.recalc_warning_count()
returns trigger
language plpgsql
as $$
declare
  tgt uuid;
  cnt int;
  cur_status profile_status;
  cur_role user_role;
  sem_id uuid;
begin
  tgt := coalesce(new.target_id, old.target_id);

  select count(*) into cnt
  from public.warnings
  where target_id = tgt and not is_removed;

  select status, role into cur_status, cur_role
  from public.profiles where id = tgt;

  update public.profiles set warning_count = cnt where id = tgt;

  -- Auto-suspend on crossing 3 warnings (active → suspended) and issue fine
  if cnt >= 3 and cur_status = 'active' then
    update public.profiles set status = 'suspended' where id = tgt;

    if cur_role = 'student' then
      sem_id := coalesce(new.semester_id, old.semester_id);
      if sem_id is null then
        select id into sem_id from public.semesters
        where phase <> 'closed'
        order by created_at desc limit 1;
      end if;
      insert into public.fines (student_id, amount, reason, semester_id)
      values (tgt, 500.00, 'Suspension fine: 3 warnings accumulated', sem_id);
    end if;
  end if;

  return coalesce(new, old);
end;
$$;

drop trigger if exists trg_warnings_recalc_count on public.warnings;
create trigger trg_warnings_recalc_count
  after insert or update or delete on public.warnings
  for each row execute function public.recalc_warning_count();

-- ---------------------------------------------------------------------------
-- Auto-terminate students when cumulative GPA drops below 2.0
-- ---------------------------------------------------------------------------
create or replace function public.profiles_auto_terminate_low_gpa()
returns trigger
language plpgsql
as $$
begin
  if new.role = 'student'
     and new.status = 'active'
     and new.cumulative_gpa is not null
     and new.cumulative_gpa < 2.0 then
    new.status := 'terminated';
  end if;
  return new;
end;
$$;

drop trigger if exists trg_profiles_auto_terminate on public.profiles;
create trigger trg_profiles_auto_terminate
  before update of cumulative_gpa on public.profiles
  for each row execute function public.profiles_auto_terminate_low_gpa();

-- ---------------------------------------------------------------------------
-- Auto-terminate students who fail the same course twice
-- ---------------------------------------------------------------------------
create or replace function public.enrollment_failed_twice()
returns trigger
language plpgsql
as $$
declare
  ccode text;
  fail_n int;
begin
  if new.grade = 'F' and (old.grade is null or old.grade <> 'F') then
    select c.course_code into ccode from public.classes c where c.id = new.class_id;

    select count(*) into fail_n
    from public.enrollments e
    join public.classes c on c.id = e.class_id
    where e.student_id = new.student_id
      and c.course_code = ccode
      and e.grade = 'F';

    if fail_n >= 2 then
      update public.profiles
      set status = 'terminated'
      where id = new.student_id and status = 'active';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_enrollment_failed_twice on public.enrollments;
create trigger trg_enrollment_failed_twice
  after update of grade on public.enrollments
  for each row execute function public.enrollment_failed_twice();

-- ---------------------------------------------------------------------------
-- RPC: registrar issues a warning
-- ---------------------------------------------------------------------------
create or replace function public.rpc_warn_user(
  p_target_id uuid,
  p_reason text
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  cur_sem uuid;
  new_id uuid;
begin
  if public._current_role() <> 'registrar'::user_role then
    raise exception 'only registrar may warn';
  end if;
  if p_target_id is null then
    raise exception 'target required';
  end if;
  if p_reason is null or trim(p_reason) = '' then
    raise exception 'reason required';
  end if;

  select id into cur_sem
  from public.semesters
  where phase <> 'closed'
  order by created_at desc limit 1;

  insert into public.warnings (target_id, reason, issued_by, semester_id)
  values (p_target_id, p_reason, auth.uid(), cur_sem)
  returning id into new_id;

  return new_id;
end;
$$;

-- ---------------------------------------------------------------------------
-- RPC: registrar decides an application with auto-accept rule enforcement
-- For student applications:
--   GPA > 3.0 AND quota not reached → must accept (justification required to reject)
--   Otherwise                       → must reject (justification required to accept)
-- For instructor applications: free choice, no justification rule.
-- ---------------------------------------------------------------------------
create or replace function public.rpc_decide_application(
  p_application_id uuid,
  p_status app_status,
  p_justification text default null
)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  app record;
  cur_sem record;
  active_students int;
  must_accept boolean;
  is_override boolean := false;
begin
  if public._current_role() <> 'registrar'::user_role then
    raise exception 'only registrar may decide applications';
  end if;

  if p_status not in ('accepted'::app_status, 'rejected'::app_status) then
    raise exception 'status must be accepted or rejected';
  end if;

  select * into app from public.applications where id = p_application_id;
  if not found then
    raise exception 'application not found';
  end if;
  if app.status <> 'pending' then
    raise exception 'application already decided';
  end if;

  if app.role_requested = 'student'::app_role_requested then
    select * into cur_sem
    from public.semesters
    where phase in ('setup'::semester_phase, 'registration'::semester_phase)
    order by created_at desc limit 1;

    if cur_sem.id is not null then
      select count(*) into active_students
      from public.profiles
      where role = 'student'::user_role and status = 'active'::profile_status;

      must_accept := app.prior_gpa is not null
                     and app.prior_gpa > 3.0
                     and active_students < cur_sem.quota;

      if must_accept and p_status = 'rejected'::app_status then
        is_override := true;
      end if;
      if (not must_accept) and p_status = 'accepted'::app_status then
        is_override := true;
      end if;

      if is_override and (p_justification is null or trim(p_justification) = '') then
        raise exception 'justification required to override the auto-decision rule';
      end if;
    end if;
  end if;

  update public.applications
  set status = p_status,
      rejection_reason = case
        when p_status = 'rejected'::app_status then coalesce(p_justification, 'Does not meet criteria')
        else p_justification
      end,
      reviewed_by = auth.uid()
  where id = p_application_id;

  return 'ok';
end;
$$;

-- ---------------------------------------------------------------------------
-- RPC: registrar decides a graduation application
-- Approval requires ≥ 8 distinct passing courses AND all required_courses passed.
-- Rejecting a premature application also issues a warning to the student.
-- ---------------------------------------------------------------------------
create or replace function public.rpc_decide_graduation_application(
  p_app_id uuid,
  p_decision grad_app_status,
  p_notes text default null
)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  ga record;
  passing_count int;
  missing_required text[];
  premature boolean;
begin
  if public._current_role() <> 'registrar'::user_role then
    raise exception 'only registrar may decide graduation';
  end if;

  if p_decision not in ('approved'::grad_app_status, 'rejected'::grad_app_status) then
    raise exception 'decision must be approved or rejected';
  end if;

  select * into ga from public.graduation_applications where id = p_app_id;
  if not found then
    raise exception 'graduation application not found';
  end if;
  if ga.status <> 'pending'::grad_app_status then
    raise exception 'graduation application already decided';
  end if;

  select count(distinct c.course_code) into passing_count
  from public.enrollments e
  join public.classes c on c.id = e.class_id
  where e.student_id = ga.student_id
    and e.grade is not null
    and e.grade <> 'F'::grade_letter
    and e.status = 'enrolled'::enrollment_status;

  select coalesce(array_agg(rc.course_code), '{}'::text[]) into missing_required
  from public.required_courses rc
  where not exists (
    select 1
    from public.enrollments e
    join public.classes c on c.id = e.class_id
    where e.student_id = ga.student_id
      and c.course_code = rc.course_code
      and e.grade is not null
      and e.grade <> 'F'::grade_letter
      and e.status = 'enrolled'::enrollment_status
  );

  premature := (passing_count < 8) or (coalesce(array_length(missing_required, 1), 0) > 0);

  if p_decision = 'approved'::grad_app_status then
    if premature then
      raise exception 'cannot approve: student missing courses (% completed of 8, missing required: %)',
        passing_count, missing_required;
    end if;
    update public.profiles set status = 'graduated'::profile_status where id = ga.student_id;
  end if;

  if p_decision = 'rejected'::grad_app_status and premature then
    insert into public.warnings (target_id, reason, issued_by, semester_id)
    values (ga.student_id, 'Premature graduation application', auth.uid(), ga.semester_id);
  end if;

  update public.graduation_applications
  set status = p_decision, notes = p_notes
  where id = p_app_id;

  return 'ok';
end;
$$;

-- ---------------------------------------------------------------------------
-- RPC: registrar resolves a complaint
-- Every instructor-filed complaint must result in a warning (to accused student
-- or to the complaining instructor if registrar sides with the student).
-- ---------------------------------------------------------------------------
create or replace function public.rpc_resolve_complaint(
  p_complaint_id uuid,
  p_warn_target_id uuid,
  p_reason text default null,
  p_resolution text default null
)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  c record;
  filer_role user_role;
  cur_sem uuid;
begin
  if public._current_role() <> 'registrar'::user_role then
    raise exception 'only registrar may resolve complaints';
  end if;

  select * into c from public.complaints where id = p_complaint_id;
  if not found then
    raise exception 'complaint not found';
  end if;
  if c.status <> 'open'::complaint_status then
    raise exception 'complaint already resolved';
  end if;

  select role into filer_role from public.profiles where id = c.filed_by;

  if filer_role = 'instructor'::user_role and p_warn_target_id is null then
    raise exception 'instructor complaints require a warning action';
  end if;

  if p_warn_target_id is not null
     and p_warn_target_id <> c.filed_by
     and p_warn_target_id <> c.against then
    raise exception 'warning target must be the complainant or the accused';
  end if;

  if p_warn_target_id is not null then
    if p_reason is null or trim(p_reason) = '' then
      raise exception 'reason required when issuing a warning';
    end if;

    select id into cur_sem
    from public.semesters
    where phase <> 'closed'::semester_phase
    order by created_at desc limit 1;

    insert into public.warnings (target_id, reason, issued_by, semester_id)
    values (p_warn_target_id, p_reason, auth.uid(), cur_sem);
  end if;

  update public.complaints
  set status = 'resolved'::complaint_status,
      resolution = coalesce(p_resolution, p_reason, 'Resolved by registrar')
  where id = p_complaint_id;

  return 'ok';
end;
$$;

-- ---------------------------------------------------------------------------
-- RPC: per-semester GPA helper (used by honor roll detection)
-- ---------------------------------------------------------------------------
create or replace function public.rpc_semester_gpa(p_student_id uuid, p_semester_id uuid)
returns numeric
language sql
security definer
set search_path = public
stable
as $$
  with grades as (
    select e.grade
    from public.enrollments e
    where e.student_id = p_student_id
      and e.semester_id = p_semester_id
      and e.grade is not null
      and e.status = 'enrolled'::enrollment_status
  )
  select case when count(*) = 0 then null
    else round(avg(case grade
      when 'A'::grade_letter then 4.0
      when 'B'::grade_letter then 3.0
      when 'C'::grade_letter then 2.0
      when 'D'::grade_letter then 1.0
      when 'F'::grade_letter then 0.0
    end)::numeric, 2)
  end
  from grades;
$$;

-- ---------------------------------------------------------------------------
-- RPC: registrar assigns or reassigns an instructor on a class
-- ---------------------------------------------------------------------------
create or replace function public.rpc_assign_instructor(
  p_class_id uuid,
  p_instructor_id uuid
)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  inst_role user_role;
  inst_status profile_status;
begin
  if public._current_role() <> 'registrar'::user_role then
    raise exception 'only registrar may assign instructors';
  end if;

  if p_instructor_id is not null then
    select role, status into inst_role, inst_status
    from public.profiles where id = p_instructor_id;
    if inst_role is null or inst_role <> 'instructor'::user_role then
      raise exception 'target is not an instructor';
    end if;
    if inst_status <> 'active'::profile_status then
      raise exception 'instructor is not active';
    end if;
  end if;

  update public.classes set instructor_id = p_instructor_id where id = p_class_id;
  return 'ok';
end;
$$;

-- ---------------------------------------------------------------------------
-- Grants on new RPCs (functions self-check the caller's role)
-- ---------------------------------------------------------------------------
grant execute on function public.rpc_warn_user(uuid, text) to authenticated;
grant execute on function public.rpc_decide_application(uuid, app_status, text) to authenticated;
grant execute on function public.rpc_decide_graduation_application(uuid, grad_app_status, text) to authenticated;
grant execute on function public.rpc_resolve_complaint(uuid, uuid, text, text) to authenticated;
grant execute on function public.rpc_semester_gpa(uuid, uuid) to authenticated;
grant execute on function public.rpc_assign_instructor(uuid, uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- Optional starter data for required_courses (registrar can edit)
-- ---------------------------------------------------------------------------
insert into public.required_courses (course_code, title) values
  ('CS101', 'Introduction to Computer Science'),
  ('CS201', 'Data Structures'),
  ('MATH101', 'Calculus I'),
  ('ENG101', 'College Writing')
on conflict (course_code) do nothing;
