#!/usr/bin/env python3
"""Generate one SEO-friendly static page per product (p/<id>.html), sitemap.xml and robots.txt.

Run from the project root, then commit and push:
    python3 tools/build_seo.py            # uses products.json
    python3 tools/build_seo.py --live     # uses your live Supabase product list (needs internet)

Products you add in Admin work immediately for customers (the site loads them from the database
and /p/<id> falls back to the app). Re-run this script occasionally so Google also gets
a dedicated page, title and description for each new product.
"""
import json, re, sys, html, urllib.request, pathlib

ROOT = pathlib.Path(__file__).resolve().parent.parent
cfg = (ROOT / "config.js").read_text()
SITE = (re.search(r'VECTRA_SITE_URL\s*=\s*"([^"]+)"', cfg) or [None, "https://vectra-enterprises.vercel.app"])[1].rstrip("/")

def live_products():
    url = re.search(r'url:\s*"([^"]+)"', cfg)[1]; key = re.search(r'anonKey:\s*"([^"]+)"', cfg)[1]
    req = urllib.request.Request(f"{url}/rest/v1/products?select=*&active=eq.true&order=id&limit=3000", headers={"apikey": key, "Authorization": f"Bearer {key}"})
    rows = json.load(urllib.request.urlopen(req, timeout=20))
    return [dict(id=r["id"], n=r["name"], c=r["category"], i=r.get("image"), brand=r.get("brand") or "", d=r.get("description") or "") for r in rows]

if "--live" in sys.argv:
    products = live_products()
else:
    products = [dict(p, brand="", d="") for p in json.load(open(ROOT / "products.json"))["products"]]

tpl = (ROOT / "index.html").read_text()
# product pages live in /p/, so make every asset link absolute (index.html already uses root-absolute paths)
out = ROOT / "p"; out.mkdir(exist_ok=True)
for old in out.glob("*.html"): old.unlink()

def img_url(f):
    if not f: return ""
    return f if f.startswith("http") else f"{SITE}/product/{f}"

for p in products:
    name, cat = html.escape(p["n"], quote=True), html.escape(p["c"], quote=True)
    desc = (p["d"] or f'{p["n"]} — {p["c"]} available from Vectra Enterprises, Vadodara. Request an item-wise GST quotation online.')[:300]
    desc_e = html.escape(desc, quote=True); url = f'{SITE}/p/{p["id"]}'; img = img_url(p.get("i"))
    ld = {"@context": "https://schema.org", "@type": "Product", "name": p["n"], "category": p["c"], "url": url,
          "description": desc, "brand": {"@type": "Brand", "name": p["brand"]} if p["brand"] else None, "image": img or None}
    ld = {k: v for k, v in ld.items() if v}
    page = tpl
    page = re.sub(r"<title>.*?</title>", f"<title>{name} | Vectra Enterprises, Vadodara</title>", page, 1, re.S)
    page = re.sub(r'<meta name="description" content="[^"]*">', f'<meta name="description" content="{desc_e}">', page, 1)
    page = re.sub(r'<link rel="canonical" href="[^"]*">', f'<link rel="canonical" href="{url}">', page, 1)
    page = re.sub(r'<meta property="og:title" content="[^"]*">', f'<meta property="og:title" content="{name} | Vectra Enterprises">', page, 1)
    page = re.sub(r'<meta property="og:description" content="[^"]*">', f'<meta property="og:description" content="{desc_e}">', page, 1)
    page = re.sub(r'<meta property="og:url" content="[^"]*">', f'<meta property="og:url" content="{url}"><meta property="og:image" content="{html.escape(img, quote=True)}">', page, 1)
    page = page.replace("</head>", '<script type="application/ld+json">' + json.dumps(ld, ensure_ascii=False).replace("</", "<\\/") + "</script>\n</head>", 1)
    (out / f'{p["id"]}.html').write_text(page)

urls = [SITE + "/"] + [f'{SITE}/p/{p["id"]}' for p in products]
(ROOT / "sitemap.xml").write_text('<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n' + "".join(f"<url><loc>{u}</loc></url>\n" for u in urls) + "</urlset>\n")
(ROOT / "robots.txt").write_text(f"User-agent: *\nDisallow: /admin\nDisallow: /track\nSitemap: {SITE}/sitemap.xml\n")
print(f"Generated {len(products)} product pages, sitemap.xml and robots.txt for {SITE}")
