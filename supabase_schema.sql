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


-- =====================================================================
-- v3 additions: product database, CRM, roles, tracking, attachments
-- Safe to re-run. Run the WHOLE file again in Supabase SQL Editor.
-- =====================================================================

-- ---------- staff roles ----------
alter table public.admin_users add column if not exists name text;
alter table public.admin_users add column if not exists role text;
update public.admin_users set role = 'owner' where role is null;   -- existing staff keep full access
alter table public.admin_users alter column role set default 'sales';
alter table public.admin_users alter column role set not null;
alter table public.admin_users drop constraint if exists admin_users_role_check;
alter table public.admin_users add constraint admin_users_role_check check (role in ('owner','sales'));

create or replace function public.is_vectra_owner()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.admin_users au where au.user_id = auth.uid() and au.role = 'owner');
$$;
revoke all on function public.is_vectra_owner() from public;
grant execute on function public.is_vectra_owner() to authenticated;

-- ---------- enquiry CRM columns ----------
alter table public.quotation_requests add column if not exists phone_key text
  generated always as (right(regexp_replace(customer_phone, '\D', '', 'g'), 10)) stored;
alter table public.quotation_requests add column if not exists attachments jsonb not null default '[]'::jsonb;
alter table public.quotation_requests add column if not exists assigned_to uuid references auth.users(id) on delete set null;
alter table public.quotation_requests add column if not exists follow_up_at date;
alter table public.quotation_requests add column if not exists updated_at timestamptz not null default now();
create index if not exists quotation_requests_phone_key_idx on public.quotation_requests(phone_key);
create index if not exists quotation_requests_followup_idx on public.quotation_requests(follow_up_at) where follow_up_at is not null;

-- public form may only set customer-supplied fields
drop policy if exists "Anyone can submit a quotation request" on public.quotation_requests;
create policy "Anyone can submit a quotation request" on public.quotation_requests
for insert to anon, authenticated
with check (
  status = 'pending'
  and assigned_to is null and follow_up_at is null
  and length(trim(customer_name)) between 1 and 180
  and length(trim(customer_phone)) between 5 and 40
  and (customer_email is null or (length(customer_email) <= 160 and customer_email ~ '^[^@\s]+@[^@\s]+\.[^@\s]+$'))
  and (customer_gstin is null or length(customer_gstin) <= 15)
  and (customer_notes is null or length(customer_notes) <= 1500)
  and jsonb_typeof(items) = 'array'
  and jsonb_array_length(items) between 1 and 100
  and pg_column_size(items) < 60000
  and jsonb_typeof(attachments) = 'array'
  and jsonb_array_length(attachments) <= 5
  and pg_column_size(attachments) < 4000
);

-- ---------- quotation upgrades ----------
alter table public.quotations add column if not exists charges jsonb not null default '[]'::jsonb;   -- freight / packing / discount rows
alter table public.quotations add column if not exists bill_to text;
alter table public.quotations add column if not exists ship_to text;
alter table public.quotations add column if not exists place_of_supply text;
alter table public.quotations add column if not exists payment_terms text;
alter table public.quotations add column if not exists delivery_terms text;
alter table public.quotations add column if not exists revision int not null default 0;
alter table public.quotations add column if not exists customer_feedback text;
alter table public.quotations add column if not exists customer_responded_at timestamptz;
alter table public.quotations add column if not exists updated_at timestamptz not null default now();

do $$
declare c text;
begin
  for c in select conname from pg_constraint
           where conrelid = 'public.quotations'::regclass and contype = 'c'
             and pg_get_constraintdef(oid) like '%issued%' and pg_get_constraintdef(oid) like '%accepted%'
  loop execute 'alter table public.quotations drop constraint ' || quote_ident(c); end loop;
end $$;
alter table public.quotations add constraint quotations_status_v3
  check (status in ('draft','issued','accepted','rejected','revision_requested','superseded'));

-- ---------- products (replaces products.json once imported) ----------
create table if not exists public.products (
  id bigint generated by default as identity primary key,
  name text not null check (length(trim(name)) between 1 and 200),
  category text not null check (length(trim(category)) between 1 and 120),
  brand text, model text, description text,
  specs jsonb not null default '[]'::jsonb,        -- [{"k":"Power","v":"850 W"}]
  image text,                                      -- legacy file name in /product/ or a full URL
  images jsonb not null default '[]'::jsonb,       -- extra image URLs
  datasheet text,
  hsn text, gst_rate numeric(4,1) not null default 18,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists products_category_idx on public.products(category);
alter table public.products enable row level security;

drop policy if exists "Public can read active products" on public.products;
create policy "Public can read active products" on public.products for select to anon, authenticated using (active);
drop policy if exists "Admins can read all products" on public.products;
create policy "Admins can read all products" on public.products for select to authenticated using (public.is_vectra_admin());
drop policy if exists "Owners write products" on public.products;
create policy "Owners write products" on public.products for all to authenticated
  using (public.is_vectra_owner()) with check (public.is_vectra_owner());
grant select on public.products to anon, authenticated;
grant insert, update, delete on public.products to authenticated;

create or replace function public.touch_updated_at() returns trigger language plpgsql as $$
begin new.updated_at := now(); return new; end $$;
drop trigger if exists trg_products_touch on public.products;
create trigger trg_products_touch before update on public.products for each row execute function public.touch_updated_at();
drop trigger if exists trg_requests_touch on public.quotation_requests;
create trigger trg_requests_touch before update on public.quotation_requests for each row execute function public.touch_updated_at();
drop trigger if exists trg_quotations_touch on public.quotations;
create trigger trg_quotations_touch before update on public.quotations for each row execute function public.touch_updated_at();

-- one-click import of the old products.json from the admin panel (keeps ids, never overwrites edits)
create or replace function public.import_products(p jsonb) returns int
language plpgsql security definer set search_path = public as $$
declare n int;
begin
  if not public.is_vectra_owner() then raise exception 'not authorised'; end if;
  with ins as (
    insert into public.products (id, name, category, image)
    select (e->>'id')::bigint, e->>'n', e->>'c', e->>'i' from jsonb_array_elements(p) e
    on conflict (id) do nothing returning 1)
  select count(*) into n from ins;
  perform setval(pg_get_serial_sequence('public.products','id'), greatest((select coalesce(max(id),1) from public.products), 1));
  return n;
end $$;
revoke all on function public.import_products(jsonb) from public, anon;
grant execute on function public.import_products(jsonb) to authenticated;

-- ---------- company settings ----------
create table if not exists public.settings (
  key text primary key,
  value jsonb not null,
  updated_at timestamptz not null default now()
);
alter table public.settings enable row level security;
drop policy if exists "Admins read settings" on public.settings;
create policy "Admins read settings" on public.settings for select to authenticated using (public.is_vectra_admin());
drop policy if exists "Owners write settings" on public.settings;
create policy "Owners write settings" on public.settings for all to authenticated
  using (public.is_vectra_owner()) with check (public.is_vectra_owner());
grant select, insert, update on public.settings to authenticated;
insert into public.settings (key, value) values ('company', jsonb_build_object(
  'name','VECTRA ENTERPRISES','tagline','INDUSTRIAL • ENERGY • MRO',
  'address','First Floor, Shop No. 135 Wing, Opp. Kataria Show Room, Makarpura, Vadodara, Gujarat – 390014',
  'phone','+91 75975 77129','email','vectra2029@yahoo.com','gstin','24ABCFV2730P1ZX','state_code','24',
  'logo','','validity_days',15,
  'terms','Prices are exclusive of GST unless stated. GST will be charged at applicable rates. Goods once sold will not be taken back.',
  'payment_terms','As mutually agreed','delivery_terms','Ex-Vadodara. Freight and transit insurance as mentioned.',
  'bank','','signatory','Authorised Signatory'))
on conflict (key) do nothing;

-- ---------- customers (filled automatically from enquiries) ----------
create table if not exists public.customers (
  phone_key text primary key,
  name text not null,
  phone text not null,
  email text, gstin text, address text, state text, notes text,
  last_enquiry_at timestamptz,
  created_at timestamptz not null default now()
);
alter table public.customers enable row level security;
drop policy if exists "Admins manage customers" on public.customers;
create policy "Admins manage customers" on public.customers for all to authenticated
  using (public.is_vectra_admin()) with check (public.is_vectra_admin());
grant select, insert, update on public.customers to authenticated;

create or replace function public.trg_upsert_customer() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if length(coalesce(new.phone_key,'')) >= 5 then
    insert into public.customers (phone_key, name, phone, email, gstin, last_enquiry_at)
    values (new.phone_key, new.customer_name, new.customer_phone, new.customer_email, new.customer_gstin, now())
    on conflict (phone_key) do update set
      last_enquiry_at = now(),
      email = coalesce(public.customers.email, excluded.email),
      gstin = coalesce(public.customers.gstin, excluded.gstin);
  end if;
  return new;
end $$;
drop trigger if exists trg_request_customer on public.quotation_requests;
create trigger trg_request_customer after insert on public.quotation_requests for each row execute function public.trg_upsert_customer();

insert into public.customers (phone_key, name, phone, email, gstin, last_enquiry_at)
select distinct on (phone_key) phone_key, customer_name, customer_phone, customer_email, customer_gstin, created_at
from public.quotation_requests where length(coalesce(phone_key,'')) >= 5
order by phone_key, created_at desc
on conflict (phone_key) do nothing;

-- ---------- follow-up / activity log ----------
create table if not exists public.enquiry_notes (
  id uuid primary key default gen_random_uuid(),
  request_id uuid not null references public.quotation_requests(id) on delete cascade,
  kind text not null default 'note' check (kind in ('note','call','whatsapp','email','status','customer')),
  body text not null check (length(body) between 1 and 1000),
  author uuid references auth.users(id) on delete set null,
  author_name text,
  created_at timestamptz not null default now()
);
create index if not exists enquiry_notes_request_idx on public.enquiry_notes(request_id, created_at desc);
alter table public.enquiry_notes enable row level security;
drop policy if exists "Admins read notes" on public.enquiry_notes;
create policy "Admins read notes" on public.enquiry_notes for select to authenticated using (public.is_vectra_admin());
drop policy if exists "Admins add notes" on public.enquiry_notes;
create policy "Admins add notes" on public.enquiry_notes for insert to authenticated
  with check (public.is_vectra_admin() and author = auth.uid());
grant select, insert on public.enquiry_notes to authenticated;

-- ---------- staff management (owner only; create the login in Authentication first) ----------
create or replace function public.add_staff(p_email text, p_name text, p_role text default 'sales') returns void
language plpgsql security definer set search_path = public as $$
declare u uuid;
begin
  if not public.is_vectra_owner() then raise exception 'not authorised'; end if;
  if p_role not in ('owner','sales') then raise exception 'invalid role'; end if;
  select id into u from auth.users where lower(email) = lower(trim(p_email));
  if u is null then raise exception 'No login found for %. Create the user in Supabase > Authentication first.', p_email; end if;
  insert into public.admin_users (user_id, email, name, role) values (u, lower(trim(p_email)), nullif(trim(p_name),''), p_role)
  on conflict (user_id) do update set name = coalesce(nullif(trim(p_name),''), public.admin_users.name), role = excluded.role;
end $$;
create or replace function public.remove_staff(p_user uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not public.is_vectra_owner() then raise exception 'not authorised'; end if;
  if p_user = auth.uid() then raise exception 'You cannot remove yourself.'; end if;
  delete from public.admin_users where user_id = p_user;
end $$;
revoke all on function public.add_staff(text,text,text), public.remove_staff(uuid) from public, anon;
grant execute on function public.add_staff(text,text,text), public.remove_staff(uuid) to authenticated;

-- ---------- customer-facing tracking (no login: reference + mobile number) ----------
create or replace function public.track_enquiry(p_ref text, p_phone text) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare r public.quotation_requests;
begin
  select * into r from public.quotation_requests
  where upper(left(id::text, 8)) = upper(trim(p_ref))
    and phone_key = right(regexp_replace(coalesce(p_phone,''), '\D', '', 'g'), 10)
  limit 1;
  if not found then return null; end if;
  return jsonb_build_object(
    'ref', upper(left(r.id::text, 8)), 'status', r.status, 'created_at', r.created_at,
    'customer', jsonb_build_object('name', r.customer_name, 'phone', r.customer_phone, 'email', r.customer_email, 'gstin', r.customer_gstin),
    'items', r.items,
    'quotations', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', q.id, 'quote_number', q.quote_number, 'quote_date', q.quote_date, 'valid_until', q.valid_until,
        'gst_treatment', q.gst_treatment, 'items', q.items, 'charges', q.charges, 'terms', q.terms,
        'payment_terms', q.payment_terms, 'delivery_terms', q.delivery_terms, 'bill_to', q.bill_to, 'ship_to', q.ship_to,
        'place_of_supply', q.place_of_supply, 'taxable_total', q.taxable_total, 'gst_total', q.gst_total,
        'grand_total', q.grand_total, 'status', q.status, 'revision', q.revision, 'customer_feedback', q.customer_feedback)
        order by q.created_at desc)
      from public.quotations q where q.request_id = r.id and q.status not in ('draft','superseded')), '[]'::jsonb),
    'company', (select value from public.settings where key = 'company'));
end $$;

create or replace function public.respond_to_quotation(p_ref text, p_phone text, p_quote uuid, p_action text, p_message text default null)
returns text language plpgsql security definer set search_path = public as $$
declare r public.quotation_requests; q public.quotations; s text; who text;
begin
  if p_action not in ('accept','reject','revise') then raise exception 'invalid action'; end if;
  select * into r from public.quotation_requests
  where upper(left(id::text, 8)) = upper(trim(p_ref))
    and phone_key = right(regexp_replace(coalesce(p_phone,''), '\D', '', 'g'), 10) limit 1;
  if not found then raise exception 'Enquiry not found'; end if;
  select * into q from public.quotations where id = p_quote and request_id = r.id and status in ('issued','revision_requested');
  if not found then raise exception 'This quotation can no longer be changed online.'; end if;
  s := case p_action when 'accept' then 'accepted' when 'reject' then 'rejected' else 'revision_requested' end;
  update public.quotations set status = s, customer_feedback = nullif(left(trim(coalesce(p_message,'')), 500), ''), customer_responded_at = now() where id = q.id;
  insert into public.enquiry_notes (request_id, kind, body, author_name)
  values (r.id, 'customer', 'Customer ' || case p_action when 'accept' then 'ACCEPTED' when 'reject' then 'REJECTED' else 'requested a REVISION of' end
         || ' quotation ' || q.quote_number || coalesce(': ' || nullif(left(trim(coalesce(p_message,'')), 500), ''), ''), r.customer_name);
  return s;
end $$;
revoke all on function public.track_enquiry(text,text), public.respond_to_quotation(text,text,uuid,text,text) from public;
grant execute on function public.track_enquiry(text,text), public.respond_to_quotation(text,text,uuid,text,text) to anon, authenticated;

-- most requested products (ids only) for the homepage
create or replace function public.popular_products(p_limit int default 8) returns table(pid bigint, n bigint)
language sql stable security definer set search_path = public as $$
  select (e->>'pid')::bigint, count(*) from public.quotation_requests r, jsonb_array_elements(r.items) e
  where (e->>'pid') ~ '^\d{1,12}$' group by 1 order by 2 desc limit least(greatest(p_limit,1),24);
$$;
revoke all on function public.popular_products(int) from public;
grant execute on function public.popular_products(int) to anon, authenticated;

-- ---------- storage: customer reference files (private) and product images (public) ----------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types) values
  ('enquiry-files','enquiry-files', false, 5242880, array['image/jpeg','image/png','image/webp','application/pdf']),
  ('product-images','product-images', true, 3145728, array['image/jpeg','image/png','image/webp','application/pdf'])
on conflict (id) do update set file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "Anyone can upload enquiry files" on storage.objects;
create policy "Anyone can upload enquiry files" on storage.objects for insert to anon, authenticated
  with check (bucket_id = 'enquiry-files' and (storage.foldername(name))[1] ~ '^[0-9a-f-]{36}$');
drop policy if exists "Admins read enquiry files" on storage.objects;
create policy "Admins read enquiry files" on storage.objects for select to authenticated
  using (bucket_id = 'enquiry-files' and public.is_vectra_admin());
drop policy if exists "Owners manage product images" on storage.objects;
create policy "Owners manage product images" on storage.objects for all to authenticated
  using (bucket_id = 'product-images' and public.is_vectra_owner())
  with check (bucket_id = 'product-images' and public.is_vectra_owner());

-- live "new enquiry" alerts in the admin panel
do $$ begin
  alter publication supabase_realtime add table public.quotation_requests;
exception when duplicate_object then null; when undefined_object then null; end $$;
