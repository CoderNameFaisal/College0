# College0

Web-based course enrollment and program management (final project). Frontend lives in [`college0-app`](college0-app/); database and Edge Functions in [`supabase`](supabase/).

## Stack

- **Frontend:** React 19, TypeScript, Vite, Tailwind CSS v4, React Router v7 — [`college0-app`](college0-app/)
- **Backend:** Supabase (Postgres, Auth, RLS, Realtime, Edge Functions, pgvector). Match `supabase/config.toml` `[db] major_version` to your linked project when using the CLI (`supabase link` warns if it differs).
- **AI:** Google Gemini only (`embedContent` for RAG + `generateContent` for chat / study groups). Edge secrets: `GEMINI_API_KEY` (and optional `GEMINI_MODEL`, `GEMINI_EMBEDDING_MODEL`, `GEMINI_EMBEDDING_DIM`). RAG uses `vector(768)` after the follow-up migration below. The migration **truncates** `document_embeddings`; reload snippets with **`cd college0-app && npm run seed:rag`** (needs `SUPABASE_SERVICE_ROLE_KEY` + `GEMINI_API_KEY` in `.env`).

## Troubleshooting: “Missing VITE_SUPABASE_URL” or “supabaseUrl is required”

- The **`.env` file must be inside `college0-app/`** (same folder as `vite.config.ts` and `package.json`). A file at `College0/.env` is ignored.
- Variable names must be exactly **`VITE_SUPABASE_URL`** and **`VITE_SUPABASE_ANON_KEY`** (the `VITE_` prefix is required).
- After changing `.env`, **restart** the dev server (stop with Ctrl+C, then `npm run dev` again).
- `vite.config.ts` sets **`root`** and **`envDir`** to the `college0-app` folder so `.env` is found even if something starts Vite with an unexpected working directory.
- Confirm the file is really saved: in a terminal, `cd college0-app && grep '^VITE_' .env` should print **two** lines.
- In Dashboard → **Settings → API**, use the **Project URL** and the **anon / public / publishable** key (either the JWT `eyJ...` or `sb_publishable_...`).

```bash
cd college0-app
cp .env.example .env
# Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY from the Supabase project dashboard
npm install
npm run dev
```

## Troubleshooting: Git push `403` / `Permission denied to <user>`

Git is using a GitHub account that **cannot write** to `origin` (for example: `remote: Permission to CoderNameFaisal/College0.git denied to atai20`).

Pick one:

1. **Invite the account you actually use to log in** (e.g. `atai20`) as a **collaborator** on [CoderNameFaisal/College0](https://github.com/CoderNameFaisal/College0) with **Write** role, accept the email invite, then run `git push origin main` again.
2. **Sign in as the repo owner** when Git prompts: open **Windows Settings → Accounts → Email & accounts** is unrelated; use **Credential Manager** → **Windows Credentials** and remove any **github.com** / **Git** / **GCM** entries for GitHub, then `git push origin main` and complete the browser OAuth flow for **CoderNameFaisal**.
3. **Use a Personal Access Token** (repo owner: GitHub → Settings → Developer settings → Fine-grained PAT with Contents: Read and write on this repo). Push once with  
   `git push https://<TOKEN>@github.com/CoderNameFaisal/College0.git main`  
   then remove the token from shell history and switch the remote back to the normal HTTPS URL without the token.

Your commit is already saved locally (`git log -1`); pushing only publishes it.

## Supabase (you create the project)

1. Create a project at [supabase.com](https://supabase.com).
2. Enable extensions: **uuid-ossp** (usually on), **vector** (pgvector).
3. Run SQL migrations in **lexicographic (filename) order** from [`college0-app/supabase/migrations/`](college0-app/supabase/migrations/): start with [`20250513170000_college0_schema.sql`](college0-app/supabase/migrations/20250513170000_college0_schema.sql) and [`20250513190000_document_embeddings_gemini_768.sql`](college0-app/supabase/migrations/20250513190000_document_embeddings_gemini_768.sql) (second file switches RAG to 768-dim Gemini embeddings and clears old embedding rows), then every later `20260513*.sql` file through the newest, then [`20260515100000_fix_rag_embedding_dimensions.sql`](college0-app/supabase/migrations/20260515100000_fix_rag_embedding_dimensions.sql) if you still see **“different vector dimensions 1536 and 768”** on `ai-chat` (forces a single `vector(768)` column + one `match_documents` overload).
4. **Bootstrap the first registrar:** create the first user in **Supabase Dashboard → Authentication → Users** (Add user) with **User metadata** JSON such as `{"role":"registrar","full_name":"Registrar Name"}` so `handle_new_user` creates the profile with the right role. (There is no public sign-up page in the app.) Alternatively create any user, then run:

   `update public.profiles set role = 'registrar' where id = '<auth.users id>';`

5. Deploy Edge Functions and set secrets: `SUPABASE_SERVICE_ROLE_KEY`, `GEMINI_API_KEY` (Google AI Studio / Google AI key). Optional: `GEMINI_MODEL` (default `gemini-2.5-flash-lite`; avoid deprecated `gemini-2.0-flash`), `GEMINI_EMBEDDING_MODEL` (default `gemini-embedding-001`), `GEMINI_EMBEDDING_DIM` (default `768`, must match DB `vector(768)`). **Semester phase** (forward/back one step), **semester delete** (setup, no classes), and **course cancellation scan** use Postgres RPCs from the app (`rpc_transition_semester_phase`, `rpc_delete_semester`, `rpc_course_cancellation_scan`) after migration `20260513202000_semester_reverse_delete_cancellation_rpc.sql` — no Edge deploy for those. From `college0-app/`, use the Supabase CLI (see below) to deploy functions under `supabase/functions/`: `accept-student-application` (student + instructor acceptance), `ai-chat`, `submit-review`, `study-groups`. The `transition-phase` and `course-cancellation-scan` Edge folders mirror the same RPCs if you prefer invoking them via Edge.

   **CLI deploy (fixes “Access token not provided”):** run `npm run supabase:login` once, then `npm run supabase:link` and enter your **project ref** (the id in the dashboard URL, `https://supabase.com/dashboard/project/<ref>`). Then deploy, for example: `npm run supabase -- functions deploy accept-student-application`. For CI, set a personal access token in the environment as `SUPABASE_ACCESS_TOKEN` instead of logging in.

6. Optional seed data: [`supabase/seed.sql`](supabase/seed.sql).

## Vercel

Connect the repo with root directory **`college0-app`** (or set root in project settings). Add the same `VITE_*` env vars. SPA rewrites are in [`college0-app/vercel.json`](college0-app/vercel.json).

## RLS smoke matrix (manual)

| Role       | profiles | classes | enrollments | applications | reviews RPC | visitor RPC |
|-----------|----------|---------|-------------|--------------|-------------|-------------|
| anon      | leaderboard only | read | deny | insert | deny | deny |
| student   | self | read | self | deny | rpc_reviews_feed | deny |
| registrar | full | full | full | full | full + RPC | rpc_directory |
| instructor| self | read | own classes | deny | own class rows | deny |
| visitor   | instructors+students | read | rpc_directory only | deny | rpc_reviews_feed | rpc_directory |

## Docs

- **Spec verification (manual QA walkthrough):** [`college0-app/SPEC_VERIFICATION_TUTORIAL.md`](college0-app/SPEC_VERIFICATION_TUTORIAL.md)
- Technical spec: [`college0_technical_report.pdf`](college0_technical_report.pdf)
