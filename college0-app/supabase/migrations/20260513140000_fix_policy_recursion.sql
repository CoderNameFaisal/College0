-- Fix RLS recursion: replace inline `exists (select 1 from public.profiles ...)`
-- subqueries inside policies with calls to the existing SECURITY DEFINER helper
-- `public._current_role()`. The inline pattern recurses because the inner
-- profiles SELECT re-evaluates `profiles_select_own`, which itself contains the
-- same subquery against `profiles`.
--
-- This migration also marks the new trigger functions added in
-- 20260513130000_registrar_features.sql as SECURITY DEFINER so they can
-- read/write `profiles` from inside the trigger without re-triggering RLS.

-- Make sure _current_role() is callable from policy context (it's STABLE +
-- SECURITY DEFINER so it bypasses RLS on its inner SELECT).
grant execute on function public._current_role() to anon, authenticated;

-- ---------------------------------------------------------------------------
-- profiles
-- ---------------------------------------------------------------------------
drop policy if exists profiles_select_own on public.profiles;
create policy profiles_select_own on public.profiles
  for select using (
    id = auth.uid()
    or public._current_role() = 'registrar'::user_role
    or (
      public._current_role() = 'visitor'::user_role
      and role in ('instructor'::user_role, 'student'::user_role)
    )
    or (
      auth.uid() is null
      and role = 'student'::user_role
      and status = 'active'::profile_status
      and cumulative_gpa is not null
    )
  );

drop policy if exists profiles_update_own on public.profiles;
create policy profiles_update_own on public.profiles
  for update using (
    id = auth.uid()
    or public._current_role() = 'registrar'::user_role
  );

drop policy if exists profiles_insert_registrar on public.profiles;
create policy profiles_insert_registrar on public.profiles
  for insert with check (public._current_role() = 'registrar'::user_role);

-- ---------------------------------------------------------------------------
-- semesters
-- ---------------------------------------------------------------------------
drop policy if exists semesters_write on public.semesters;
create policy semesters_write on public.semesters
  for all using (public._current_role() = 'registrar'::user_role);

-- ---------------------------------------------------------------------------
-- classes
-- ---------------------------------------------------------------------------
drop policy if exists classes_write on public.classes;
create policy classes_write on public.classes
  for all using (public._current_role() = 'registrar'::user_role);

-- ---------------------------------------------------------------------------
-- enrollments
-- ---------------------------------------------------------------------------
drop policy if exists enrollments_select on public.enrollments;
create policy enrollments_select on public.enrollments
  for select using (
    student_id = auth.uid()
    or public._current_role() = 'registrar'::user_role
    or exists (
      select 1 from public.classes c
      where c.id = enrollments.class_id and c.instructor_id = auth.uid()
    )
  );

drop policy if exists enrollments_update on public.enrollments;
create policy enrollments_update on public.enrollments
  for update using (
    public._current_role() = 'registrar'::user_role
    or exists (
      select 1 from public.classes c
      where c.id = enrollments.class_id and c.instructor_id = auth.uid()
    )
  );

-- ---------------------------------------------------------------------------
-- applications
-- ---------------------------------------------------------------------------
drop policy if exists applications_select on public.applications;
create policy applications_select on public.applications
  for select using (public._current_role() = 'registrar'::user_role);

drop policy if exists applications_update on public.applications;
create policy applications_update on public.applications
  for update using (public._current_role() = 'registrar'::user_role);

-- ---------------------------------------------------------------------------
-- reviews
-- ---------------------------------------------------------------------------
drop policy if exists reviews_select on public.reviews;
create policy reviews_select on public.reviews
  for select using (
    author_id = auth.uid()
    or public._current_role() = 'registrar'::user_role
    or exists (
      select 1 from public.classes c
      where c.id = reviews.class_id and c.instructor_id = auth.uid()
    )
  );

drop policy if exists reviews_insert_student on public.reviews;
create policy reviews_insert_student on public.reviews
  for insert with check (
    public._current_role() = 'student'::user_role
    and author_id = auth.uid()
  );

-- ---------------------------------------------------------------------------
-- warnings
-- ---------------------------------------------------------------------------
drop policy if exists warnings_select on public.warnings;
create policy warnings_select on public.warnings
  for select using (
    target_id = auth.uid()
    or public._current_role() = 'registrar'::user_role
  );

drop policy if exists warnings_write on public.warnings;
create policy warnings_write on public.warnings
  for all using (public._current_role() = 'registrar'::user_role);

-- ---------------------------------------------------------------------------
-- complaints
-- ---------------------------------------------------------------------------
drop policy if exists complaints_select on public.complaints;
create policy complaints_select on public.complaints
  for select using (
    filed_by = auth.uid()
    or against = auth.uid()
    or public._current_role() = 'registrar'::user_role
  );

drop policy if exists complaints_update on public.complaints;
create policy complaints_update on public.complaints
  for update using (public._current_role() = 'registrar'::user_role);

-- ---------------------------------------------------------------------------
-- graduation_applications
-- ---------------------------------------------------------------------------
drop policy if exists grad_select on public.graduation_applications;
create policy grad_select on public.graduation_applications
  for select using (
    student_id = auth.uid()
    or public._current_role() = 'registrar'::user_role
  );

drop policy if exists grad_update on public.graduation_applications;
create policy grad_update on public.graduation_applications
  for update using (public._current_role() = 'registrar'::user_role);

-- ---------------------------------------------------------------------------
-- study_groups
-- ---------------------------------------------------------------------------
drop policy if exists sg_write on public.study_groups;
create policy sg_write on public.study_groups
  for all using (public._current_role() = 'registrar'::user_role);

-- ---------------------------------------------------------------------------
-- taboo_words
-- ---------------------------------------------------------------------------
drop policy if exists taboo_write on public.taboo_words;
create policy taboo_write on public.taboo_words
  for all using (public._current_role() = 'registrar'::user_role);

-- ---------------------------------------------------------------------------
-- audit_log
-- ---------------------------------------------------------------------------
drop policy if exists audit_select on public.audit_log;
create policy audit_select on public.audit_log
  for select using (public._current_role() = 'registrar'::user_role);

drop policy if exists audit_insert on public.audit_log;
create policy audit_insert on public.audit_log
  for insert with check (public._current_role() = 'registrar'::user_role);

-- ---------------------------------------------------------------------------
-- fines (added in 20260513130000)
-- ---------------------------------------------------------------------------
drop policy if exists fines_select on public.fines;
create policy fines_select on public.fines
  for select using (
    student_id = auth.uid()
    or public._current_role() = 'registrar'::user_role
  );

drop policy if exists fines_write on public.fines;
create policy fines_write on public.fines
  for all using (public._current_role() = 'registrar'::user_role);

-- ---------------------------------------------------------------------------
-- required_courses (added in 20260513130000)
-- ---------------------------------------------------------------------------
drop policy if exists required_courses_write on public.required_courses;
create policy required_courses_write on public.required_courses
  for all using (public._current_role() = 'registrar'::user_role);

-- ---------------------------------------------------------------------------
-- Promote registrar-feature trigger functions to SECURITY DEFINER so writes
-- to public.profiles from inside these triggers don't re-enter RLS.
-- ---------------------------------------------------------------------------
create or replace function public.recalc_warning_count()
returns trigger
language plpgsql
security definer
set search_path = public
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

  if cnt >= 3 and cur_status = 'active'::profile_status then
    update public.profiles set status = 'suspended'::profile_status where id = tgt;

    if cur_role = 'student'::user_role then
      sem_id := coalesce(new.semester_id, old.semester_id);
      if sem_id is null then
        select id into sem_id from public.semesters
        where phase <> 'closed'::semester_phase
        order by created_at desc limit 1;
      end if;
      insert into public.fines (student_id, amount, reason, semester_id)
      values (tgt, 500.00, 'Suspension fine: 3 warnings accumulated', sem_id);
    end if;
  end if;

  return coalesce(new, old);
end;
$$;

create or replace function public.enrollment_failed_twice()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  ccode text;
  fail_n int;
begin
  if new.grade = 'F'::grade_letter and (old.grade is null or old.grade <> 'F'::grade_letter) then
    select c.course_code into ccode from public.classes c where c.id = new.class_id;

    select count(*) into fail_n
    from public.enrollments e
    join public.classes c on c.id = e.class_id
    where e.student_id = new.student_id
      and c.course_code = ccode
      and e.grade = 'F'::grade_letter;

    if fail_n >= 2 then
      update public.profiles
      set status = 'terminated'::profile_status
      where id = new.student_id and status = 'active'::profile_status;
    end if;
  end if;
  return new;
end;
$$;

create or replace function public.set_enrollment_semester()
returns trigger
language plpgsql
security definer
set search_path = public
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
