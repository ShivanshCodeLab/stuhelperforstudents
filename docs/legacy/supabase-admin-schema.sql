-- StuHelper Admin v2 — run in Supabase SQL Editor (safe to re-run)
-- STEP 1: Auth > Users me apna admin user banao (email+password).
-- STEP 2: Is file ke last me ADMIN_EMAIL badal ke run karo.

create table if not exists public.admins (user_id uuid primary key references auth.users on delete cascade, email text);
create or replace function public.is_admin() returns boolean language sql security definer set search_path=public stable
as $$ select exists(select 1 from public.admins where user_id = auth.uid()) $$;

create table if not exists public.notices (id uuid primary key default gen_random_uuid(), title text not null, body text not null, audience text default 'All Semesters', priority text default 'Normal', active boolean default true, created_at timestamptz default now());
create table if not exists public.assignments (id uuid primary key default gen_random_uuid(), title text not null, subject text, due date, priority text default 'Normal', minutes int, details text, created_at timestamptz default now());
create table if not exists public.syllabus (id uuid primary key default gen_random_uuid(), subject text not null, chapter text not null, priority text default 'Medium', target date, created_at timestamptz default now());
create table if not exists public.settings (key text primary key, value jsonb, created_at timestamptz default now());
create table if not exists public.audit_log (id uuid primary key default gen_random_uuid(), actor text, action text, created_at timestamptz default now());

-- Purani open policies hatao
drop policy if exists "Allow read/write students" on public.students;
drop policy if exists "Allow read/write library_books" on public.library_books;
drop policy if exists "Allow read/write book_requests" on public.book_requests;

alter table public.admins enable row level security;
alter table public.notices enable row level security;
alter table public.assignments enable row level security;
alter table public.syllabus enable row level security;
alter table public.settings enable row level security;
alter table public.audit_log enable row level security;

-- Admin: sab kuch
do $$ declare t text; begin
  foreach t in array array['students','library_books','book_requests','notices','assignments','syllabus','settings','audit_log'] loop
    execute format('drop policy if exists admin_all on public.%I', t);
    execute format('create policy admin_all on public.%I for all using (public.is_admin()) with check (public.is_admin())', t);
  end loop;
  -- Students: public content sirf padh sakte hain
  foreach t in array array['notices','assignments','syllabus','settings','library_books'] loop
    execute format('drop policy if exists public_read on public.%I', t);
    execute format('create policy public_read on public.%I for select to anon, authenticated using (true)', t);
  end loop;
end $$;

drop policy if exists admins_self on public.admins;
create policy admins_self on public.admins for select to authenticated using (user_id = auth.uid());
-- Student apni hi profile likh/padh sakta hai (email match)
drop policy if exists student_self on public.students;
create policy student_self on public.students for all to authenticated
  using (email = auth.jwt()->>'email') with check (email = auth.jwt()->>'email');
-- Student request daal sakta hai
drop policy if exists req_insert on public.book_requests;
create policy req_insert on public.book_requests for insert to authenticated with check (true);

-- STEP 2: apna admin email yaha daalo
insert into public.admins (user_id, email) select id, email from auth.users where email = 'ADMIN_EMAIL_YAHA' on conflict do nothing;
