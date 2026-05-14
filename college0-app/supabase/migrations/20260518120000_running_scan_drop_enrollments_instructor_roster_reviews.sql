-- 1) Running-phase low-enrollment scan: only classes in semesters with phase = running;
--    cancel class, flag special registration, drop affected enrollments, warn students.
-- 2) Instructors may SELECT student profiles for students enrolled/waitlisted in their classes
--    (grading + complaints roster embeds).
-- 3) Instructors cannot SELECT hidden reviews (severe taboo); authors and registrars unchanged.

-- ---------------------------------------------------------------------------
-- profiles: instructor roster
-- ---------------------------------------------------------------------------
drop policy if exists profiles_select_instructor_roster_students on public.profiles;

create policy profiles_select_instructor_roster_students on public.profiles
  for select using (
    public._current_role() = 'instructor'::user_role
    and profiles.role = 'student'::user_role
    and exists (
      select 1
      from public.enrollments e
      join public.classes c on c.id = e.class_id
      where e.student_id = profiles.id
        and c.instructor_id = auth.uid()
        and e.status in ('enrolled'::enrollment_status, 'waitlisted'::enrollment_status)
    )
  );

-- ---------------------------------------------------------------------------
-- reviews: instructors do not see hidden (severe taboo) reviews
-- ---------------------------------------------------------------------------
drop policy if exists reviews_select on public.reviews;

create policy reviews_select on public.reviews
  for select using (
    author_id = auth.uid()
    or public._current_role() = 'registrar'::user_role
    or (
      exists (
        select 1
        from public.classes c
        where c.id = reviews.class_id
          and c.instructor_id = auth.uid()
      )
      and not coalesce(reviews.is_hidden, false)
    )
  );

-- ---------------------------------------------------------------------------
-- rpc_course_cancellation_scan (replace)
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
  stu_warn text;
  sid uuid;
begin
  if public._current_role() <> 'registrar'::user_role then
    raise exception 'only registrars may run cancellation scan';
  end if;

  for r in
    select c.id, c.course_code, c.instructor_id, c.semester_id
    from public.classes c
    join public.semesters s on s.id = c.semester_id
    where not c.is_cancelled
      and s.phase = 'running'::semester_phase
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

      stu_warn := format(
        'Your enrollment in %s was removed: the class was cancelled during the running phase (fewer than 3 students). You may use special registration to enroll in other open classes.',
        r.course_code
      );

      for sid in
        select distinct e.student_id
        from public.enrollments e
        where e.class_id = r.id
          and e.status in ('enrolled'::enrollment_status, 'waitlisted'::enrollment_status)
      loop
        if not exists (
          select 1
          from public.warnings w
          where w.target_id = sid
            and not w.is_removed
            and w.reason = stu_warn
        ) then
          insert into public.warnings (target_id, reason, issued_by, semester_id)
          values (sid, stu_warn, null, r.semester_id);
        end if;
      end loop;

      update public.enrollments e
      set status = 'dropped'::enrollment_status
      where e.class_id = r.id
        and e.status in ('enrolled'::enrollment_status, 'waitlisted'::enrollment_status);

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
