-- During running phase: students must be enrolled in 2–4 courses (existing cap at enroll time).
-- If a student has exactly one "enrolled" row in that semester, issue one automatic warning (deduped per semester).

create or replace function public.apply_under_enrollment_warnings_for_student(p_student_id uuid, p_semester_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  ph semester_phase;
  cnt int;
  constant_reason text := 'Under-enrolled during running phase: fewer than 2 active enrollments (minimum 2, maximum 4 courses required).';
begin
  if p_student_id is null or p_semester_id is null then
    return;
  end if;

  if not exists (
    select 1 from public.profiles p
    where p.id = p_student_id and p.role = 'student'::user_role
  ) then
    return;
  end if;

  select s.phase into ph from public.semesters s where s.id = p_semester_id;
  if ph is null or ph <> 'running'::semester_phase then
    return;
  end if;

  select count(*)::int into cnt
  from public.enrollments e
  where e.student_id = p_student_id
    and e.semester_id = p_semester_id
    and e.status = 'enrolled'::enrollment_status;

  if cnt >= 2 then
    return;
  end if;

  if exists (
    select 1 from public.warnings w
    where w.target_id = p_student_id
      and w.semester_id = p_semester_id
      and not w.is_removed
      and w.reason = constant_reason
  ) then
    return;
  end if;

  insert into public.warnings (target_id, reason, issued_by, semester_id)
  values (p_student_id, constant_reason, null, p_semester_id);
end;
$$;

create or replace function public.apply_under_enrollment_warnings_for_semester(p_semester_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  r record;
begin
  for r in
    select e.student_id
    from public.enrollments e
    where e.semester_id = p_semester_id
      and e.status = 'enrolled'::enrollment_status
    group by e.student_id
    having count(*) < 2
  loop
    perform public.apply_under_enrollment_warnings_for_student(r.student_id, p_semester_id);
  end loop;
end;
$$;

create or replace function public.enrollments_after_under_enroll_warn()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'DELETE' then
    perform public.apply_under_enrollment_warnings_for_student(old.student_id, old.semester_id);
    return old;
  elsif tg_op = 'UPDATE' then
    if old.student_id is distinct from new.student_id or old.semester_id is distinct from new.semester_id then
      perform public.apply_under_enrollment_warnings_for_student(old.student_id, old.semester_id);
    end if;
    perform public.apply_under_enrollment_warnings_for_student(new.student_id, new.semester_id);
    return new;
  else
    perform public.apply_under_enrollment_warnings_for_student(new.student_id, new.semester_id);
    return new;
  end if;
end;
$$;

drop trigger if exists trg_enrollments_under_enroll_warn on public.enrollments;
create trigger trg_enrollments_under_enroll_warn
  after insert or delete or update of status, class_id, student_id, semester_id on public.enrollments
  for each row execute function public.enrollments_after_under_enroll_warn();

create or replace function public.semesters_warn_under_enrolled_on_running()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.phase <> 'running'::semester_phase then
    return new;
  end if;
  if tg_op = 'INSERT' then
    perform public.apply_under_enrollment_warnings_for_semester(new.id);
  elsif old.phase is distinct from new.phase then
    perform public.apply_under_enrollment_warnings_for_semester(new.id);
  end if;
  return new;
end;
$$;

drop trigger if exists trg_semesters_under_enroll_warn on public.semesters;
create trigger trg_semesters_under_enroll_warn
  after insert or update of phase on public.semesters
  for each row execute function public.semesters_warn_under_enrolled_on_running();
