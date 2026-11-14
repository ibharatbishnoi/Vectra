# Vectra Enterprises — catalogue, quotation & mini-CRM (v3)

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


## What's new in v3
**Public site:** category cards, recently added, product detail pop-up (description, specs, related items, deep link `#p-12`), sort + search across brand/description, **bulk enquiry** (paste or Excel/CSV, auto-matches your catalogue), **quotation tracking** by reference + mobile with online Accept / Decline, "Why Vectra" section, fixed staff-login iframe (now relative `/admin`).

**Admin:** Dashboard (KPIs, 6-month chart, due follow-ups, CSV export), enquiry handling (assign salesperson, follow-up date/note, internal notes, won/lost), date/staff filters, customer list, **Product Manager** (add/edit/hide products, specs, photo upload to Supabase Storage), quotation builder with per-line discount, freight (+GST), payment & delivery terms, editable/removable lines, *Save as new revision*, WhatsApp + Email buttons.

## Upgrading from v2
1. Re-run the **whole** `supabase_schema.sql` in the Supabase SQL Editor (safe to re-run; the v3 block is at the bottom).
2. Deploy the new files. Open `/admin` → **Products** → *Import catalogue from products.json* (one click). From then on the website reads products from the database; `products.json` stays as an automatic fallback.
3. Replace `YOUR-DOMAIN.vercel.app` in `index.html`, `robots.txt` and `sitemap.xml`.
4. Product photos in `/product` keep working; new uploads are stored in the `product-images` bucket.

Note: product ids in the database follow `products.json` order on first import, so existing customers' saved lists keep working.
