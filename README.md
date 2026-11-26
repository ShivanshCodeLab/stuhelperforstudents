# StuHelper

Study workspace for students: syllabus and assignment tracker, library, notes, productivity tools, student toolkit and PDF/image utilities, with an admin console.

## Stack
- **Frontend:** static pages in `public/` (vanilla JS), installable as a PWA (`manifest.webmanifest`, `sw.js`).
- **API:** Hono on a Netlify Function (`netlify/server/index.ts`), mounted at `/api/*`.
- **Database:** Netlify DB (Postgres) via Drizzle (`db/schema.ts`, migrations in `netlify/database/migrations`).
- **Auth:** Netlify Identity. Admins are users with the `admin` role or an email listed in the `ADMIN_EMAILS` env var (comma separated).

## Data model
- Shared content (admin-published): notices, assignments, syllabus, library, exam date.
- Per student: profile (`students`), book requests, and **synced study data** (`user_data`: notes, tasks, flashcards, habits, own assignments/syllabus items, progress ticks). `public/assets/js/sync.js` keeps `localStorage` and the cloud in step (last write wins per key).

## Setup
1. `npm install`
2. Set `ADMIN_EMAILS` in Netlify environment variables.
3. Apply migrations (Netlify applies `netlify/database/migrations` on deploy).
4. Deploy with Netlify (`publish = "public"`).

## Notes
- `docs/legacy/` is the old Supabase / static-ZIP version, kept for reference only.
- Reminders are shown when the app is opened (no push server). Real background push needs a push service.
