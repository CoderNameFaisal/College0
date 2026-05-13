-- College0 schema: PostgreSQL 15 + pgvector (run after enabling "vector" extension in Dashboard)

create extension if not exists "uuid-ossp";
create extension if not exists vector;

-- ---------------------------------------------------------------------------
-- Enums
-- ---------------------------------------------------------------------------
do $$ begin
  create type user_role as enum ('registrar', 'instructor', 'student', 'visitor');
exception when duplicate_object then null; end $$;

do $$ begin
  create type profile_status as enum ('active', 'suspended', 'terminated', 'graduated');
exception when duplicate_object then null; end $$;

do $$ begin
  create type semester_phase as enum ('setup', 'registration', 'running', 'grading', 'closed');
exception when duplicate_object then null; end $$;

do $$ begin
  create type enrollment_status as enum ('enrolled', 'waitlisted', 'dropped');
exception when duplicate_object then null; end $$;

do $$ begin
  create type grade_letter as enum ('A', 'B', 'C', 'D', 'F');
exception when duplicate_object then null; end $$;

do $$ begin
  create type app_role_requested as enum ('student', 'instructor');
exception when duplicate_object then null; end $$;

do $$ begin
  create type app_status as enum ('pending', 'accepted', 'rejected');
exception when duplicate_object then null; end $$;

do $$ begin
  create type complaint_status as enum ('open', 'resolved');
exception when duplicate_object then null; end $$;

do $$ begin
  create type grad_app_status as enum ('pending', 'approved', 'rejected');
exception when duplicate_object then null; end $$;

-- ---------------------------------------------------------------------------
-- updated_at
-- ---------------------------------------------------------------------------
create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- profiles
-- ---------------------------------------------------------------------------
create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  role user_role not null default 'student',
  full_name text not null,
  student_id text unique,
  status profile_status not null default 'active',
  warning_count int not null default 0 check (warning_count >= 0),
  cumulative_gpa numeric(3,2),
  honor_roll_count int not null default 0,
  first_login boolean not null default true,
  special_registration_eligible boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

drop trigger if exists trg_profiles_updated on public.profiles;
create trigger trg_profiles_updated
  before update on public.profiles
  for each row execute function public.set_updated_at();

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  r user_role;
begin
  r := case coalesce(new.raw_user_meta_data->>'role', 'student')
    when 'registrar' then 'registrar'::user_role
    when 'instructor' then 'instructor'::user_role
    when 'visitor' then 'visitor'::user_role
    when 'student' then 'student'::user_role
    else 'student'::user_role
  end;

  insert into public.profiles (id, full_name, role)
  values (
    new.id,
    coalesce(nullif(trim(new.raw_user_meta_data->>'full_name'), ''), 'New user'),
    r
  );
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------------------------------------------------------------------------
-- semesters, classes, enrollments
-- ---------------------------------------------------------------------------
create table if not exists public.semesters (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  phase semester_phase not null default 'setup',
  quota int not null check (quota > 0),
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

drop trigger if exists trg_semesters_updated on public.semesters;
create trigger trg_semesters_updated
  before update on public.semesters
  for each row execute function public.set_updated_at();

create table if not exists public.classes (
  id uuid primary key default gen_random_uuid(),
  semester_id uuid not null references public.semesters (id) on delete cascade,
  course_code text not null,
  title text not null,
  instructor_id uuid references public.profiles (id) on delete set null,
  schedule_time tsrange not null,
  max_students int not null check (max_students > 0),
  avg_rating numeric(3,2),
  is_cancelled boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (semester_id, course_code)
);

drop trigger if exists trg_classes_updated on public.classes;
create trigger trg_classes_updated
  before update on public.classes
  for each row execute function public.set_updated_at();

create table if not exists public.enrollments (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references public.profiles (id) on delete cascade,
  class_id uuid not null references public.classes (id) on delete cascade,
  status enrollment_status not null default 'enrolled',
  grade grade_letter,
  enrolled_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (student_id, class_id)
);

drop trigger if exists trg_enrollments_updated on public.enrollments;
create trigger trg_enrollments_updated
  before update on public.enrollments
  for each row execute function public.set_updated_at();

-- Maintain avg_rating on classes from non-hidden reviews
create or replace function public.recalc_class_avg_rating()
returns trigger
language plpgsql
as $$
declare
  cid uuid;
begin
  cid := coalesce(new.class_id, old.class_id);
  update public.classes c
  set avg_rating = (
    select round(avg(r.stars)::numeric, 2)
    from public.reviews r
    where r.class_id = cid and not coalesce(r.is_hidden, false)
  )
  where c.id = cid;
  return coalesce(new, old);
end;
$$;

-- ---------------------------------------------------------------------------
-- applications, reviews, warnings, complaints, graduation, study_groups
-- ---------------------------------------------------------------------------
create table if not exists public.applications (
  id uuid primary key default gen_random_uuid(),
  applicant_email text not null,
  role_requested app_role_requested not null,
  prior_gpa numeric(3,2),
  status app_status not null default 'pending',
  rejection_reason text,
  reviewed_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

drop trigger if exists trg_applications_updated on public.applications;
create trigger trg_applications_updated
  before update on public.applications
  for each row execute function public.set_updated_at();

create table if not exists public.reviews (
  id uuid primary key default gen_random_uuid(),
  class_id uuid not null references public.classes (id) on delete cascade,
  author_id uuid not null references public.profiles (id) on delete cascade,
  stars int not null check (stars between 1 and 5),
  body text not null,
  filtered_body text,
  is_hidden boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

drop trigger if exists trg_reviews_updated on public.reviews;
create trigger trg_reviews_updated
  before update on public.reviews
  for each row execute function public.set_updated_at();

create trigger trg_reviews_avg
  after insert or update or delete on public.reviews
  for each row execute function public.recalc_class_avg_rating();

create table if not exists public.warnings (
  id uuid primary key default gen_random_uuid(),
  target_id uuid not null references public.profiles (id) on delete cascade,
  reason text not null,
  issued_by uuid references public.profiles (id) on delete set null,
  semester_id uuid references public.semesters (id) on delete set null,
  is_removed boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

drop trigger if exists trg_warnings_updated on public.warnings;
create trigger trg_warnings_updated
  before update on public.warnings
  for each row execute function public.set_updated_at();

create table if not exists public.complaints (
  id uuid primary key default gen_random_uuid(),
  filed_by uuid not null references public.profiles (id) on delete cascade,
  against uuid not null references public.profiles (id) on delete cascade,
  description text not null,
  resolution text,
  status complaint_status not null default 'open',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

drop trigger if exists trg_complaints_updated on public.complaints;
create trigger trg_complaints_updated
  before update on public.complaints
  for each row execute function public.set_updated_at();

create table if not exists public.graduation_applications (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references public.profiles (id) on delete cascade,
  semester_id uuid not null references public.semesters (id) on delete cascade,
  status grad_app_status not null default 'pending',
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

drop trigger if exists trg_graduation_applications_updated on public.graduation_applications;
create trigger trg_graduation_applications_updated
  before update on public.graduation_applications
  for each row execute function public.set_updated_at();

create table if not exists public.study_groups (
  id uuid primary key default gen_random_uuid(),
  class_id uuid not null references public.classes (id) on delete cascade,
  members jsonb not null default '[]'::jsonb,
  ai_suggested boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

drop trigger if exists trg_study_groups_updated on public.study_groups;
create trigger trg_study_groups_updated
  before update on public.study_groups
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- AI / RAG
-- ---------------------------------------------------------------------------
create table if not exists public.document_embeddings (
  id uuid primary key default gen_random_uuid(),
  content text not null,
  embedding vector(1536) not null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

drop trigger if exists trg_document_embeddings_updated on public.document_embeddings;
create trigger trg_document_embeddings_updated
  before update on public.document_embeddings
  for each row execute function public.set_updated_at();

create index if not exists document_embeddings_ivfflat
  on public.document_embeddings
  using ivfflat (embedding vector_cosine_ops)
  with (lists = 100);

create table if not exists public.taboo_words (
  id uuid primary key default gen_random_uuid(),
  word text not null unique,
  added_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

drop trigger if exists trg_taboo_words_updated on public.taboo_words;
create trigger trg_taboo_words_updated
  before update on public.taboo_words
  for each row execute function public.set_updated_at();

create table if not exists public.audit_log (
  id uuid primary key default gen_random_uuid(),
  actor_id uuid references public.profiles (id) on delete set null,
  action text not null,
  entity text not null,
  entity_id uuid,
  detail jsonb default '{}'::jsonb,
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Views: public dashboard, visitor-safe enrollments, anonymized reviews
-- ---------------------------------------------------------------------------
create or replace view public.enrollments_public as
select e.id, e.student_id, e.class_id, e.status, e.enrolled_at
from public.enrollments e;

create or replace view public.reviews_public as
select
  r.id,
  r.class_id,
  r.stars,
  coalesce(nullif(trim(r.filtered_body), ''), r.body) as body_display,
  r.is_hidden,
  r.created_at
from public.reviews r;

create or replace view public.v_public_dashboard_stats as
with top_classes as (
  select row_number() over (order by c.avg_rating desc nulls last) as rank,
    'top_class'::text as stat_type,
    c.title as label,
    c.avg_rating as value_num,
    c.course_code as value_text
  from public.classes c
  where not c.is_cancelled and c.avg_rating is not null
  order by c.avg_rating desc
  limit 5
),
bottom_classes as (
  select row_number() over (order by c.avg_rating asc nulls last) as rank,
    'bottom_class'::text as stat_type,
    c.title as label,
    c.avg_rating as value_num,
    c.course_code as value_text
  from public.classes c
  where not c.is_cancelled and c.avg_rating is not null
  order by c.avg_rating asc
  limit 5
),
top_students as (
  select row_number() over (order by p.cumulative_gpa desc nulls last) as rank,
    'top_gpa'::text as stat_type,
    p.full_name as label,
    p.cumulative_gpa::numeric as value_num,
    null::text as value_text
  from public.profiles p
  where p.role = 'student' and p.status = 'active' and p.cumulative_gpa is not null
  order by p.cumulative_gpa desc
  limit 5
)
select * from top_classes
union all
select * from bottom_classes
union all
select * from top_students;

-- ---------------------------------------------------------------------------
-- RPC helpers (SECURITY DEFINER)
-- ---------------------------------------------------------------------------
create or replace function public._current_role()
returns user_role
language sql
stable
security definer
set search_path = public
as $$
  select role from public.profiles where id = auth.uid();
$$;

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

  if nord <> ord + 1 then
    raise exception 'invalid phase transition';
  end if;

  update public.semesters set phase = p_next_phase where id = p_semester_id;
  return 'ok';
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
begin
  select role, status into r, st from public.profiles where id = me;
  if r <> 'student'::user_role then
    raise exception 'only students may enroll';
  end if;
  if st <> 'active'::profile_status then
    raise exception 'account not active';
  end if;

  select c.semester_id, s.phase, c.max_students, c.is_cancelled
  into sem, ph, max_st, cancelled
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
      and c.schedule_time && c2.schedule_time
  ) into has_conflict;

  if has_conflict then
    raise exception 'schedule conflict';
  end if;

  if exists (select 1 from public.enrollments where student_id = me and class_id = p_class_id) then
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

create or replace function public.rpc_post_grade(
  p_enrollment_id uuid,
  p_grade grade_letter
)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  me uuid := auth.uid();
  r user_role;
  ph semester_phase;
  cid uuid;
  iid uuid;
begin
  select public._current_role() into r;
  if r <> 'instructor'::user_role and r <> 'registrar'::user_role then
    raise exception 'forbidden';
  end if;

  select c.id, c.instructor_id, s.phase
  into cid, iid, ph
  from public.enrollments e
  join public.classes c on c.id = e.class_id
  join public.semesters s on s.id = c.semester_id
  where e.id = p_enrollment_id;

  if cid is null then
    raise exception 'enrollment not found';
  end if;

  if ph <> 'grading'::semester_phase and r <> 'registrar'::user_role then
    raise exception 'grading phase required';
  end if;

  if r = 'instructor'::user_role and iid <> me then
    raise exception 'not your class';
  end if;

  update public.enrollments set grade = p_grade where id = p_enrollment_id;
  perform public.rpc_recalc_student_gpa(
    (select student_id from public.enrollments where id = p_enrollment_id)
  );
  return 'ok';
end;
$$;

create or replace function public.rpc_recalc_student_gpa(p_student_id uuid)
returns numeric
language plpgsql
security definer
set search_path = public
as $$
declare
  pts numeric := 0;
  n int := 0;
  gpa numeric;
begin
  select
    coalesce(sum(case e.grade
      when 'A'::grade_letter then 4.0
      when 'B'::grade_letter then 3.0
      when 'C'::grade_letter then 2.0
      when 'D'::grade_letter then 1.0
      when 'F'::grade_letter then 0.0
      else null
    end), 0),
    count(*) filter (where e.grade is not null)
  into pts, n
  from public.enrollments e
  where e.student_id = p_student_id and e.status = 'enrolled'::enrollment_status;

  if n = 0 then
    gpa := null;
  else
    gpa := round((pts / n)::numeric, 2);
  end if;

  update public.profiles set cumulative_gpa = gpa where id = p_student_id;
  return gpa;
end;
$$;

-- Visitor-safe directory (no grade column)
create or replace function public.rpc_directory_enrollments()
returns table (
  id uuid,
  student_id uuid,
  class_id uuid,
  status enrollment_status,
  enrolled_at timestamptz
)
language sql
security definer
set search_path = public
stable
as $$
  select e.id, e.student_id, e.class_id, e.status, e.enrolled_at
  from public.enrollments e
  where exists (
    select 1 from public.profiles p
    where p.id = auth.uid()
      and p.role in ('visitor'::user_role, 'registrar'::user_role)
  );
$$;

create or replace function public.rpc_reviews_feed()
returns table (
  id uuid,
  class_id uuid,
  stars int,
  body_display text,
  is_hidden boolean,
  created_at timestamptz,
  author_id uuid
)
language sql
security definer
stable
set search_path = public
as $$
  select
    r.id,
    r.class_id,
    r.stars,
    coalesce(nullif(trim(r.filtered_body), ''), r.body) as body_display,
    r.is_hidden,
    r.created_at,
    case
      when exists (
        select 1 from public.profiles p
        where p.id = auth.uid() and p.role = 'registrar'::user_role
      ) then r.author_id
      when r.author_id = auth.uid() then r.author_id
      else null::uuid
    end as author_id
  from public.reviews r
  where
    exists (select 1 from public.profiles p where p.id = auth.uid())
    and (
      exists (
        select 1 from public.profiles p
        where p.id = auth.uid() and p.role = 'registrar'::user_role
      )
      or r.author_id = auth.uid()
      or not coalesce(r.is_hidden, false)
    );
$$;

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------
alter table public.profiles enable row level security;
alter table public.semesters enable row level security;
alter table public.classes enable row level security;
alter table public.enrollments enable row level security;
alter table public.applications enable row level security;
alter table public.reviews enable row level security;
alter table public.warnings enable row level security;
alter table public.complaints enable row level security;
alter table public.graduation_applications enable row level security;
alter table public.study_groups enable row level security;
alter table public.document_embeddings enable row level security;
alter table public.taboo_words enable row level security;
alter table public.audit_log enable row level security;

-- profiles
drop policy if exists profiles_select_own on public.profiles;
create policy profiles_select_own on public.profiles
  for select using (
    id = auth.uid()
    or exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'registrar')
    or (
      exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'visitor')
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
    or exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'registrar')
  );

drop policy if exists profiles_insert_registrar on public.profiles;
create policy profiles_insert_registrar on public.profiles
  for insert with check (
    exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'registrar')
  );

-- semesters: readable by signed-in users; write registrar
drop policy if exists semesters_select on public.semesters;
create policy semesters_select on public.semesters
  for select using (auth.uid() is not null);

drop policy if exists semesters_write on public.semesters;
create policy semesters_write on public.semesters
  for all using (
    exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'registrar')
  );

-- classes
drop policy if exists classes_select on public.classes;
create policy classes_select on public.classes
  for select using (
    auth.uid() is not null
    or true
  );

drop policy if exists classes_write on public.classes;
create policy classes_write on public.classes
  for all using (
    exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'registrar')
  );

-- enrollments
drop policy if exists enrollments_select on public.enrollments;
create policy enrollments_select on public.enrollments
  for select using (
    student_id = auth.uid()
    or exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'registrar')
    or exists (
      select 1 from public.classes c
      where c.id = enrollments.class_id and c.instructor_id = auth.uid()
    )
  );

drop policy if exists enrollments_insert on public.enrollments;
create policy enrollments_insert on public.enrollments
  for insert with check (false);

drop policy if exists enrollments_update on public.enrollments;
create policy enrollments_update on public.enrollments
  for update using (
    exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'registrar')
    or exists (
      select 1 from public.classes c
      where c.id = enrollments.class_id and c.instructor_id = auth.uid()
    )
  );

-- applications
drop policy if exists applications_anon_insert on public.applications;
create policy applications_anon_insert on public.applications
  for insert with check (true);

drop policy if exists applications_select on public.applications;
create policy applications_select on public.applications
  for select using (
    exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'registrar')
  );

drop policy if exists applications_update on public.applications;
create policy applications_update on public.applications
  for update using (
    exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'registrar')
  );

-- reviews: direct table for author/registrar/instructor; others use rpc_reviews_feed
drop policy if exists reviews_select on public.reviews;
create policy reviews_select on public.reviews
  for select using (
    author_id = auth.uid()
    or exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'registrar')
    or exists (
      select 1 from public.classes c
      where c.id = reviews.class_id and c.instructor_id = auth.uid()
    )
  );

drop policy if exists reviews_insert_student on public.reviews;
create policy reviews_insert_student on public.reviews
  for insert with check (
    exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'student')
    and author_id = auth.uid()
  );

-- warnings
drop policy if exists warnings_select on public.warnings;
create policy warnings_select on public.warnings
  for select using (
    target_id = auth.uid()
    or exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'registrar')
  );

drop policy if exists warnings_write on public.warnings;
create policy warnings_write on public.warnings
  for all using (
    exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'registrar')
  );

-- complaints
drop policy if exists complaints_select on public.complaints;
create policy complaints_select on public.complaints
  for select using (
    filed_by = auth.uid()
    or against = auth.uid()
    or exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'registrar')
  );

drop policy if exists complaints_insert on public.complaints;
create policy complaints_insert on public.complaints
  for insert with check (filed_by = auth.uid());

drop policy if exists complaints_update on public.complaints;
create policy complaints_update on public.complaints
  for update using (
    exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'registrar')
  );

-- graduation
drop policy if exists grad_select on public.graduation_applications;
create policy grad_select on public.graduation_applications
  for select using (
    student_id = auth.uid()
    or exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'registrar')
  );

drop policy if exists grad_insert on public.graduation_applications;
create policy grad_insert on public.graduation_applications
  for insert with check (student_id = auth.uid());

drop policy if exists grad_update on public.graduation_applications;
create policy grad_update on public.graduation_applications
  for update using (
    exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'registrar')
  );

-- study_groups
drop policy if exists sg_select on public.study_groups;
create policy sg_select on public.study_groups
  for select using (auth.uid() is not null);

drop policy if exists sg_write on public.study_groups;
create policy sg_write on public.study_groups
  for all using (
    exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'registrar')
  );

-- embeddings: no policies — deny direct client access; Edge Functions use service role

-- taboo_words
drop policy if exists taboo_select on public.taboo_words;
create policy taboo_select on public.taboo_words
  for select using (auth.uid() is not null);

drop policy if exists taboo_write on public.taboo_words;
create policy taboo_write on public.taboo_words
  for all using (
    exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'registrar')
  );

-- audit_log registrar only
drop policy if exists audit_select on public.audit_log;
create policy audit_select on public.audit_log
  for select using (
    exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'registrar')
  );

drop policy if exists audit_insert on public.audit_log;
create policy audit_insert on public.audit_log
  for insert with check (
    exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'registrar')
  );

-- Views: grant select on dashboard view to anon + authenticated
grant select on public.v_public_dashboard_stats to anon, authenticated;

-- RPC execute
grant execute on function public.rpc_transition_semester_phase(uuid, semester_phase) to authenticated;
grant execute on function public.rpc_enroll_in_class(uuid) to authenticated;
grant execute on function public.rpc_post_grade(uuid, grade_letter) to authenticated;
grant execute on function public.rpc_recalc_student_gpa(uuid) to authenticated;
grant execute on function public.rpc_directory_enrollments() to authenticated;
grant execute on function public.rpc_reviews_feed() to authenticated;

create or replace function public.match_documents(
  query_embedding vector(1536),
  match_count int default 8
)
returns table (id uuid, content text, metadata jsonb, distance float)
language sql
stable
security definer
set search_path = public
as $$
  select
    de.id,
    de.content,
    de.metadata,
    (de.embedding <=> query_embedding)::float as distance
  from public.document_embeddings de
  order by de.embedding <=> query_embedding
  limit greatest(1, least(match_count, 20));
$$;

revoke all on function public.match_documents(vector, int) from public;
grant execute on function public.match_documents(vector, int) to service_role;

comment on table public.profiles is 'College0 user profile linked 1:1 to auth.users';
