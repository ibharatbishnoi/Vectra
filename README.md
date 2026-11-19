# Vectra Enterprises — B2B catalogue, quotation & CRM platform (v3)

Static site for Vercel + Supabase (no build step). Public catalogue at `/`, customer tracking at `/track`, staff portal at `/admin`.

## What's new in v3
**Customers:** product pages (`/p/<id>`) with specs, gallery zoom, datasheets, related items · brand/sort filters · compare up to 3 products · category cards, recently viewed, frequently requested · **bulk enquiry from Excel/CSV or pasted list** with catalogue matching · attach photos/drawings/PO to an enquiry · **track enquiry** (reference + mobile): status, view/download quotation PDF, accept / decline / request revision · installable as an app (PWA).

**Staff (`/admin`):** dashboard (KPIs, follow-ups due, 6-month chart, win rate) · enquiry workspace (assign, follow-up date, call/WhatsApp notes, attachments) · quotation builder (per-line discount, units, HSN, freight/packing/extra discount with their own GST, bill-to/ship-to, place of supply, payment & delivery terms, last-quoted-rate hints, add items from catalogue, revisions R1/R2…) · professional printable PDF with logo and bank details · WhatsApp/email/tracking-link sharing · customers database (auto-created) · **product manager** (add/edit/hide, photos auto-resized to WebP, specs, datasheet PDF, category rename, one-click import of `products.json`, **bulk add from many photos and/or an Excel sheet**) · reports + CSV export · company settings · staff roles (Owner / Sales) · live "new enquiry" alert.

## Upgrade steps (existing v2 install)
1. Supabase → SQL Editor → paste and run the **whole** `supabase_schema.sql` (safe to re-run; existing staff become *Owner*).
2. Deploy these files (GitHub → Vercel as before).
3. Open `/admin` → **Products** → *Import products.json into the database* (once). Until then the site keeps using `products.json`, so nothing breaks.
4. Admin → **Settings**: check company details, upload logo, add bank details and default terms.
5. Add staff: create the login in Supabase → Authentication → Users, then Admin → **Staff** → add the email.
6. Run `python3 tools/build_seo.py` and push — generates a page per product + `sitemap.xml`. Re-run after adding many products (`--live` reads your database). Submit `sitemap.xml` in Google Search Console.

## Files
`index.html` `app.js` — public site · `track.html` `track.js` — customer tracking · `admin.html` `admin.js` `admin.css` — staff portal · `shared.js` — quote maths + printable quotation · `supabase_schema.sql` — database · `sw.js` `manifest.webmanifest` `icons/` — PWA · `tools/build_seo.py` · `products.json` + `product/` — original catalogue and photos (fallback).

## Not included / your responsibility
- GST rate, HSN/SAC and place of supply must be confirmed with your accountant.
- Automatic WhatsApp/email sending needs a server component (Supabase Edge Function + WhatsApp Business API / email provider). Today staff use the WhatsApp/Email buttons, which prefill the message with the tracking link.
- PDF = browser *Print → Save as PDF*.
- Customer-wise price lists, inventory, orders/delivery tracking, Hindi version and AI search are not built yet.
- Turn on Supabase backups; consider Cloudflare Turnstile if spam grows (form has a honeypot, cooldown and server-side checks). Attachments are limited to 5 files × 5 MB, images/PDF.
- Excel reading loads SheetJS from `cdn.sheetjs.com` only when someone uses bulk upload.


## High-priority refinement pass
- Homepage trust counters now start neutral and populate from the live catalogue, avoiding stale hard-coded figures.
- Public catalogue categories are grouped into a consistent display taxonomy; original database category values are not changed.
- Catalogue search now includes product specifications and the stable product ID (`VE-<id>`).
- Broken product images fall back to a neutral placeholder; catalogue loading errors show a retry action.
- Mobile users get a persistent quotation-list action.
- Recent enquiry shortcuts no longer retain customer mobile numbers in persistent local storage. Contact form details are kept only in the current browser tab session.
- Added HSTS and an additional browser security header in `vercel.json`.

See `HIGH_PRIORITY_IMPROVEMENTS.md` for the change summary, checks performed and deployment notes.
