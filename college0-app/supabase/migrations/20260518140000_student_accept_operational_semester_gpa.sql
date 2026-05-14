-- Student application auto-accept / reject overrides:
-- Use operational semester (registration | running | grading) for quota, not registration-only.
-- GPA threshold: prior_gpa >= 3.0 (was > 3.0).
-- Service-only RPCs for Edge: resolve Auth user by email; promote visitor → student (bypasses role-immutable trigger).

-- ---------------------------------------------------------------------------
create or replace function public._admin_auth_user_id_by_email(p_email text)
returns uuid
language sql
stable
security definer
set search_path = public, auth
as $$
  select u.id
  from auth.users u
  where p_email is not null
    and length(trim(p_email)) > 0
    and lower(u.email) = lower(trim(p_email))
  limit 1;
$$;

revoke all on function public._admin_auth_user_id_by_email(text) from public;
grant execute on function public._admin_auth_user_id_by_email(text) to service_role;

-- ---------------------------------------------------------------------------
create or replace function public._admin_promote_visitor_to_student(p_user_id uuid, p_full_name text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  r user_role;
begin
  select role into r from public.profiles where id = p_user_id;
  if not found then
    raise exception 'profile not found';
  end if;
  if r = 'student'::user_role then
    return;
  end if;
  if r <> 'visitor'::user_role then
    raise exception 'only visitor accounts can be promoted to student via application acceptance';
  end if;

  alter table public.profiles disable trigger trg_profiles_role_immutable;

  update public.profiles
  set role = 'student'::user_role,
      full_name = case
        when p_full_name is not null and length(trim(p_full_name)) > 0 then trim(p_full_name)
        else full_name
      end,
      status = 'active'::profile_status
  where id = p_user_id;

  alter table public.profiles enable trigger trg_profiles_role_immutable;
end;
$$;

revoke all on function public._admin_promote_visitor_to_student(uuid, text) from public;
grant execute on function public._admin_promote_visitor_to_student(uuid, text) to service_role;

-- ---------------------------------------------------------------------------
-- rpc_decide_application: align auto-rule with Edge accept-student-application
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
  op_sem_id uuid;
  sem_quota int;
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

  if app.role_requested = 'instructor'::app_role_requested and p_status = 'accepted'::app_status then
    raise exception 'Instructor acceptance must use the accept-student-application Edge Function (Registrar → Applications → Accept). Do not call rpc_decide_application with status accepted for instructor rows.';
  end if;

  if app.role_requested = 'student'::app_role_requested then
    op_sem_id := public._operational_semester_id();

    if op_sem_id is not null then
      select s.quota into sem_quota from public.semesters s where s.id = op_sem_id;
      if sem_quota is null then
        sem_quota := 0;
      end if;

      select count(*) into active_students
      from public.profiles
      where role = 'student'::user_role and status = 'active'::profile_status;

      must_accept := app.prior_gpa is not null
                     and app.prior_gpa >= 3.0
                     and active_students < sem_quota;

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
