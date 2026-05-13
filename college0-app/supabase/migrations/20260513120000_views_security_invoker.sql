-- Recreate public-facing views with security_invoker so they honor the
-- caller's RLS on the underlying tables instead of running as the view owner.

create or replace view public.enrollments_public
with (security_invoker = true) as
select e.id, e.student_id, e.class_id, e.status, e.enrolled_at
from public.enrollments e;

create or replace view public.reviews_public
with (security_invoker = true) as
select
  r.id,
  r.class_id,
  r.stars,
  coalesce(nullif(trim(r.filtered_body), ''), r.body) as body_display,
  r.is_hidden,
  r.created_at
from public.reviews r;

create or replace view public.v_public_dashboard_stats
with (security_invoker = true) as
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

grant select on public.v_public_dashboard_stats to anon, authenticated;
grant select on public.enrollments_public to authenticated;
grant select on public.reviews_public to authenticated;
