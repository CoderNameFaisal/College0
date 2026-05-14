-- Recurring meeting schedule: weekdays (ISO 1=Mon..7=Sun), daily period (time),
-- course instruction date span. Replaces naive tsrange && for enrollment conflicts.

alter table public.classes
  add column if not exists course_start_date date,
  add column if not exists course_end_date date,
  add column if not exists meeting_days smallint[],
  add column if not exists period_start time,
  add column if not exists period_end time;

update public.classes
set
  course_start_date = coalesce(course_start_date, lower(schedule_time)::date),
  course_end_date = coalesce(
    course_end_date,
    greatest(lower(schedule_time)::date, upper(schedule_time)::date)
  ),
  period_start = coalesce(period_start, lower(schedule_time)::time),
  period_end = coalesce(period_end, upper(schedule_time)::time),
  meeting_days = coalesce(
    meeting_days,
    array[(extract(isodow from lower(schedule_time)::timestamp))::smallint]
  )
where course_start_date is null
   or course_end_date is null
   or period_start is null
   or period_end is null
   or meeting_days is null;

alter table public.classes
  alter column course_start_date set not null,
  alter column course_end_date set not null,
  alter column meeting_days set not null,
  alter column period_start set not null,
  alter column period_end set not null;

-- Idempotent: safe if re-run from SQL editor after a partial apply.
alter table public.classes drop constraint if exists classes_course_dates_chk;
alter table public.classes drop constraint if exists classes_period_chk;
alter table public.classes drop constraint if exists classes_meeting_days_chk;

alter table public.classes
  add constraint classes_course_dates_chk check (course_end_date >= course_start_date),
  add constraint classes_period_chk check (period_end > period_start),
  add constraint classes_meeting_days_chk check (
    cardinality(meeting_days) >= 1
    and meeting_days <@ array[1, 2, 3, 4, 5, 6, 7]::smallint[]
  );

create or replace function public.classes_schedules_overlap(c1_id uuid, c2_id uuid)
returns boolean
language plpgsql
stable
set search_path = public
as $$
declare
  d date;
  d1_lo date;
  d1_hi date;
  d2_lo date;
  d2_hi date;
  days1 smallint[];
  days2 smallint[];
  t1s time;
  t1e time;
  t2s time;
  t2e time;
  lo date;
  hi date;
  dow int;
begin
  select course_start_date, course_end_date, meeting_days, period_start, period_end
  into d1_lo, d1_hi, days1, t1s, t1e
  from public.classes
  where id = c1_id;

  select course_start_date, course_end_date, meeting_days, period_start, period_end
  into d2_lo, d2_hi, days2, t2s, t2e
  from public.classes
  where id = c2_id;

  if d1_lo is null or d2_lo is null then
    return false;
  end if;

  lo := greatest(d1_lo, d2_lo);
  hi := least(d1_hi, d2_hi);
  if lo > hi then
    return false;
  end if;

  d := lo;
  while d <= hi loop
    dow := extract(isodow from d)::int;
    if dow = any (days1) and dow = any (days2) then
      if t1s < t2e and t2s < t1e then
        return true;
      end if;
    end if;
    d := d + 1;
  end loop;

  return false;
end;
$$;

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

  insert into public.enrollments (student_id, class_id, status)
  values (
    me,
    p_class_id,
    case
      when enrolled_in_class < max_st then 'enrolled'::enrollment_status
      else 'waitlisted'::enrollment_status
    end
  );

  return 'ok';
end;
$$;
