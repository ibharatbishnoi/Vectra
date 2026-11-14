# Vectra Enterprises — catalogue & live quotation system (v2)

Static site for Vercel + Supabase. Public catalogue at `/`, staff portal at `/admin`.

## Files
- `index.html`, `app.js`, `styles.css` — public catalogue, quotation list drawer and request form
- `admin.html` — staff portal (request inbox, quotation editor, saved quotations, print/PDF)
- `products.json` + `images/` — the catalogue data and product photos (edit `products.json` to add/remove items)
- `config.js` — Supabase URL + anon key
- `supabase_schema.sql` — tables, Row Level Security, auto quote numbering
- `vercel.json`, `robots.txt` — hosting headers/caching, hide `/admin` from search

## Setup (same as before)
1. Create a Supabase project; put the Project URL and anon key in `config.js`.
2. Run **all of** `supabase_schema.sql` in Supabase → SQL Editor. It is safe to re-run on an existing v1 database (it upgrades policies and adds `next_quote_number()`).
3. Add staff: create a user in Authentication → Users, then run
   ```sql
   insert into public.admin_users (user_id, email)
   select id, email from auth.users where lower(email) = lower('staff@example.com')
   on conflict (user_id) do update set email = excluded.email;
   ```
4. Push the folder to GitHub (files at repo root) → import in Vercel (Framework: Other, no build command, output `.`).
5. Replace `YOUR-DOMAIN.vercel.app` in the `<link rel="canonical">` of `index.html` with your real domain.

## Still your responsibility
- GST rate, HSN/SAC and place of supply must be confirmed with your accountant; the software only calculates what staff enter.
- Turn on Supabase backups; consider Cloudflare Turnstile if spam becomes a problem (the form already has a honeypot, a 30-second cooldown and server-side size/format checks).
- Quotation emailing is not automated; use Print/Save PDF and the WhatsApp button.


## V3 business management upgrade
The V3 migration adds a Supabase-backed product catalogue, customer CRM and follow-up reminders. Quotation editing also supports discount and freight/other charges, and the print/PDF output includes both adjustments. Existing public catalogue, quotation request flow, admin authentication, quote numbering and print/PDF workflow are retained.

### Upgrade steps
1. Back up the Supabase project before schema changes.
2. Run the complete updated `supabase_schema.sql` in Supabase SQL Editor. It adds `products`, `customers`, and `followups`, plus a trigger that syncs incoming enquiries into the customer table.
3. Sign in to `/admin`, open **Products**, and import the initial catalogue using the migration SQL below (or use the `products.json` data in the repository).
4. The public site accepts `.xlsx`, `.xls`, and `.csv` bulk enquiry files. First-sheet columns supported: `Product`/`Name`/`Product Name`/`Item`, `Quantity`/`Qty`, `Size`/`Specification`, `Make`/`Brand`, `Description`/`Note`. Up to 100 rows are processed per upload.
5. Customer and follow-up screens are admin-only under the existing `is_vectra_admin()` RLS guard.

### Initial catalogue import SQL
For an initial import, run `catalogue_seed.sql` once after the V3 migration. It upserts all 285 existing products by ID. Product manager edits are stored in Supabase, and the public catalogue automatically prefers active Supabase products when rows exist, otherwise it falls back to `products.json`.

### Important rollout note
The V3 product manager stores live products in Supabase, while the public catalogue continues to use `products.json` as a safe fallback until the initial product import and public live-catalogue cutover are completed. Quotation PDFs remain browser print-to-PDF (no server-side PDF dependency). Verify company GSTIN, terms, tax treatment and quote calculations with your accountant before issuing customer documents.
