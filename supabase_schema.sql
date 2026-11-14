-- Vectra Enterprises quotation system
-- Run this entire file in Supabase Dashboard > SQL Editor > New query.

create extension if not exists pgcrypto;

create table if not exists public.admin_users (
  user_id uuid primary key references auth.users(id) on delete cascade,
  email text not null unique,
  created_at timestamptz not null default now()
);

create table if not exists public.quotation_requests (
  id uuid primary key default gen_random_uuid(),
  customer_name text not null,
  customer_phone text not null,
  customer_email text,
  customer_gstin text,
  customer_notes text,
  items jsonb not null check (jsonb_typeof(items) = 'array' and jsonb_array_length(items) > 0),
  status text not null default 'pending' check (status in ('pending','quoted','closed')),
  created_at timestamptz not null default now()
);

create table if not exists public.quotations (
  id uuid primary key default gen_random_uuid(),
  request_id uuid not null references public.quotation_requests(id) on delete restrict,
  quote_number text not null,
  quote_date date not null default current_date,
  valid_until date,
  gst_treatment text not null check (gst_treatment in ('intra','inter')),
  items jsonb not null check (jsonb_typeof(items) = 'array' and jsonb_array_length(items) > 0),
  terms text,
  taxable_total numeric(14,2) not null check (taxable_total >= 0),
  gst_total numeric(14,2) not null check (gst_total >= 0),
  grand_total numeric(14,2) not null check (grand_total >= 0),
  status text not null default 'issued' check (status in ('draft','issued','accepted','rejected')),
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  unique (quote_number)
);

create index if not exists quotation_requests_created_at_idx on public.quotation_requests(created_at desc);
create index if not exists quotation_requests_status_idx on public.quotation_requests(status);
create index if not exists quotations_request_id_idx on public.quotations(request_id);

create or replace function public.is_vectra_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.admin_users au
    where au.user_id = auth.uid()
  );
$$;

revoke all on function public.is_vectra_admin() from public;
grant execute on function public.is_vectra_admin() to authenticated;

alter table public.admin_users enable row level security;
alter table public.quotation_requests enable row level security;
alter table public.quotations enable row level security;

drop policy if exists "Admins can view admin roster" on public.admin_users;
create policy "Admins can view admin roster" on public.admin_users
for select to authenticated using (public.is_vectra_admin() or user_id = auth.uid());

drop policy if exists "Anyone can submit a quotation request" on public.quotation_requests;
create policy "Anyone can submit a quotation request" on public.quotation_requests
for insert to anon, authenticated
with check (
  status = 'pending'
  and length(trim(customer_name)) between 1 and 180
  and length(trim(customer_phone)) between 5 and 40
  and (customer_email is null or (length(customer_email) <= 160 and customer_email ~ '^[^@\s]+@[^@\s]+\.[^@\s]+$'))
  and (customer_gstin is null or length(customer_gstin) <= 15)
  and (customer_notes is null or length(customer_notes) <= 1500)
  and jsonb_typeof(items) = 'array'
  and jsonb_array_length(items) between 1 and 100
  and pg_column_size(items) < 40000
);

drop policy if exists "Admins can read quotation requests" on public.quotation_requests;
create policy "Admins can read quotation requests" on public.quotation_requests
for select to authenticated using (public.is_vectra_admin());

drop policy if exists "Admins can update quotation requests" on public.quotation_requests;
create policy "Admins can update quotation requests" on public.quotation_requests
for update to authenticated using (public.is_vectra_admin()) with check (public.is_vectra_admin());

drop policy if exists "Admins can read quotations" on public.quotations;
create policy "Admins can read quotations" on public.quotations
for select to authenticated using (public.is_vectra_admin());

drop policy if exists "Admins can create quotations" on public.quotations;
create policy "Admins can create quotations" on public.quotations
for insert to authenticated with check (public.is_vectra_admin() and created_by = auth.uid());

drop policy if exists "Admins can update quotations" on public.quotations;
create policy "Admins can update quotations" on public.quotations
for update to authenticated using (public.is_vectra_admin()) with check (public.is_vectra_admin());

grant insert on public.quotation_requests to anon, authenticated;
grant select, update on public.quotation_requests to authenticated;
grant select, insert, update on public.quotations to authenticated;
grant select on public.admin_users to authenticated;

-- IMPORTANT: First invite/create staff users in Supabase Authentication.
-- Then add each approved user's email below and run this block.
-- Replace the example emails with the actual staff email addresses.
-- insert into public.admin_users (user_id, email)
-- select id, email from auth.users
-- where lower(email) in ('owner@yourdomain.com', 'sales1@yourdomain.com')
-- on conflict (user_id) do update set email = excluded.email;


-- ---------- v2 additions ----------
-- Sequential, gap-free quotation numbers per Indian financial year (Apr-Mar): VEC/2026-27/0001
create table if not exists public.quote_counters (
  fy text primary key,
  last_no int not null default 0
);
alter table public.quote_counters enable row level security;   -- no policies: only the function below can touch it

create or replace function public.next_quote_number()
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  d date := (now() at time zone 'Asia/Kolkata')::date;
  y int := extract(year from d);
  v_fy text;
  v_n int;
begin
  if not public.is_vectra_admin() then raise exception 'not authorised'; end if;
  if extract(month from d) < 4 then y := y - 1; end if;
  v_fy := y || '-' || lpad(((y + 1) % 100)::text, 2, '0');
  insert into public.quote_counters (fy, last_no) values (v_fy, 1)
  on conflict (fy) do update set last_no = public.quote_counters.last_no + 1
  returning last_no into v_n;
  return 'VEC/' || v_fy || '/' || lpad(v_n::text, 4, '0');
end $$;
revoke all on function public.next_quote_number() from public, anon;
grant execute on function public.next_quote_number() to authenticated;


-- ---------- V3: catalogue, customer CRM and follow-ups ----------
create table if not exists public.products (
  id bigint primary key, name text not null, category text not null, image text,
  description text, brand text, model text, specifications jsonb not null default '{}'::jsonb,
  active boolean not null default true, updated_at timestamptz not null default now()
);
create table if not exists public.customers (
  id uuid primary key default gen_random_uuid(), name text not null, phone text not null,
  email text, gstin text, company text, billing_address text, shipping_address text,
  notes text, created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  unique(phone)
);
create table if not exists public.followups (
  id uuid primary key default gen_random_uuid(), customer_id uuid references public.customers(id) on delete cascade,
  request_id uuid references public.quotation_requests(id) on delete set null,
  due_at timestamptz not null, note text not null, status text not null default 'open' check(status in ('open','done','cancelled')),
  assigned_to uuid references auth.users(id), created_by uuid references auth.users(id), created_at timestamptz not null default now()
);
create index if not exists customers_name_idx on public.customers(name);
create index if not exists followups_due_idx on public.followups(due_at) where status='open';
create index if not exists products_category_idx on public.products(category);
alter table public.products enable row level security;
alter table public.customers enable row level security;
alter table public.followups enable row level security;
drop policy if exists "Public can read active products" on public.products;
create policy "Public can read active products" on public.products for select to anon, authenticated using (active or public.is_vectra_admin());
drop policy if exists "Admins manage products" on public.products;
create policy "Admins manage products" on public.products for all to authenticated using (public.is_vectra_admin()) with check (public.is_vectra_admin());
drop policy if exists "Admins manage customers" on public.customers;
create policy "Admins manage customers" on public.customers for all to authenticated using (public.is_vectra_admin()) with check (public.is_vectra_admin());
drop policy if exists "Admins manage followups" on public.followups;
create policy "Admins manage followups" on public.followups for all to authenticated using (public.is_vectra_admin()) with check (public.is_vectra_admin());
grant select on public.products to anon, authenticated;
grant insert, update, delete on public.products to authenticated;
grant select, insert, update, delete on public.customers, public.followups to authenticated;

-- Keep customer records in sync whenever a public enquiry arrives.
create or replace function public.sync_vectra_customer() returns trigger language plpgsql security definer set search_path=public as $$
begin
  insert into public.customers(name,phone,email,gstin,notes)
  values(new.customer_name,new.customer_phone,new.customer_email,new.customer_gstin,new.customer_notes)
  on conflict(phone) do update set name=excluded.name, email=coalesce(excluded.email,customers.email),
    gstin=coalesce(excluded.gstin,customers.gstin), notes=coalesce(excluded.notes,customers.notes), updated_at=now();
  return new;
end $$;
drop trigger if exists trg_sync_vectra_customer on public.quotation_requests;
create trigger trg_sync_vectra_customer after insert on public.quotation_requests for each row execute function public.sync_vectra_customer();

-- Quotation commercial adjustments (amounts stored in INR).
alter table public.quotations add column if not exists freight_amount numeric(14,2) not null default 0 check (freight_amount >= 0);
alter table public.quotations add column if not exists discount_amount numeric(14,2) not null default 0 check (discount_amount >= 0);

-- Anonymous visitors can evaluate the active-product read policy; the function
-- returns false for anon because auth.uid() is null.
grant execute on function public.is_vectra_admin() to anon;

-- Backfill customers from enquiries already received before this migration.
insert into public.customers(name,phone,email,gstin,notes)
select distinct on (customer_phone) customer_name,customer_phone,customer_email,customer_gstin,customer_notes
from public.quotation_requests order by customer_phone,created_at desc
on conflict(phone) do update set name=excluded.name,email=coalesce(excluded.email,customers.email),
  gstin=coalesce(excluded.gstin,customers.gstin),updated_at=now();
