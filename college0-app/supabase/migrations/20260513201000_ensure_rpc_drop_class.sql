-- Ensures student drop RPC exists (some projects applied schema before student_features.sql).

create or replace function public.rpc_drop_class(p_enrollment_id uuid)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  e record;
  ph semester_phase;
begin
  select * into e from public.enrollments where id = p_enrollment_id;
  if not found then raise exception 'enrollment not found'; end if;
  if e.student_id <> auth.uid() then
    raise exception 'cannot drop another student''s enrollment';
  end if;
  if e.status = 'dropped'::enrollment_status then
    raise exception 'already dropped';
  end if;

  select s.phase into ph
  from public.classes c
  join public.semesters s on s.id = c.semester_id
  where c.id = e.class_id;

  if ph <> 'registration'::semester_phase then
    raise exception 'can only drop during the registration phase (current: %)', ph;
  end if;

  update public.enrollments
  set status = 'dropped'::enrollment_status
  where id = p_enrollment_id;
  return 'ok';
end;
$$;

grant execute on function public.rpc_drop_class(uuid) to authenticated;
