# AI purchase-order reader: setup

## How it works
1. Customer clicks **Upload PO** and chooses a PDF, photo/scan, Excel, CSV, Word (.docx) or text file.
2. The browser prepares it: Excel/CSV/Word are converted to text; photos are shrunk; PDFs are sent as-is.
3. `/api/parse-po` (a Vercel serverless function in `api/parse-po.js`) sends the file plus your catalogue to Claude, which returns structured line items (description, quantity, unit, size, brand) and the best catalogue match for each.
4. The customer sees the normal review table (matched product, quantity, size, brand), fixes anything, and adds it to the quotation list.
5. A copy of the PO is attached to the request automatically so your team can compare it.
The API key stays on the server. The customer never sees it.

## One-time setup (about 5 minutes)
1. **Anthropic key**: create one at console.anthropic.com and add credit.
2. **Vercel**: Project → Settings → Environment Variables → add `ANTHROPIC_API_KEY` (all environments). Optional: `ANTHROPIC_MODEL`, `ALLOWED_ORIGINS` (add your custom domain once you have one).
3. **Supabase**: SQL Editor → run `supabase_po_upload_migration.sql` (allows Excel/CSV/Word attachments).
4. **Deploy** this folder to Vercel as before. The `api/` folder is picked up automatically.
5. **Test**: open the site, Upload PO, choose a sample PO, check the table, submit, and confirm the attachment appears in /admin.

If the key is missing or the service is down, customers see a friendly message and an "Attach this file to my request instead" button, so no PO is lost.

## Limits
- PDFs/photos: about 3 MB for automatic reading (Vercel request limit). Larger files can still be attached (5 MB) and read manually.
- Excel/CSV/Word: up to 10 MB, first 6 sheets / 600 rows per sheet, about 60,000 characters of text.
- Not read automatically: legacy .doc, .rtf, .odt, password-protected PDFs, ZIP files (the customer is asked to save as PDF or .docx).
- Scanned or handwritten POs depend on quality; the review step catches mistakes.

## Cost and abuse protection
- Each PO read costs a small amount of API credit (typically a few paise to a few rupees depending on pages and model). Set a monthly spend limit in the Anthropic console.
- Built in: same-site check, 8 reads per IP per 10 minutes (per warm server instance), file-size limits, honest error messages.
- Recommended before heavy promotion: turn on Vercel Firewall rate limiting for `/api/parse-po`, or add Cloudflare Turnstile.

## Privacy
`privacy.html` now says customer POs are sent to an AI service. Do not remove that. Tell customers not to upload bank details or passwords.

## Matching quality tips
- Fill in clear product names and brands in the admin panel: the AI matches against them.
- If a product is often unmatched, add it to the catalogue.
