-- RAG: switch from OpenAI 1536-dim to Gemini-sized vectors (768).
-- Clears document_embeddings rows (old vectors are incompatible). Re-seed docs if needed.

drop index if exists public.document_embeddings_ivfflat;

do $$
declare
  fn regprocedure;
begin
  select p.oid::regprocedure into fn
  from pg_proc p
  join pg_namespace n on p.pronamespace = n.oid
  where n.nspname = 'public' and p.proname = 'match_documents'
  limit 1;
  if fn is not null then
    execute 'drop function if exists ' || fn::text;
  end if;
end $$;

truncate public.document_embeddings;

alter table public.document_embeddings drop column embedding;

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

alter table public.document_embeddings drop column embedding;

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
