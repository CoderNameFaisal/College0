-- Fix: "different vector dimensions 1536 and 768" from ai-chat match_documents.
-- Causes: (a) document_embeddings.embedding still vector(1536) from an old DB, and/or
-- (b) multiple match_documents overloads (1536 + 768 + generic vector) so the wrong
-- function or column pairing is used.
-- This migration forces a single vector(768) column and one match_documents(vector(768), int).
-- RAG rows are cleared; re-seed document_embeddings (SQL or your own pipeline) if you need local docs.

drop index if exists public.document_embeddings_ivfflat;

do $$
declare
  sig text;
begin
  for sig in
    select 'public.match_documents(' || pg_catalog.pg_get_function_identity_arguments(p.oid) || ')'
    from pg_catalog.pg_proc p
    join pg_catalog.pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.proname = 'match_documents'
  loop
    execute 'drop function if exists ' || sig || ' cascade';
  end loop;
end $$;

truncate public.document_embeddings;

alter table public.document_embeddings drop column if exists embedding;

alter table public.document_embeddings
  add column embedding vector(768) not null;

create index if not exists document_embeddings_ivfflat
  on public.document_embeddings
  using ivfflat (embedding vector_cosine_ops)
  with (lists = 100);

create or replace function public.match_documents(
  query_embedding vector(768),
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

revoke all on function public.match_documents(vector(768), int) from public;
grant execute on function public.match_documents(vector(768), int) to service_role;
