# College0

Web-based course enrollment and program management (final project). Frontend lives in [`college0-app`](college0-app/); database and Edge Functions in [`supabase`](supabase/).

## Stack

- **Frontend:** React 19, TypeScript, Vite, Tailwind CSS v4, React Router v7 — [`college0-app`](college0-app/)
- **Backend:** Supabase (Postgres 15, Auth, RLS, Realtime, Edge Functions, pgvector)
- **AI:** OpenAI `text-embedding-3-small` + GPT-4o (Edge Functions; secrets in Supabase, not in the browser)

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

## Supabase (you create the project)

1. Create a project at [supabase.com](https://supabase.com).
2. Enable extensions: **uuid-ossp** (usually on), **vector** (pgvector).
3. Run the SQL migration: paste or run [`supabase/migrations/20250513170000_college0_schema.sql`](supabase/migrations/20250513170000_college0_schema.sql) in the SQL editor (or use Supabase CLI migrations).
4. **Promote the first registrar:** after the first user signs up, run:

   `update public.profiles set role = 'registrar' where id = '<auth.users id>';`

5. Deploy Edge Functions and set secrets: `SUPABASE_SERVICE_ROLE_KEY`, `OPENAI_API_KEY` (Dashboard → Edge Functions → Secrets). Deploy each function under `supabase/functions/` (`ai-chat`, `submit-review`, `study-groups`, `transition-phase`, `course-cancellation-scan`).

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

- Technical spec: [`college0_technical_report.pdf`](college0_technical_report.pdf)
