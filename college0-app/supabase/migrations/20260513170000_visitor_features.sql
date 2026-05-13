-- Visitor-facing features:
-- 1. Capture applicant_name and qualifications on applications so the registrar
--    has real data to decide on (rather than synthesizing a name from the
--    email's local part when accepting students).
-- 2. (Idempotent) confirm anon can read the public dashboard view and insert
--    applications — both were already true via earlier migrations.

alter table public.applications
  add column if not exists applicant_name text,
  add column if not exists qualifications text;

-- The applications_anon_insert policy already allows anyone (including anon)
-- to insert. We re-state it here to make the visitor flow grep-discoverable.
drop policy if exists applications_anon_insert on public.applications;
create policy applications_anon_insert on public.applications
  for insert with check (true);
