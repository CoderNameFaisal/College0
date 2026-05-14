-- Re-enrolling after drop: unique (student_id, class_id) keeps the dropped row, so INSERT
-- violates the constraint. Reactivate the existing row instead.

create or replace function public.rpc_enroll_in_class(p_class_id uuid)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  me uuid := auth.uid();
  r user_role;
  st profile_status;
  sem uuid;
  ph semester_phase;
  cnt int;
  enrolled_in_class int;
  max_st int;
  cancelled boolean;
  has_conflict boolean;
  target_course_code text;
  already_passed boolean;
  new_status enrollment_status;
begin
  select role, status into r, st from public.profiles where id = me;
  if r <> 'student'::user_role then
    raise exception 'only students may enroll';
  end if;
  if st <> 'active'::profile_status then
    raise exception 'account not active';
  end if;

  select c.semester_id, s.phase, c.max_students, c.is_cancelled, c.course_code
  into sem, ph, max_st, cancelled, target_course_code
  from public.classes c
  join public.semesters s on s.id = c.semester_id
  where c.id = p_class_id;

  if sem is null then
    raise exception 'class not found';
  end if;

  if cancelled then
    raise exception 'class cancelled';
  end if;

  if ph <> 'registration'::semester_phase then
    if not (select special_registration_eligible from public.profiles where id = me) then
      raise exception 'registration closed';
    end if;
  end if;

  select exists (
    select 1
    from public.enrollments e
    join public.classes c on c.id = e.class_id
    where e.student_id = me
      and c.course_code = target_course_code
      and e.status = 'enrolled'::enrollment_status
      and e.grade is not null
      and e.grade <> 'F'::grade_letter
  ) into already_passed;

  if already_passed then
    raise exception 'already passed % — courses can only be retaken after an F', target_course_code;
  end if;

  select count(*) into cnt
  from public.enrollments e
  join public.classes c on c.id = e.class_id
  where e.student_id = me
    and c.semester_id = sem
    and e.status in ('enrolled'::enrollment_status, 'waitlisted'::enrollment_status);

  if cnt >= 4 then
    raise exception 'at most 4 courses per semester';
  end if;

  select exists (
    select 1
    from public.enrollments e
    join public.classes c on c.id = e.class_id
    join public.classes c2 on c2.id = p_class_id
    where e.student_id = me
      and e.status in ('enrolled'::enrollment_status, 'waitlisted'::enrollment_status)
      and c.semester_id = c2.semester_id
      and c.id <> c2.id
      and public.classes_schedules_overlap(c.id, c2.id)
  ) into has_conflict;

  if has_conflict then
    raise exception 'schedule conflict';
  end if;

  if exists (
    select 1 from public.enrollments
    where student_id = me
      and class_id = p_class_id
      and status in ('enrolled'::enrollment_status, 'waitlisted'::enrollment_status)
  ) then
    raise exception 'already enrolled or waitlisted';
  end if;

  select count(*) into enrolled_in_class
  from public.enrollments
  where class_id = p_class_id and status = 'enrolled'::enrollment_status;

  new_status := case
    when enrolled_in_class < max_st then 'enrolled'::enrollment_status
    else 'waitlisted'::enrollment_status
  end;

  if exists (
    select 1 from public.enrollments
    where student_id = me
      and class_id = p_class_id
      and status = 'dropped'::enrollment_status
  ) then
    update public.enrollments
    set
      status = new_status,
      grade = null,
      enrolled_at = now()
    where student_id = me
      and class_id = p_class_id
      and status = 'dropped'::enrollment_status;
    return 'ok';
  end if;

  insert into public.enrollments (student_id, class_id, status)
  values (me, p_class_id, new_status);

  return 'ok';
end;
$$;
