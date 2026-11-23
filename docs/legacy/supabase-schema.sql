-- Run this in your Supabase SQL Editor to create tables for StuHelper

create table if not exists public.students (
  id uuid primary key default gen_random_uuid(),
  full_name text not null,
  roll_no text,
  course text,
  semester text,
  email text not null unique,
  phone text unique,
  status text not null default 'Active',
  created_at timestamptz not null default now()
);

create table if not exists public.library_books (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  author text,
  semester text default 'All Semesters',
  resource_url text,
  file_name text,
  created_at timestamptz not null default now()
);

create table if not exists public.book_requests (
  id text primary key,
  student_name text not null,
  roll_no text,
  semester text,
  title text not null,
  req_type text default 'PDF',
  status text not null default 'Pending',
  req_date text,
  created_at timestamptz not null default now()
);

alter table public.students enable row level security;
alter table public.library_books enable row level security;
alter table public.book_requests enable row level security;

-- Starter policies (tighten with role/auth claims before production deployment)
create policy "Allow read/write students" on public.students for all using (true) with check (true);
create policy "Allow read/write library_books" on public.library_books for all using (true) with check (true);
create policy "Allow read/write book_requests" on public.book_requests for all using (true) with check (true);
