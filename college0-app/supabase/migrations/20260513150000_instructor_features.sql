-- Instructor dashboard support:
-- 1. Block review submission once a grade has been posted for that student/class.
-- 2. Prevent grade UPDATE outside the Grading phase (defense-in-depth for
--    direct UPDATEs that bypass rpc_post_grade — also catches the registrar
--    if they edit enrollments directly during the wrong phase).
-- 3. RPCs for instructor waitlist management (capacity-aware promotion + reject).

-- ---------------------------------------------------------------------------
-- 1. Reviews are locked after grading: extend the insert policy
-- ---------------------------------------------------------------------------
drop policy if exists reviews_insert_student on public.reviews;
create policy reviews_insert_student on public.reviews
  for insert with check (
    public._current_role() = 'student'::user_role
    and author_id = auth.uid()
    and not exists (
      select 1 from public.enrollments e
      where e.student_id = author_id
        and e.class_id = class_id
        and e.grade is not null
    )
  );

-- ---------------------------------------------------------------------------
-- 2. Enforce: grades can only be posted during the Grading phase
-- ---------------------------------------------------------------------------
create or replace function public.enforce_grade_phase()
returns trigger
language plpgsql
as $$
declare
  ph semester_phase;
begin
  -- Only check when the grade column itself is changing
  if new.grade is distinct from old.grade then
    select s.phase into ph
    from public.classes c
    join public.semesters s on s.id = c.semester_id
    where c.id = new.class_id;

    if ph <> 'grading'::semester_phase and public._current_role() <> 'registrar'::user_role then
      raise exception 'grades can only be posted during the grading phase (current phase: %)', ph;
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_enforce_grade_phase on public.enrollments;
create trigger trg_enforce_grade_phase
  before update of grade on public.enrollments
  for each row execute function public.enforce_grade_phase();

-- ---------------------------------------------------------------------------
-- 3. Waitlist promotion / rejection RPCs (instructor-only, capacity-aware)
-- ---------------------------------------------------------------------------
create or replace function public.rpc_promote_waitlist(p_enrollment_id uuid)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  e record;
  cls record;
  enrolled_n int;
begin
  select * into e from public.enrollments where id = p_enrollment_id;
  if not found then raise exception 'enrollment not found'; end if;
  if e.status <> 'waitlisted'::enrollment_status then
    raise exception 'enrollment is not waitlisted (status: %)', e.status;
  end if;

  select c.id, c.instructor_id, c.max_students, c.is_cancelled, s.phase
  into cls
  from public.classes c
  join public.semesters s on s.id = c.semester_id
  where c.id = e.class_id;

  if cls.is_cancelled then raise exception 'class is cancelled'; end if;

  if public._current_role() <> 'registrar'::user_role and cls.instructor_id <> auth.uid() then
    raise exception 'only the class instructor or registrar may promote waitlist';
  end if;

  select count(*) into enrolled_n
  from public.enrollments
  where class_id = e.class_id and status = 'enrolled'::enrollment_status;

  if enrolled_n >= cls.max_students then
    raise exception 'class is full (max %)', cls.max_students;
  end if;

  update public.enrollments
  set status = 'enrolled'::enrollment_status
  where id = p_enrollment_id;
  return 'ok';
end;
$$;

create or replace function public.rpc_reject_waitlist(p_enrollment_id uuid)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  e record;
  cls record;
begin
  select * into e from public.enrollments where id = p_enrollment_id;
  if not found then raise exception 'enrollment not found'; end if;
  if e.status <> 'waitlisted'::enrollment_status then
    raise exception 'enrollment is not waitlisted (status: %)', e.status;
  end if;

  select c.instructor_id into cls
  from public.classes c
  where c.id = e.class_id;

  if public._current_role() <> 'registrar'::user_role and cls.instructor_id <> auth.uid() then
    raise exception 'only the class instructor or registrar may reject waitlist';
  end if;

  update public.enrollments
  set status = 'dropped'::enrollment_status
  where id = p_enrollment_id;
  return 'ok';
end;
$$;

grant execute on function public.rpc_promote_waitlist(uuid) to authenticated;
grant execute on function public.rpc_reject_waitlist(uuid) to authenticated;
