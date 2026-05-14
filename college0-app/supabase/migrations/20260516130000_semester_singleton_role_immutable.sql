-- 1) At most one semester in registration / running / grading at a time (enforced on phase transition).
-- 2) Helper for "operational" semester id (used by triggers / RPCs).
-- 3) profiles.role immutable on UPDATE (set only at insert via handle_new_user).
-- 4) RPCs that attached warnings/fines to "any non-closed semester" now use operational semester only.

create or replace function public._operational_semester_id()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select s.id
  from public.semesters s
  where s.phase in (
    'registration'::semester_phase,
    'running'::semester_phase,
    'grading'::semester_phase
  )
  order by s.created_at desc
  limit 1;
$$;

revoke all on function public._operational_semester_id() from public;

-- ---------------------------------------------------------------------------
-- Phase transition: block advancing into registration/running/grading if another semester is already there.
-- ---------------------------------------------------------------------------
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

  if p_next_phase in (
    'registration'::semester_phase,
    'running'::semester_phase,
    'grading'::semester_phase
  ) then
    if exists (
      select 1
      from public.semesters s
      where s.id <> p_semester_id
        and s.phase in (
          'registration'::semester_phase,
          'running'::semester_phase,
          'grading'::semester_phase
        )
    ) then
      raise exception
        'Another semester is already in registration, running, or grading. Move that semester back to setup or to closed before advancing this one.';
    end if;
  end if;

  update public.semesters set phase = p_next_phase where id = p_semester_id;
  return 'ok';
end;
$$;

-- ---------------------------------------------------------------------------
create or replace function public.rpc_warn_user(
  p_target_id uuid,
  p_reason text
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  cur_sem uuid;
  new_id uuid;
begin
  if public._current_role() <> 'registrar'::user_role then
    raise exception 'only registrar may warn';
  end if;
  if p_target_id is null then
    raise exception 'target required';
  end if;
  if p_reason is null or trim(p_reason) = '' then
    raise exception 'reason required';
  end if;

  cur_sem := public._operational_semester_id();

  insert into public.warnings (target_id, reason, issued_by, semester_id)
  values (p_target_id, p_reason, auth.uid(), cur_sem)
  returning id into new_id;

  return new_id;
end;
$$;

-- ---------------------------------------------------------------------------
-- Student application auto-rule uses the semester currently in registration (quota).
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
  cur_sem record;
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
    raise exception 'Instructor acceptance creates an auth user via the accept-instructor-application Edge Function. Use the Registrar UI Accept button.';
  end if;

  if app.role_requested = 'student'::app_role_requested then
    select * into cur_sem
    from public.semesters
    where phase = 'registration'::semester_phase
    order by created_at desc limit 1;

    if cur_sem.id is not null then
      select count(*) into active_students
      from public.profiles
      where role = 'student'::user_role and status = 'active'::profile_status;

      must_accept := app.prior_gpa is not null
                     and app.prior_gpa > 3.0
                     and active_students < cur_sem.quota;

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

-- ---------------------------------------------------------------------------
create or replace function public.rpc_resolve_complaint(
  p_complaint_id uuid,
  p_warn_target_id uuid,
  p_reason text default null,
  p_resolution text default null
)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  c record;
  filer_role user_role;
  cur_sem uuid;
begin
  if public._current_role() <> 'registrar'::user_role then
    raise exception 'only registrar may resolve complaints';
  end if;

  select * into c from public.complaints where id = p_complaint_id;
  if not found then
    raise exception 'complaint not found';
  end if;
  if c.status <> 'open'::complaint_status then
    raise exception 'complaint already resolved';
  end if;

  select role into filer_role from public.profiles where id = c.filed_by;

  if filer_role = 'instructor'::user_role and p_warn_target_id is null then
    raise exception 'instructor complaints require a warning action';
  end if;

  if p_warn_target_id is not null
     and p_warn_target_id <> c.filed_by
     and p_warn_target_id <> c.against then
    raise exception 'warning target must be the complainant or the accused';
  end if;

  if p_warn_target_id is not null then
    if p_reason is null or trim(p_reason) = '' then
      raise exception 'reason required when issuing a warning';
    end if;

    cur_sem := public._operational_semester_id();

    insert into public.warnings (target_id, reason, issued_by, semester_id)
    values (p_warn_target_id, p_reason, auth.uid(), cur_sem);
  end if;

  update public.complaints
  set status = 'resolved'::complaint_status,
      resolution = coalesce(p_resolution, p_reason, 'Resolved by registrar')
  where id = p_complaint_id;

  return 'ok';
end;
$$;

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
        sem_id := public._operational_semester_id();
      end if;
      insert into public.fines (student_id, amount, reason, semester_id)
      values (tgt, 500.00, 'Suspension fine: 3 warnings accumulated', sem_id);
    end if;
  end if;

  return coalesce(new, old);
end;
$$;

-- ---------------------------------------------------------------------------
-- profiles.role immutable (Account UI is read-only; block tampered API calls).
-- ---------------------------------------------------------------------------
create or replace function public.profiles_role_immutable()
returns trigger
language plpgsql
as $$
begin
  if new.role is distinct from old.role then
    raise exception 'User role cannot be changed after the account is created.';
  end if;
  return new;
end;
$$;

drop trigger if exists trg_profiles_role_immutable on public.profiles;
create trigger trg_profiles_role_immutable
  before update on public.profiles
  for each row
  execute function public.profiles_role_immutable();
