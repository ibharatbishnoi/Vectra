# Vectra Enterprises — v4 changes

## Added
- Logo in header (9 KB WebP) and a social-share image (`assets/og-image.jpg`) so WhatsApp/LinkedIn links show a preview.
- Sharper hero headline and copy; clearer About section.
- Trust strip fields driven by `config.js` (`VECTRA_COMPANY`): GSTIN, year established, hours, quote turnaround. Empty = hidden. Nothing invented.
- Industries cards that jump to the matching catalogue category.
- FAQ section (+ FAQPage schema on the homepage).
- "Request a call back" form (saved as an enquiry marked CALL-BACK REQUEST; appears in /admin, no database change needed).
- Mobile bottom bar: Call | WhatsApp | Quote list.
- Quotation list: Download CSV, Share on WhatsApp.
- Privacy policy (/privacy), Terms (/terms), custom 404 page; footer links. Staff Login moved to the footer.
- Optional Google Analytics 4 (set `VECTRA_GA_ID`). Events: quote_submit, callback_submit, call_click, whatsapp_click, bulk_upload_open, list_download, list_share_whatsapp.
- Richer LocalBusiness schema, BreadcrumbList on product pages, `lastmod` in sitemap.
- Service worker cache bumped to v4; /assets cached for 30 days.

## Removed
- `extras.js` (not loaded by any page; referenced elements that no longer exist) and empty stray files (`assets/image`, `icons/ii`, `tools/tooolss`, `p/bbb`).
- 2.9 MB unused `vectra-hero-background.png` (an 89 KB WebP copy is kept for reuse).

## To do on your side
1. Fill `VECTRA_COMPANY` in `config.js` (GSTIN, year, hours): only true facts.
2. Have your accountant/lawyer review `privacy.html` and `terms.html`.
3. Add brands to products in Admin so the "Brands we supply" section appears.
4. Get a custom domain and business email (Yahoo address and vercel.app URL lower trust). Then update `VECTRA_SITE_URL` in config.js, the URLs in index.html/robots.txt, and re-run `python3 tools/build_seo.py`.
5. Run `python3 tools/build_seo.py --live` after adding products; submit sitemap.xml in Google Search Console.
6. Create a Google Business Profile for the Makarpura address.
7. Call-back entries contain one placeholder item ("Call-back request"); don't send them out as priced quotes.
