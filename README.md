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
3. Copy `.env.example` to `.env.local` and use values printed by `npx supabase status`.
4. Run `npx supabase start` and start Redis on port 6379.
5. Run `npm run dev`.

Run all repository checks with `npm run check`. Database policy tests run separately with `npx supabase test db`.
