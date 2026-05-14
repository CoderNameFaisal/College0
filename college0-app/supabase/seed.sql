-- Optional seed after migration (run manually in SQL editor).

insert into public.semesters (name, phase, quota)
select 'Demo Semester', 'registration', 20
where not exists (select 1 from public.semesters limit 1);

insert into public.taboo_words (word)
values ('badword'), ('offensive')
on conflict (word) do nothing;

-- RAG: rows live in document_embeddings (vector 768). After migration 20260515100000 the table is empty until you run: cd college0-app && npm run seed:rag
