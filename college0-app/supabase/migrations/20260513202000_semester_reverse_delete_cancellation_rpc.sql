-- 1) Semester phase: allow moving exactly one step forward or backward (registrar only).
-- 2) Semester delete: setup phase only, and no classes for that semester.
-- 3) Course cancellation scan as RPC (same behavior as Edge function; callable from the app).

create or replace function public.rpc_transition_semester_phase(
  p_semester_id uuid,
  p_next_phase semester_phase
)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  cur semester_phase;
  ord int;
  nord int;
begin
  if public._current_role() <> 'registrar'::user_role then
    raise exception 'only registrar may change phase';
  end if;

  select phase into cur from public.semesters where id = p_semester_id;
  if not found then
    raise exception 'semester not found';
  end if;

  ord := array_position(
    array['setup'::semester_phase, 'registration', 'running', 'grading', 'closed'],
    cur
  );
  nord := array_position(
    array['setup'::semester_phase, 'registration', 'running', 'grading', 'closed'],
    p_next_phase
  );

  if nord is null or ord is null then
    raise exception 'invalid phase';
  end if;

  if abs(nord - ord) <> 1 then
    raise exception 'invalid phase transition';
  end if;

  update public.semesters set phase = p_next_phase where id = p_semester_id;
  return 'ok';
end;
$$;

create or replace function public.rpc_delete_semester(p_semester_id uuid)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  ph semester_phase;
begin
  if public._current_role() <> 'registrar'::user_role then
    raise exception 'only registrar may delete a semester';
  end if;

  select phase into ph from public.semesters where id = p_semester_id;
  if not found then
    raise exception 'semester not found';
  end if;

  if ph <> 'setup'::semester_phase then
    raise exception 'only semesters in setup phase may be deleted';
  end if;

  if exists (select 1 from public.classes c where c.semester_id = p_semester_id) then
    raise exception 'remove all classes for this semester before deleting it';
  end if;

  delete from public.semesters where id = p_semester_id;
  return 'ok';
end;
$$;

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
begin
  if public._current_role() <> 'registrar'::user_role then
    raise exception 'only registrars may run cancellation scan';
  end if;

  for r in
    select c.id, c.course_code
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
    end if;
  end loop;

  return jsonb_build_object('ok', true, 'cancelled', to_jsonb(cancelled));
end;
$$;

grant execute on function public.rpc_delete_semester(uuid) to authenticated;
grant execute on function public.rpc_course_cancellation_scan() to authenticated;
