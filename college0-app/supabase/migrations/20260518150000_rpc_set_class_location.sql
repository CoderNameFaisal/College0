-- Registrar-only: set WGS84 meeting pin + label (validated). Used by UI for creates/updates
-- so map data is always coherent with classes_location_coords_chk.

create or replace function public.rpc_set_class_location(
  p_class_id uuid,
  p_lat double precision,
  p_lng double precision,
  p_label text
)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  n int;
begin
  if public._current_role() <> 'registrar'::user_role then
    raise exception 'only registrar may set class location';
  end if;
  if p_class_id is null then
    raise exception 'class_id required';
  end if;
  if p_lat is null or p_lng is null then
    raise exception 'latitude and longitude are required — use the map to drop a pin';
  end if;
  if p_lat < -90::double precision or p_lat > 90::double precision then
    raise exception 'invalid latitude';
  end if;
  if p_lng < -180::double precision or p_lng > 180::double precision then
    raise exception 'invalid longitude';
  end if;
  if p_label is null or length(trim(p_label)) = 0 then
    raise exception 'location label is required (e.g. building / room)';
  end if;

  update public.classes
  set
    location_lat = p_lat,
    location_lng = p_lng,
    location_label = trim(p_label)
  where id = p_class_id;

  get diagnostics n = row_count;
  if n = 0 then
    raise exception 'class not found';
  end if;

  return 'ok';
end;
$$;

grant execute on function public.rpc_set_class_location(uuid, double precision, double precision, text) to authenticated;
