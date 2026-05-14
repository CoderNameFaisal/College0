-- Ensure class map columns exist (some databases never applied 20260513207000_class_location.sql).

alter table public.classes
  add column if not exists location_lat double precision,
  add column if not exists location_lng double precision,
  add column if not exists location_label text;

do $$
begin
  if not exists (
    select 1
    from pg_constraint c
    join pg_class t on c.conrelid = t.oid
    join pg_namespace n on t.relnamespace = n.oid
    where n.nspname = 'public'
      and t.relname = 'classes'
      and c.conname = 'classes_location_coords_chk'
  ) then
    alter table public.classes add constraint classes_location_coords_chk check (
      (location_lat is null and location_lng is null)
      or (location_lat is not null and location_lng is not null)
    );
  end if;
end $$;
