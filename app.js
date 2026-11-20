"use strict";
(() => {
const V = window.Vectra, db = V.db, safe = V.safe;
const $ = id => document.getElementById(id);
const PAGE = 24, MAXCART = 100, KEY = "vectra_cart_v2", CKEY = "vectra_contact_v2", RKEY = "vectra_recent_v3", EKEY = "vectra_enquiries_v3";
const WA = "917597577129";
let P = [], byId = new Map(), cats = [], brands = [], popular = [];
let cat = "All", brand = "", sort = "default", q = "", shown = PAGE, cart = load(KEY, []), cmp = [], files = [], cur = null;

function load(k, d) { try { return JSON.parse(localStorage.getItem(k)) || d } catch { return d } }
function save(k, v) { try { localStorage.setItem(k, JSON.stringify(v)) } catch { } }
// Migrate older recent-enquiry entries so mobile numbers are not retained in persistent browser storage.
try { const old = JSON.parse(localStorage.getItem(EKEY) || "[]"); if (Array.isArray(old)) save(EKEY, old.filter(x => x && x.ref).map(x => ({ ref: String(x.ref), name: String(x.name || ""), at: Number(x.at) || 0 })).slice(0, 8)); } catch { }
try { localStorage.removeItem(CKEY); } catch { }
const el = (t, c, x) => { const e = document.createElement(t); if (c) e.className = c; if (x != null) e.textContent = x; return e };
const toast = t => { const e = $("toast"); e.textContent = t; e.classList.add("on"); clearTimeout(toast.t); toast.t = setTimeout(() => e.classList.remove("on"), 2000) };
const clampQty = v => Math.min(9999, Math.max(1, parseInt(v, 10) || 1));
const spec = x => [x.size && "Size: " + x.size, x.make && "Make: " + x.make, x.note].filter(Boolean).join(", ");
const PH = "data:image/svg+xml," + encodeURIComponent("<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 46 46'><rect width='46' height='46' fill='#eef1f5'/><text x='23' y='31' font-size='22' text-anchor='middle'>✎</text></svg>");
const pImg = p => p.imgs[0] || PH;

/* ================= catalogue loading (database first, products.json as fallback) ================= */
const tok = s => (String(s).toLowerCase().match(/[a-z0-9]+/g) || []).map(w => w.length > 3 && w.endsWith("s") ? w.slice(0, -1) : w);
const CATEGORY_ALIASES = {
  "General Hardware": "Hardware & Workshop",
  "General Hardware & Workshop": "Hardware & Workshop",
  "Fasteners & Consumables": "Fasteners & Hardware",
  "Fasteners & Hardware": "Fasteners & Hardware",
  "Hand Tools & Storage": "Hand Tools",
  "Hand Tools": "Hand Tools",
  "Power Tools & Drilling": "Power Tools & Drilling",
  "Drilling Tools": "Power Tools & Drilling",
  "Valves, Pipes & Fittings": "Valves, Pipes & Fittings",
  "Pipes & Fittings": "Valves, Pipes & Fittings",
  "Welding Equipment & Gas Cutting": "Welding & Gas Equipment",
  "Welding & Gas Equipment": "Welding & Gas Equipment",
  "Motors, Pumps & Electrical": "Pumps, Motors & Electrical",
  "Pumps & Motors": "Pumps, Motors & Electrical",
  "Measuring Tools": "Measuring, Survey & Lighting"
};
function finish(p) {
  p.c = CATEGORY_ALIASES[p.c] || p.c;
  const specText = (p.specs || []).map(x => `${x.k || ""} ${x.v || ""}`).join(" ");
  const searchText = [p.n, p.c, p.brand, p.model, p.d, specText, `VE-${p.id}`, p.id].join(" ");
  p.tokens = new Set(tok(searchText));
  p.hay = searchText.toLowerCase();
  return p;
}
const fromDb = r => finish({ id: r.id, n: r.name, c: r.category, brand: r.brand || "", model: r.model || "", d: r.description || "",
  specs: Array.isArray(r.specs) ? r.specs.filter(s => s && s.k && s.v) : [], imgs: [r.image, ...(Array.isArray(r.images) ? r.images : [])].filter(Boolean).map(V.imgUrl),
  ds: r.datasheet || "", hsn: r.hsn || "", gst: r.gst_rate, t: r.created_at ? Date.parse(r.created_at) : 0 });
const fromJson = x => finish({ id: x.id, n: x.n, c: x.c, brand: x.brand || "", model: x.model || "", d: x.d || "", specs: Array.isArray(x.specs) ? x.specs : [], imgs: [x.i, ...(x.images || [])].filter(Boolean).map(V.imgUrl), ds: x.ds || "", hsn: x.hsn || "", gst: x.gst || 18, t: 0 });

async function loadCatalogue() {
  if (db) {
    try {
      const r = await Promise.race([db.from("products").select("*").order("id").limit(2000), new Promise((_, j) => setTimeout(j, 6000))]);
      if (!r.error && r.data && r.data.length) return r.data.filter(x => x.active === true).map(fromDb);
    } catch { /* fall through to products.json */ }
  }
  const response = await fetch("/products.json", { cache: "no-cache" });
  if (!response.ok) throw new Error("Catalogue file could not be loaded");
  const d = await response.json();
  if (!d || !Array.isArray(d.products)) throw new Error("Catalogue data is invalid");
  return d.products.filter(x => x.active !== false).map(fromJson);
}

loadCatalogue().then(list => {
  P = list; byId = new Map(P.map(p => [p.id, p]));
  cats = [...new Set(P.map(p => p.c))];
  brands = [...new Set(P.map(p => p.brand).filter(Boolean))].sort((a, b) => a.localeCompare(b));
  $("nProd").textContent = P.length; $("nCat").textContent = cats.length;
  readUrl(); chips(); brandUi(); renderCats(); renderBrands(); renderStrips(); render(); drawCart();
  const m = location.pathname.match(/^\/p\/(\d+)/); if (m && byId.has(+m[1])) openProduct(+m[1], false);
  loadPopular();
}).catch(() => { $("count").textContent = "The catalogue could not be loaded. Please refresh the page or contact us on WhatsApp."; const b = el("button", "btn ghost", "Retry loading catalogue"); b.type = "button"; b.onclick = () => location.reload(); $("grid").replaceChildren(b); });
$("year").textContent = new Date().getFullYear();

/* ================= homepage sections ================= */
function renderCats() {
  const box = $("catCards"); box.innerHTML = "";
  cats.forEach(c => {
    const items = P.filter(p => p.c === c), b = el("button", "catcard"); b.type = "button";
    const im = new Image(); im.src = pImg(items[0]); im.alt = ""; im.loading = "lazy"; im.width = 80; im.height = 80; im.onerror = () => { im.onerror = null; im.src = PH };
    const t = el("span", "", c), n = el("small", "", items.length + " products"); const w = el("div"); w.append(t, n);
    b.append(im, w); b.onclick = () => { cat = c; shown = PAGE; chips(); render(); $("catalog").scrollIntoView() }; box.appendChild(b);
  });
}
function renderBrands() {
  $("brandsec").hidden = brands.length < 2; const r = $("brandRow"); r.innerHTML = "";
  brands.forEach(b => { const x = el("button", "chip", b); x.type = "button"; x.onclick = () => { brand = b; cat = "All"; shown = PAGE; chips(); brandUi(); render(); $("catalog").scrollIntoView() }; r.appendChild(x) });
}
function strip(secId, boxId, list) {
  const sec = $(secId), box = $(boxId); box.innerHTML = ""; sec.hidden = !list.length; if (!list.length) return;
  list.forEach(p => {
    const a = el("a", "scard"); a.href = "/p/" + p.id; const im = new Image(); im.src = pImg(p); im.alt = ""; im.loading = "lazy"; im.width = 64; im.height = 64; im.onerror = () => { im.onerror = null; im.src = PH };
    a.append(im, el("span", "", p.n)); a.onclick = e => { e.preventDefault(); openProduct(p.id) }; box.appendChild(a);
  });
}
function renderStrips() {
  strip("recsec", "recStrip", load(RKEY, []).map(id => byId.get(id)).filter(Boolean).slice(0, 8));
  const monthAgo = Date.now() - 45 * 864e5, fresh = P.filter(p => p.t > monthAgo).sort((a, b) => b.t - a.t);
  strip("newsec", "newStrip", fresh.length && fresh.length < P.length * 0.5 ? fresh.slice(0, 8) : []);
}
async function loadPopular() {
  if (!db) return;
  try { const { data } = await db.rpc("popular_products", { p_limit: 8 }); const l = (data || []).map(r => byId.get(+r.pid)).filter(Boolean); strip("popsec", "popStrip", l.length >= 4 ? l : []) } catch { }
}

/* ================= filters, URL state, grid ================= */
function readUrl() { const u = new URLSearchParams(location.search); if (location.pathname.startsWith("/p/")) return; q = (u.get("q") || "").trim(); const c = u.get("c"); if (c && cats.includes(c)) cat = c; brand = u.get("b") || ""; sort = u.get("s") || "default"; $("search").value = q; $("sortSel").value = sort }
function syncUrl() {
  if (location.pathname.startsWith("/p/")) return; const u = new URLSearchParams();
  if (q) u.set("q", q); if (cat !== "All") u.set("c", cat); if (brand) u.set("b", brand); if (sort !== "default") u.set("s", sort);
  const s = u.toString(); history.replaceState(null, "", location.pathname + (s ? "?" + s : "") + location.hash);
}
function chips() {
  const f = $("filters"); f.innerHTML = "";
  ["All", ...cats].forEach(c => { const b = el("button", "chip", c); b.type = "button"; b.setAttribute("aria-pressed", c === cat); b.onclick = () => { cat = c; shown = PAGE; chips(); render() }; f.appendChild(b) });
}
function brandUi() {
  $("brandWrap").hidden = !brands.length; const s = $("brandSel"); s.innerHTML = "";
  [["", "All brands"], ...brands.map(b => [b, b])].forEach(([v, l]) => { const o = el("option", "", l); o.value = v; s.appendChild(o) }); s.value = brand;
}
function filtered() {
  const words = q.toLowerCase().split(/\s+/).filter(Boolean);
  let r = P.filter(p => (cat === "All" || p.c === cat) && (!brand || p.brand === brand) && words.every(w => p.hay.includes(w)));
  if (words.length) { const sc = p => words.reduce((s, w) => s + (p.n.toLowerCase().includes(w) ? 2 : 0) + (p.n.toLowerCase().startsWith(w) ? 1 : 0), 0); r = r.map((p, i) => [p, sc(p), i]).sort((a, b) => b[1] - a[1] || a[2] - b[2]).map(x => x[0]) }
  if (sort === "az") r = [...r].sort((a, b) => a.n.localeCompare(b.n)); else if (sort === "za") r = [...r].sort((a, b) => b.n.localeCompare(a.n)); else if (sort === "new") r = [...r].sort((a, b) => b.t - a.t || b.id - a.id);
  return r;
}
function render() {
  syncUrl(); const r = filtered();
  $("resetF").hidden = !(q || brand || cat !== "All");
  $("count").textContent = r.length ? `Showing ${Math.min(shown, r.length)} of ${r.length} products` : "";
  const g = $("grid"); g.innerHTML = "";
  if (!r.length) {
    const e = el("div", "empty", "No products match. You can add it to your list manually and we will quote it. "), b = el("button", "btn ghost", q ? `Add “${q}” manually` : "Add a custom item");
    b.type = "button"; b.onclick = () => openCustom(q); e.appendChild(b); g.appendChild(e); $("more").hidden = true; return;
  }
  const fr = document.createDocumentFragment();
  r.slice(0, shown).forEach(p => fr.appendChild(card(p)));
  g.appendChild(fr); $("more").hidden = r.length <= shown;
}
function card(p) {
  const c = el("article", "card"), ph = el("a", "photo"), im = new Image(); ph.href = "/p/" + p.id; ph.setAttribute("aria-label", "View " + p.n);
  im.src = pImg(p); im.alt = p.n; im.loading = "lazy"; im.width = 240; im.height = 212; im.onerror = () => { im.onerror = null; im.src = PH }; ph.appendChild(im); ph.onclick = e => { e.preventDefault(); openProduct(p.id) };
  const b = el("div", "cb"), a = el("div", "act"), qt = el("input", "qty"); qt.type = "number"; qt.min = 1; qt.max = 9999; qt.value = 1; qt.setAttribute("aria-label", "Quantity for " + p.n);
  const ad = el("button", "add", "Add to list"); ad.type = "button";
  ad.onclick = () => { add(p.id, clampQty(qt.value)); ad.textContent = "Added ✓"; ad.classList.add("done"); setTimeout(() => { ad.textContent = "Add to list"; ad.classList.remove("done") }, 1200) };
  a.append(qt, ad);
  const h = el("h3"), hl = el("a", "", p.n); hl.href = "/p/" + p.id; hl.onclick = e => { e.preventDefault(); openProduct(p.id) }; h.appendChild(hl);
  const cl = el("label", "cmp"), cb = el("input"); cb.type = "checkbox"; cb.checked = cmp.includes(p.id); cb.onchange = () => toggleCmp(p.id, cb); cl.append(cb, " Compare");
  b.append(el("div", "cat", p.c), h, p.brand ? el("div", "brandtag", p.brand) : document.createDocumentFragment(), a, cl); c.append(ph, b); return c;
}
let t; $("search").addEventListener("input", e => { clearTimeout(t); t = setTimeout(() => { q = e.target.value.trim(); shown = PAGE; render() }, 150) });
$("heroForm").onsubmit = e => { e.preventDefault(); q = $("heroQ").value.trim(); cat = "All"; brand = ""; $("search").value = q; shown = PAGE; chips(); brandUi(); render(); $("catalog").scrollIntoView() };
$("more").onclick = () => { shown += PAGE; render() };
$("sortSel").onchange = e => { sort = e.target.value; render() };
$("brandSel").onchange = e => { brand = e.target.value; shown = PAGE; render() };
$("resetF").onclick = () => { q = ""; brand = ""; cat = "All"; $("search").value = ""; $("heroQ").value = ""; $("brandSel").value = ""; shown = PAGE; chips(); render() };

/* ================= quotation list ================= */
const FIELDS = [["size", "Size / specification", "e.g. 4 inch, 1.5 HP, 25 mm"], ["make", "Make / brand", "e.g. Bosch, Kirloskar"], ["note", "Other info", "Any extra detail"]];
function fields(o, on) {
  const w = el("div", "dfields");
  FIELDS.forEach(([k, l, ph]) => { const lb = el("label", "dl", l), i = el("input"); i.maxLength = k === "note" ? 200 : 60; i.placeholder = ph; i.value = o[k] || ""; i.oninput = () => { o[k] = i.value; on && on() }; lb.appendChild(i); w.appendChild(lb) });
  return w;
}
const keyOf = x => [x.size, x.make, x.note].map(s => (s || "").trim().toLowerCase()).join("|");
function add(id, n, d = {}) {
  if (cart.length >= MAXCART) return toast("List is full (" + MAXCART + " items max)");
  const nd = { size: (d.size || "").trim(), make: (d.make || "").trim(), note: (d.note || "").trim() };
  const x = cart.find(i => i.id === id && keyOf(i) === keyOf(nd)); x ? x.q = Math.min(9999, x.q + n) : cart.push({ id, q: n, ...nd });
  persist(); toast("Added to quotation list");
}
function addCustom() {
  const n = $("cName").value.trim(); if (!n) { $("cName").focus(); return toast("Enter the product name") }
  if (cart.length >= MAXCART) return toast("List is full (" + MAXCART + " items max)");
  cart.push({ custom: true, name: n, q: clampQty($("cQty").value), size: $("cSize").value.trim(), make: $("cMake").value.trim(), note: $("cNote").value.trim() });
  ["cName", "cSize", "cMake", "cNote"].forEach(id => $(id).value = ""); $("cQty").value = 1; persist(); toast("Custom item added");
}
function openCustom(name) { openDrawer(); $("custom").open = true; if (name) $("cName").value = name; $("cName").focus() }
function persist() { save(KEY, cart); $("badge").textContent = cart.length; if ($("mobileBadge")) $("mobileBadge").textContent = cart.length; drawCart() }
function drawCart() {
  const L = $("lines"); L.innerHTML = "";
  const rows = cart.map(i => ({ i, p: i.custom ? { n: i.name, c: "Custom item", imgs: [] } : byId.get(i.id) })).filter(r => r.p);
  if (!rows.length) { L.appendChild(el("p", "meta", "Your list is empty. Add products from the catalogue.")); return }
  rows.forEach(({ i, p }) => {
    const d = el("div", "line"), im = new Image(); im.src = p.imgs[0] || PH; im.alt = "";
    const q = el("input", "qty"); q.type = "number"; q.min = 1; q.max = 9999; q.value = i.q; q.setAttribute("aria-label", "Quantity for " + p.n);
    q.onchange = () => { i.q = clampQty(q.value); save(KEY, cart) };
    const x = el("button", "x", "×"); x.type = "button"; x.setAttribute("aria-label", "Remove " + p.n); x.onclick = () => { cart = cart.filter(c => c !== i); persist() };
    d.append(im, el("span", "", i.custom ? p.n + " (custom)" : p.n), q, x);
    const dt = el("details", "moredet"); dt.open = !!(i.size || i.make || i.note); dt.append(el("summary", "", "Size / make / notes (optional)"), fields(i, () => save(KEY, cart)));
    const w = el("div", "litem"); w.append(d, dt); L.appendChild(w);
  });
}
persist();
// Read-only view of the quotation list for v4.js (download / share).
window.VectraList = { rows: () => cart.map(i => { const p = i.custom ? null : byId.get(i.id); const n = i.custom ? i.name : p && p.n; return n ? { name: n, qty: i.q, size: i.size || "", make: i.make || "", note: i.note || "", custom: !!i.custom } : null }).filter(Boolean) };

/* drawer */
const dr = $("drawer"), sc = $("scrim"); let last;
function openDrawer() {
  last = document.activeElement; dr.classList.add("on"); sc.classList.add("on"); dr.setAttribute("aria-hidden", "false");
  let c = {}; try { c = JSON.parse(sessionStorage.getItem(CKEY) || "{}"); } catch { } $("fName").value = $("fName").value || c.n || ""; $("fPhone").value = $("fPhone").value || c.p || ""; $("fEmail").value = $("fEmail").value || c.e || ""; $("fGst").value = $("fGst").value || c.g || "";
  $("closeCart").focus(); drawCart();
}
function closeDrawer() { dr.classList.remove("on"); sc.classList.remove("on"); dr.setAttribute("aria-hidden", "true"); last && last.focus && last.focus() }
$("openCart").onclick = openDrawer; if ($("mobileQuote")) $("mobileQuote").onclick = openDrawer; $("cAdd").onclick = addCustom; $("openCustom").onclick = () => openCustom(); $("closeCart").onclick = closeDrawer; sc.onclick = closeDrawer;
$("cName").addEventListener("keydown", e => { if (e.key === "Enter") { e.preventDefault(); addCustom() } });
document.addEventListener("keydown", e => { if (e.key === "Escape" && dr.classList.contains("on")) closeDrawer() });
$("burger").onclick = () => { const n = $("nav").classList.toggle("on"); $("burger").setAttribute("aria-expanded", String(n)) };
$("nav").addEventListener("click", e => { if (e.target.tagName === "A" || e.target.tagName === "BUTTON") { $("nav").classList.remove("on"); $("burger").setAttribute("aria-expanded", "false") } });
$("clear").onclick = () => { cart = []; files = []; drawFiles(); persist(); msg("") };
$("drawBulk").onclick = () => { closeDrawer(); openBulk() };

/* attachments */
const MIME = { pdf: "application/pdf", jpg: "image/jpeg", jpeg: "image/jpeg", png: "image/png", webp: "image/webp", xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", xls: "application/vnd.ms-excel", csv: "text/csv", txt: "text/plain", docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document", doc: "application/msword" };
const mimeOf = f => MIME[(f.name.split(".").pop() || "").toLowerCase()] || "";
async function shrink(f) {
  if (!/^image\/(jpeg|png|webp)$/.test(f.type) || f.size < 1.5e6) return f;
  try {
    const bmp = await createImageBitmap(f), k = Math.min(1, 1800 / Math.max(bmp.width, bmp.height)), c = document.createElement("canvas");
    c.width = Math.round(bmp.width * k); c.height = Math.round(bmp.height * k); c.getContext("2d").drawImage(bmp, 0, 0, c.width, c.height);
    const b = await new Promise(r => c.toBlob(r, "image/jpeg", 0.82)); return b && b.size < f.size ? new File([b], f.name.replace(/\.\w+$/, "") + ".jpg", { type: "image/jpeg" }) : f;
  } catch { return f }
}
$("fFiles").onchange = async e => {
  for (const f of [...e.target.files]) {
    if (files.length >= 5) { toast("Maximum 5 files"); break }
    if (!mimeOf(f)) { toast(f.name + ": use PDF, image, Excel, CSV or Word"); continue }
    const s = await shrink(f); if (s.size > 5242880) { toast(f.name + " is over 5 MB"); continue } files.push(s);
  }
  e.target.value = ""; drawFiles();
};
function drawFiles() {
  const l = $("fileList"); l.innerHTML = "";
  files.forEach((f, i) => { const r = el("div", "fileitem"), x = el("button", "x", "×"); x.type = "button"; x.setAttribute("aria-label", "Remove " + f.name); x.onclick = () => { files.splice(i, 1); drawFiles() }; r.append(el("span", "", f.name + " (" + Math.max(1, Math.round(f.size / 1024)) + " KB)"), x); l.appendChild(r) });
}

/* submit */
const msg = (t, err) => { const m = $("msg"); m.textContent = t; m.className = "msg" + (err ? " err" : "") };
const bad = (id, on) => $(id).setAttribute("aria-invalid", on);
$("submit").onclick = async () => {
  const name = $("fName").value.trim(), phone = $("fPhone").value.replace(/[\s\-()]/g, ""), email = $("fEmail").value.trim(), gst = $("fGst").value.trim().toUpperCase(), notes = $("fNotes").value.trim();
  const e = { fName: !name, fPhone: !/^(\+91|0)?[6-9]\d{9}$/.test(phone), fEmail: !!email && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email), fGst: !!gst && !/^\d{2}[A-Z]{5}\d{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/.test(gst) };
  Object.keys(e).forEach(k => bad(k, e[k]));
  if (!cart.length) return msg("Please add at least one product.", 1);
  if (e.fName) return msg("Please enter your name or company.", 1);
  if (e.fPhone) return msg("Enter a valid 10-digit Indian mobile number.", 1);
  if (e.fEmail) return msg("That email address looks invalid.", 1);
  if (e.fGst) return msg("GSTIN should be 15 characters, e.g. 24ABCDE1234F1Z5 — or leave it blank.", 1);
  if ($("fWeb").value) return;
  if (Date.now() - (+localStorage.getItem("vectra_last") || 0) < 30000) return msg("Please wait a few seconds before sending another request.", 1);
  const items = cart.map(i => { const p = i.custom ? { n: i.name, c: "Custom (not in catalogue)" } : byId.get(i.id); return p && { ...(i.custom ? {} : { pid: i.id }), name: p.n, category: p.c, quantity: i.q, size: (i.size || "").trim(), make: (i.make || "").trim(), note: (i.note || "").trim() } }).filter(Boolean);
  const summary = items.map((x, n) => `${n + 1}. ${x.name} × ${x.quantity}${spec(x) ? " (" + spec(x) + ")" : ""}`).join("\n");
  try { sessionStorage.setItem(CKEY, JSON.stringify({ n: name, p: phone, e: email, g: gst })); } catch { }
  const wa = ref => `https://wa.me/${WA}?text=` + encodeURIComponent(`Hello Vectra Enterprises, I have submitted a quotation request${ref ? ` (Ref ${ref})` : ""}.\nName: ${name}\nPhone: ${phone}\n\n${summary}`);
  if (!db) { msg(""); $("msg").innerHTML = ""; const b = el("a", "btn wa", "Send this list on WhatsApp instead"); b.href = wa(); b.target = "_blank"; b.rel = "noopener"; $("msg").append("Online submission is not available right now. ", b); return }
  const btn = $("submit"); btn.disabled = true; btn.textContent = "Submitting…";
  const id = crypto.randomUUID(), attachments = [];
  try {
    for (let i = 0; i < files.length; i++) {
      btn.textContent = `Uploading file ${i + 1}/${files.length}…`; const f = files[i];
      const path = `${id}/${Date.now()}-${i}-${f.name.replace(/[^\w.\-]+/g, "_").slice(-50)}`;
      const up = await db.storage.from("enquiry-files").upload(path, f, { contentType: mimeOf(f) || f.type });
      if (up.error) throw up.error; attachments.push({ path, name: f.name.slice(0, 80), size: f.size, type: mimeOf(f) || f.type });
    }
  } catch (err) { btn.disabled = false; btn.textContent = "Submit request"; console.error(err); return msg("Could not upload your files. Remove them or try again — or send without attachments.", 1) }
  const { error } = await db.from("quotation_requests").insert({ id, customer_name: name, customer_phone: phone, customer_email: email || null, customer_gstin: gst || null, customer_notes: notes || null, items, attachments, status: "pending" });
  btn.disabled = false; btn.textContent = "Submit request";
  if (error) { msg("Could not submit online. Please try again, or send it on WhatsApp.", 1); console.error(error); return }
  localStorage.setItem("vectra_last", Date.now());
  window.vtrack && window.vtrack("quote_submit", { items: items.length, attachments: attachments.length });
  const ref = V.refOf(id); const saved = load(EKEY, []); saved.unshift({ ref, name, at: Date.now() }); save(EKEY, saved.slice(0, 8));
  cart = []; files = []; drawFiles(); persist(); $("fNotes").value = ""; msg("");
  const box = el("div", "ok-box"); box.append(el("strong", "", "Request received ✓"), el("p", "", "Reference: " + ref + ". Our team will contact you on " + phone + ". Keep this reference to track your quotation online."));
  const tr = el("a", "btn", "Track this enquiry"); tr.href = "/track?ref=" + ref; const b = el("a", "btn wa", "Also notify us on WhatsApp"); b.href = wa(ref); b.target = "_blank"; b.rel = "noopener";
  const row = el("div", "row"); row.append(tr, b); box.appendChild(row); $("msg").appendChild(box);
};

/* ================= product detail ================= */
const pd = $("pdlg");
function remember(id) { const r = [id, ...load(RKEY, []).filter(x => x !== id)].slice(0, 12); save(RKEY, r) }
function openProduct(id, push = true) {
  const p = byId.get(id); if (!p) return; cur = p; remember(id);
  if (push && location.pathname !== "/p/" + id) history.pushState({ p: id }, "", "/p/" + id);
  document.title = p.n + " | Vectra Enterprises";
  const b = $("pbody"); b.innerHTML = "";
  const wrap = el("div", "pgrid"), left = el("div"), main = el("div", "zoom"), mi = new Image(); mi.src = pImg(p); mi.alt = p.n; mi.onerror = () => { mi.onerror = null; mi.src = PH }; main.appendChild(mi);
  main.onclick = () => main.classList.toggle("zoomed"); main.onmousemove = e => { if (!main.classList.contains("zoomed")) return; const r = main.getBoundingClientRect(); mi.style.transformOrigin = ((e.clientX - r.left) / r.width * 100) + "% " + ((e.clientY - r.top) / r.height * 100) + "%" };
  main.onmouseleave = () => main.classList.remove("zoomed"); left.appendChild(main);
  if (p.imgs.length > 1) { const th = el("div", "thumbs"); p.imgs.forEach(u => { const t = new Image(); t.src = u; t.alt = ""; t.onerror = () => { t.onerror = null; t.src = PH }; t.onclick = () => { mi.src = u; main.classList.remove("zoomed") }; th.appendChild(t) }); left.appendChild(th) }
  const info = el("div", "pinfo"); info.append(el("div", "cat", p.c), el("h2", "", p.n));
  const meta = [p.brand && "Brand: " + p.brand, p.model && "Model: " + p.model].filter(Boolean).join(" · "); if (meta) info.appendChild(el("p", "meta", meta));
  info.appendChild(el("p", "pdesc", p.d || "Available in multiple sizes, ratings and brands. Add it to your quotation list and tell us the size, make and quantity you need — we will quote item by item."));
  if (p.specs.length) { const tb = el("table", "spec"); p.specs.forEach(s => { const r = el("tr"); r.append(el("th", "", s.k), el("td", "", s.v)); tb.appendChild(r) }); info.appendChild(tb) }
  if (p.ds) { const a = el("a", "btn ghost", "Download datasheet"); a.href = p.ds; a.target = "_blank"; a.rel = "noopener"; info.appendChild(a) }
  const d = { size: "", make: "", note: "" }; const fm = el("div", "pform"); fm.appendChild(fields(d));
  const qt = el("input", "qty"); qt.type = "number"; qt.min = 1; qt.max = 9999; qt.value = 1; qt.setAttribute("aria-label", "Quantity");
  const ad = el("button", "btn", "Add to quotation list"); ad.type = "button"; ad.onclick = () => { add(p.id, clampQty(qt.value), d); ad.textContent = "Added ✓"; setTimeout(() => ad.textContent = "Add to quotation list", 1200) };
  const wa = el("a", "btn wa", "Ask on WhatsApp"); wa.href = `https://wa.me/${WA}?text=` + encodeURIComponent(`Hello Vectra Enterprises, I need a quotation for: ${p.n}\n${location.origin}/p/${p.id}`); wa.target = "_blank"; wa.rel = "noopener";
  const cp = el("button", "btn ghost", "Copy link"); cp.type = "button"; cp.onclick = async () => { try { await navigator.clipboard.writeText(location.origin + "/p/" + p.id); toast("Link copied") } catch { toast("Copy not supported") } };
  const row = el("div", "act wrapact"); row.append(qt, ad); const row2 = el("div", "row"); row2.append(wa, cp); fm.append(row, row2); info.appendChild(fm);
  wrap.append(left, info); b.appendChild(wrap);
  const rel = P.filter(x => x.c === p.c && x.id !== p.id).slice(0, 4);
  if (rel.length) { const s = el("div", "related"); s.appendChild(el("h3", "", "Related products")); const st = el("div", "strip"); rel.forEach(x => { const a = el("a", "scard"); a.href = "/p/" + x.id; const im = new Image(); im.src = pImg(x); im.alt = ""; im.width = 64; im.height = 64; a.append(im, el("span", "", x.n)); a.onclick = e => { e.preventDefault(); openProduct(x.id) }; st.appendChild(a) }); s.appendChild(st); b.appendChild(s) }
  if (!pd.open) pd.showModal(); pd.scrollTop = 0; renderStrips();
}
function closeProduct() { if (pd.open) pd.close() }
pd.addEventListener("close", () => { document.title = "Vectra Enterprises | Industrial Tools, Valves, Welding & MRO Supplier in Vadodara"; if (location.pathname.startsWith("/p/")) { history.pushState(null, "", "/"); readUrl(); chips(); render() } });
window.addEventListener("popstate", () => { const m = location.pathname.match(/^\/p\/(\d+)/); if (m) openProduct(+m[1], false); else if (pd.open) pd.close() });
document.querySelectorAll("dialog [data-close]").forEach(b => b.onclick = () => b.closest("dialog").close());
document.querySelectorAll("dialog").forEach(d => d.addEventListener("click", e => { if (e.target === d) d.close() }));

/* ================= compare ================= */
function toggleCmp(id, cb) {
  if (cmp.includes(id)) cmp = cmp.filter(x => x !== id); else { if (cmp.length >= 3) { cb.checked = false; return toast("Compare up to 3 products") } cmp.push(id) }
  $("cmpbar").hidden = !cmp.length; $("cmpTxt").textContent = cmp.length + " selected"; $("cmpGo").disabled = cmp.length < 2;
}
$("cmpClear").onclick = () => { cmp = []; $("cmpbar").hidden = true; render() };
$("cmpGo").onclick = () => {
  const L = cmp.map(id => byId.get(id)).filter(Boolean), keys = [...new Set(L.flatMap(p => p.specs.map(s => s.k)))];
  const row = (label, f) => `<tr><th>${safe(label)}</th>${L.map(p => `<td>${f(p)}</td>`).join("")}</tr>`;
  $("cbody").innerHTML = `<div class="dpad"><h2 style="margin-top:0">Compare products</h2><div class="tablewrap"><table class="cmpt"><tbody>` +
    row("", p => `<img src="${safe(pImg(p))}" alt="" width="110" height="96"><br><b>${safe(p.n)}</b>`) + row("Category", p => safe(p.c)) + row("Brand", p => safe(p.brand || "—")) + row("Model", p => safe(p.model || "—")) +
    keys.map(k => row(k, p => safe((p.specs.find(s => s.k === k) || {}).v || "—"))).join("") +
    row("", p => `<button class="btn" data-add="${p.id}" type="button">Add to list</button>`) + `</tbody></table></div>${keys.length ? "" : "<p class='meta'>Detailed specifications will appear here as they are added to the catalogue. Contact us for exact specifications.</p>"}</div>`;
  $("cbody").querySelectorAll("[data-add]").forEach(b => b.onclick = () => { add(+b.dataset.add, 1); b.textContent = "Added ✓" });
  $("cdlg").showModal();
};

/* ================= bulk enquiry (Excel / CSV / paste) ================= */
const bd = $("bdlg"); let brows = [], poNote = "";
function openBulk() { $("bstep1").hidden = false; $("bstep2").hidden = true; $("bmsg").textContent = ""; bd.showModal() }
["openBulk", "openBulk2", "openBulk3"].forEach(id => $(id).onclick = openBulk);
$("btpl").onclick = () => {
  const csv = "Product name,Quantity,Size / specification,Make / brand,Notes\nBall valve,10,2 inch,,\nAngle grinder,5,4 inch,Bosch,\n";
  const a = el("a"); a.href = URL.createObjectURL(new Blob([csv], { type: "text/csv" })); a.download = "vectra-bulk-enquiry-template.csv"; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 2000);
};
function parseDelimited(text) {
  const first = text.split(/\r?\n/).find(l => l.trim()) || "", d = first.includes("\t") ? "\t" : first.includes(";") && !first.includes(",") ? ";" : ",";
  const rows = []; let row = [], cell = "", inQ = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (inQ) { if (ch === '"') { if (text[i + 1] === '"') { cell += '"'; i++ } else inQ = false } else cell += ch }
    else if (ch === '"') inQ = true; else if (ch === d) { row.push(cell); cell = "" }
    else if (ch === "\n" || ch === "\r") { if (ch === "\r" && text[i + 1] === "\n") i++; row.push(cell); cell = ""; if (row.some(c => c.trim())) rows.push(row); row = [] }
    else cell += ch;
  }
  row.push(cell); if (row.some(c => c.trim())) rows.push(row); return rows;
}
function parsePaste(text) {
  return text.split(/\r?\n/).map(l => l.trim()).filter(Boolean).map(l => {
    if (/[\t,;]/.test(l)) return l.split(/[\t,;]/).map(s => s.trim());
    const m = l.match(/^(.*?)[\s\-–x×*:]+(\d{1,5})\s*(?:nos|pcs?|units?|no\.?)?$/i); return m ? [m[1].trim(), m[2]] : [l];
  });
}
let xlsxP; const loadXlsx = () => xlsxP || (xlsxP = new Promise((res, rej) => { if (window.XLSX) return res(); const s = document.createElement("script"); s.src = "https://cdn.sheetjs.com/xlsx-0.20.3/package/dist/xlsx.full.min.js"; s.onload = res; s.onerror = () => { xlsxP = null; rej(new Error("load")) }; document.head.appendChild(s) }));
async function readFile(f) {
  if (f.size > 5e6) throw new Error("File is over 5 MB.");
  if (/\.(csv|txt)$/i.test(f.name)) return parseDelimited(await f.text());
  try { await loadXlsx() } catch { throw new Error("Could not load the Excel reader. Save your sheet as CSV and upload that instead.") }
  const wb = XLSX.read(await f.arrayBuffer(), { type: "array" });
  return XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { header: 1, blankrows: false, defval: "" }).map(r => r.map(c => String(c).trim()));
}
function interpret(rows) {
  const H = { name: /product|item|name|description|particular|material/i, qty: /^(qty|quantity|nos|pcs|no\.?)\b|qty|quantity/i, size: /size|spec|rating|dia/i, make: /brand|make|manufacturer/i, note: /note|remark|comment|other/i };
  let map = { name: 0, qty: 1, size: 2, make: 3, note: 4 }, start = 0;
  const hdr = rows[0] || []; if (hdr.some(c => H.name.test(c) || H.qty.test(c)) && !hdr.some(c => /^\d+$/.test(c))) {
    start = 1; map = {}; Object.keys(H).forEach(k => { const i = hdr.findIndex((c, j) => H[k].test(c) && !Object.values(map).includes(j)); if (i >= 0) map[k] = i });
    if (map.name == null) map.name = 0;
  }
  return rows.slice(start).map(r => ({ name: (r[map.name] || "").trim(), qty: clampQty(r[map.qty]), size: (r[map.size] || "").trim(), make: (r[map.make] || "").trim(), note: (r[map.note] || "").trim() })).filter(x => x.name).slice(0, MAXCART);
}
function candidates(name) {
  const qt = new Set(tok(name)); if (!qt.size) return [];
  return P.map(p => { let m = 0; qt.forEach(w => { if (p.tokens.has(w)) m++ }); return [p, m ? m / qt.size * 0.7 + m / p.tokens.size * 0.3 : 0] }).filter(x => x[1] > 0.25).sort((a, b) => b[1] - a[1]).slice(0, 4);
}
$("bparse").onclick = async () => {
  const m = $("bmsg"); m.className = "msg"; m.textContent = "Reading…";
  try {
    const f = $("bfile").files[0], pasted = $("bpaste").value.trim();
    const rows = f ? await readFile(f) : pasted ? parsePaste(pasted) : null; if (!rows) { m.className = "msg err"; return m.textContent = "Choose a file or paste your list first." }
    const list = interpret(rows); if (!list.length) { m.className = "msg err"; return m.textContent = "No items found. Put the product name in the first column and quantity in the second." }
    brows = list.map(x => { const c = candidates(x.name), auto = c.length && c[0][1] >= 0.5; return { ...x, cands: c, pick: auto ? String(c[0][0].id) : "custom" } });
    drawBulk(); $("bstep1").hidden = true; $("bstep2").hidden = false; m.textContent = "";
  } catch (e) { m.className = "msg err"; m.textContent = e.message || "Could not read that file." }
};
function drawBulk() {
  const auto = brows.filter(r => r.pick !== "custom").length; $("bsum").textContent = `${brows.length} items read · ${auto} matched to the catalogue · ${brows.length - auto} will be added as custom items. Check the matches below.${poNote}`;
  const tb = $("brows"); tb.innerHTML = "";
  brows.forEach((r, i) => {
    const tr = el("tr"), sel = el("select"); sel.setAttribute("aria-label", "Match for " + r.name);
    r.cands.forEach(([p]) => { const o = el("option", "", p.n); o.value = p.id; sel.appendChild(o) }); const oc = el("option", "", "➕ Keep as custom item"); oc.value = "custom"; sel.appendChild(oc); sel.value = r.pick; sel.onchange = () => { r.pick = sel.value };
    const inp = (k, w, type) => { const td = el("td"), i2 = el("input"); if (type) { i2.type = type; i2.min = 1; i2.max = 9999 } i2.value = r[k]; i2.maxLength = 60; i2.style.width = w; i2.setAttribute("aria-label", k + " for " + r.name); i2.oninput = () => { r[k] = type ? clampQty(i2.value) : i2.value }; td.appendChild(i2); return td };
    const tdN = el("td", "", r.name), tdS = el("td"); tdS.appendChild(sel); const tdX = el("td"), x = el("button", "x", "×"); x.type = "button"; x.setAttribute("aria-label", "Remove row"); x.onclick = () => { brows.splice(i, 1); drawBulk() }; tdX.appendChild(x);
    tr.append(tdN, tdS, inp("qty", "64px", "number"), inp("size", "110px"), inp("make", "110px"), tdX); tb.appendChild(tr);
  });
  $("badd").disabled = !brows.length;
}
$("bback").onclick = () => { $("bstep1").hidden = false; $("bstep2").hidden = true };
$("badd").onclick = () => {
  let n = 0;
  brows.forEach(r => {
    if (cart.length >= MAXCART) return;
    if (r.pick !== "custom") cart.push({ id: +r.pick, q: r.qty, size: r.size, make: r.make, note: r.note }); else cart.push({ custom: true, name: r.name, q: r.qty, size: r.size, make: r.make, note: r.note }); n++;
  });
  persist(); bd.close(); toast(n + " items added to your list"); openDrawer();
};

/* ---- hook used by ai-po.js: show AI-read PO lines in the same review table ---- */
window.VectraBulk = {
  loadXlsx,
  show(list, info = {}) {
    const rows = (list || []).slice(0, MAXCART).map(x => ({ name: String(x.name || "").slice(0, 200).trim(), qty: clampQty(x.qty), size: String(x.size || "").slice(0, 60), make: String(x.make || "").slice(0, 60), note: String(x.note || "").slice(0, 200), ai: x.catalogueId, conf: x.confidence })).filter(x => x.name);
    brows = rows.map(x => {
      const c = candidates(x.name), aiP = x.ai != null && byId.get(+x.ai);
      if (aiP) { const rest = c.filter(y => y[0].id !== aiP.id); c.length = 0; c.push([aiP, 1], ...rest.slice(0, 3)) }
      const auto = aiP ? x.conf !== "low" : c.length && c[0][1] >= 0.7;
      return { name: x.name, qty: x.qty, size: x.size, make: x.make, note: x.note, cands: c, pick: auto ? String(c[0][0].id) : "custom" };
    });
    const bits = [info.number && "PO " + info.number, info.date && "dated " + info.date].filter(Boolean).join(" ");
    poNote = ` AI read${bits ? " " + bits : " your file"}. AI can make mistakes, so please check every row${info.warnings && info.warnings.length ? ". Notes: " + info.warnings.join(" ") : ""}.`;
    if (info.number || info.delivery) {
      const line = "Customer PO" + (info.number ? ": " + info.number : "") + (info.date ? " dated " + info.date : "") + (info.delivery ? " | Deliver to: " + info.delivery : ""), n = $("fNotes");
      if (!n.value.includes(line)) n.value = (n.value ? n.value + "\n" : "") + line.slice(0, 300);
    }
    drawBulk(); $("bstep1").hidden = true; $("bstep2").hidden = false; if (!bd.open) bd.showModal();
  },
  async attach(f) {
    if (!mimeOf(f)) return false;
    if (files.some(x => x.name === f.name && x.size === f.size)) return true;
    if (files.length >= 5) { toast("Maximum 5 files attached"); return false }
    const s = await shrink(f); if (s.size > 5242880) { toast(f.name + " is over 5 MB, so it was not attached"); return false }
    files.push(s); drawFiles(); return true;
  }
};

/* ================= staff portal (opens same-origin /admin in a modal) ================= */
(() => {
  const open = $("openAdmin"), close = $("closeAdmin"), modal = $("adminModal"), scrim = $("adminScrim"), frame = $("adminFrame");
  const show = () => { modal.hidden = false; scrim.hidden = false; document.body.classList.add("admin-open"); if (frame.src === "about:blank") frame.src = "/admin?embedded=1"; close.focus() };
  const hide = () => { modal.hidden = true; scrim.hidden = true; document.body.classList.remove("admin-open"); open.focus() };
  open.onclick = show; close.onclick = hide; scrim.onclick = hide;
  document.addEventListener("keydown", e => { if (e.key === "Escape" && !modal.hidden) hide() });
})();

if ("serviceWorker" in navigator && location.protocol === "https:") navigator.serviceWorker.register("/sw.js").catch(() => { });
})();
