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


-- ---------- v3 additions: product manager, CRM fields, quote extras, customer tracking ----------
-- Safe to re-run.

-- 1) Product catalogue in the database (admin can edit without redeploying)
create table if not exists public.products (
  id bigint generated by default as identity primary key,
  name text not null check (length(trim(name)) between 1 and 160),
  category text not null,
  brand text,
  description text,
  specs jsonb not null default '[]'::jsonb,      -- [{"k":"Size","v":"13 mm"}, ...]
  image text,                                    -- file name in /product or a full URL (Supabase Storage)
  active boolean not null default true,
  created_at timestamptz not null default now()
);
alter table public.products enable row level security;
drop policy if exists "Public can read active products" on public.products;
create policy "Public can read active products" on public.products
  for select to anon, authenticated using (active or public.is_vectra_admin());
drop policy if exists "Admins manage products" on public.products;
create policy "Admins manage products" on public.products
  for all to authenticated using (public.is_vectra_admin()) with check (public.is_vectra_admin());
grant select on public.products to anon, authenticated;
grant insert, update, delete on public.products to authenticated;

-- 2) Image bucket for product photos (public read, admin write)
insert into storage.buckets (id, name, public) values ('product-images','product-images', true)
on conflict (id) do nothing;
drop policy if exists "Admins upload product images" on storage.objects;
create policy "Admins upload product images" on storage.objects
  for insert to authenticated with check (bucket_id = 'product-images' and public.is_vectra_admin());
drop policy if exists "Admins update product images" on storage.objects;
create policy "Admins update product images" on storage.objects
  for update to authenticated using (bucket_id = 'product-images' and public.is_vectra_admin());
drop policy if exists "Admins delete product images" on storage.objects;
create policy "Admins delete product images" on storage.objects
  for delete to authenticated using (bucket_id = 'product-images' and public.is_vectra_admin());

-- 3) CRM fields on enquiries
alter table public.quotation_requests
  add column if not exists assigned_to text,
  add column if not exists internal_notes text,
  add column if not exists follow_up_date date,
  add column if not exists follow_up_note text,
  add column if not exists updated_at timestamptz not null default now();
alter table public.quotation_requests drop constraint if exists quotation_requests_status_check;
alter table public.quotation_requests add constraint quotation_requests_status_check
  check (status in ('pending','quoted','won','lost','closed'));
create index if not exists quotation_requests_followup_idx on public.quotation_requests(follow_up_date) where follow_up_date is not null;

-- 4) Quotation extras: freight, payment/delivery terms (stored in meta)
alter table public.quotations add column if not exists meta jsonb not null default '{}'::jsonb;

-- 5) Customer tracking by reference + mobile number (no login needed)
create or replace function public.track_request(p_ref text, p_phone text)
returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare r public.quotation_requests; res jsonb;
begin
  if length(coalesce(p_ref,'')) < 6 or length(regexp_replace(coalesce(p_phone,''),'\D','','g')) < 10 then return null; end if;
  select * into r from public.quotation_requests
   where upper(left(id::text, 8)) = upper(trim(p_ref))
     and right(regexp_replace(customer_phone,'\D','','g'),10) = right(regexp_replace(p_phone,'\D','','g'),10)
   limit 1;
  if not found then return null; end if;
  select jsonb_build_object(
    'ref', upper(left(r.id::text,8)), 'status', r.status, 'created_at', r.created_at,
    'item_count', jsonb_array_length(r.items),
    'quotations', coalesce((select jsonb_agg(jsonb_build_object(
        'quote_number', q.quote_number, 'quote_date', q.quote_date, 'valid_until', q.valid_until,
        'grand_total', q.grand_total, 'status', q.status) order by q.created_at desc)
      from public.quotations q where q.request_id = r.id and q.status <> 'draft'), '[]'::jsonb))
  into res;
  return res;
end $$;
revoke all on function public.track_request(text,text) from public;
grant execute on function public.track_request(text,text) to anon, authenticated;

create or replace function public.respond_quotation(p_ref text, p_phone text, p_quote text, p_decision text)
returns boolean
language plpgsql security definer set search_path = public as $$
declare rid uuid;
begin
  if p_decision not in ('accepted','rejected') then return false; end if;
  select id into rid from public.quotation_requests
   where upper(left(id::text, 8)) = upper(trim(p_ref))
     and right(regexp_replace(customer_phone,'\D','','g'),10) = right(regexp_replace(p_phone,'\D','','g'),10)
   limit 1;
  if rid is null then return false; end if;
  update public.quotations set status = p_decision
   where request_id = rid and quote_number = p_quote and status = 'issued';
  if not found then return false; end if;
  update public.quotation_requests set status = case when p_decision='accepted' then 'won' else 'lost' end, updated_at = now() where id = rid;
  return true;
end $$;
revoke all on function public.respond_quotation(text,text,text,text) from public;
grant execute on function public.respond_quotation(text,text,text,text) to anon, authenticated;
