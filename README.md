# Mentionish

Mentionish helps founders discover relevant Reddit and Hacker News conversations and prepare safe, human-reviewed replies. It never posts on a user's behalf.

## Workspace

- `apps/dashboard` — Next.js dashboard
- `apps/api` — authenticated Express API
- `apps/worker` — BullMQ workers
- `apps/scheduler` — singleton scan scheduler
- `packages/types` — shared schemas and contracts
- `packages/database` — server-side Supabase access
- `packages/ai` — role-based AI boundary
- `supabase` — local configuration, migrations, and database tests

## Local setup

1. Install Node.js 22+, Docker, and the Supabase CLI.
2. Run `npm install`.
3. Copy each app's `.env.example` to its local environment file:
   - `apps/dashboard/.env.example` to `apps/dashboard/.env.local`
   - `apps/api/.env.example` to `apps/api/.env`
   - `apps/worker/.env.example` to `apps/worker/.env`
   - `apps/scheduler/.env.example` to `apps/scheduler/.env`
4. Fill each file with its scoped hosted-service or local development values.
5. Run `npm run dev`. If using local infrastructure, start Supabase and Redis first.

Run all repository checks with `npm run check`. Database policy tests run separately with `npx supabase test db`.
