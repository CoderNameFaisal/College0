-- Students need to read instructor names for catalog rows (classes embed) and for their own enrollments.
-- Without this, PostgREST can return no rows or strip class rows when the nested profiles select is denied.

drop policy if exists profiles_select_student_visible_instructors on public.profiles;

create policy profiles_select_student_visible_instructors on public.profiles
  for select using (
    public._current_role() = 'student'::user_role
    and role = 'instructor'::user_role
    and (
      exists (
        select 1
        from public.classes c
        join public.semesters s on s.id = c.semester_id
        where c.instructor_id = profiles.id
          and c.is_cancelled = false
          and s.phase in (
            'registration'::semester_phase,
            'running'::semester_phase,
            'grading'::semester_phase
          )
      )
      or exists (
        select 1
        from public.enrollments e
        join public.classes c on c.id = e.class_id
        where e.student_id = auth.uid()
          and e.status in ('enrolled'::enrollment_status, 'waitlisted'::enrollment_status)
          and c.instructor_id = profiles.id
      )
    )
  );
