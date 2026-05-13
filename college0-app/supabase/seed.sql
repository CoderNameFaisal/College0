-- Optional seed after migration (run manually in SQL editor).

insert into public.semesters (name, phase, quota)
select 'Demo Semester', 'registration', 20
where not exists (select 1 from public.semesters limit 1);

insert into public.taboo_words (word)
values ('badword'), ('offensive')
on conflict (word) do nothing;

-- RAG: insert document_embeddings via OpenAI embeddings (Edge script) — not included as raw SQL.
