-- Optional meeting location (WGS84) + human-readable label for maps (OSM/Google/etc.).

alter table public.classes
  add column if not exists location_lat double precision,
  add column if not exists location_lng double precision,
  add column if not exists location_label text;

alter table public.classes
  add constraint classes_location_coords_chk check (
    (location_lat is null and location_lng is null)
    or (location_lat is not null and location_lng is not null)
  );
