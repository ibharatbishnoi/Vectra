"use strict";
(() => {
const V = window.Vectra, db = V.db, { safe, inr, fdate, calcLine, calcCharge, calcQuote } = V;
const $ = id => document.getElementById(id);
const STATES = { "01": "Jammu & Kashmir", "02": "Himachal Pradesh", "03": "Punjab", "04": "Chandigarh", "05": "Uttarakhand", "06": "Haryana", "07": "Delhi", "08": "Rajasthan", "09": "Uttar Pradesh", "10": "Bihar", "11": "Sikkim", "12": "Arunachal Pradesh", "13": "Nagaland", "14": "Manipur", "15": "Mizoram", "16": "Tripura", "17": "Meghalaya", "18": "Assam", "19": "West Bengal", "20": "Jharkhand", "21": "Odisha", "22": "Chhattisgarh", "23": "Madhya Pradesh", "24": "Gujarat", "25": "Daman & Diu", "26": "Dadra & Nagar Haveli and Daman & Diu", "27": "Maharashtra", "29": "Karnataka", "30": "Goa", "31": "Lakshadweep", "32": "Kerala", "33": "Tamil Nadu", "34": "Puducherry", "35": "Andaman & Nicobar", "36": "Telangana", "37": "Andhra Pradesh", "38": "Ladakh" };
const S = { me: null, reqs: [], quotes: [], customers: [], staff: [], products: [], company: { ...V.DEFAULT_COMPANY }, v3: true };
let E = null, session = null;   // E = quotation editor state

const toast = t => { const e = $("toast"); e.textContent = t; e.classList.add("on"); clearTimeout(toast.t); toast.t = setTimeout(() => e.classList.remove("on"), 2600) };
const msg = (id, t, e) => { const m = $(id); if (m) { m.textContent = t; m.className = "msg" + (e ? " err" : "") } };
const isOwner = () => S.me && S.me.role === "owner";
const iso = d => { const x = new Date(d); return x.getFullYear() + "-" + String(x.getMonth() + 1).padStart(2, "0") + "-" + String(x.getDate()).padStart(2, "0") };
const today = () => iso(new Date());
const staffName = id => { const s = S.staff.find(x => x.user_id === id); return s ? s.name || s.email : "" };
const reqById = id => S.reqs.find(r => r.id === id);
const custOf = r => S.customers.find(c => c.phone_key === r.phone_key);
const money = n => "₹ " + inr(Math.round(n * 100));
const num = n => Number(n || 0).toLocaleString("en-IN");
const optList = (arr, sel) => arr.map(([v, l]) => `<option value="${safe(v)}" ${String(v) === String(sel) ? "selected" : ""}>${safe(l)}</option>`).join("");
const pill = s => `<span class="pill ${safe(s)}">${safe(String(s).replace("_", " "))}</span>`;
function csvDownload(name, rows) {
  const t = rows.map(r => r.map(c => { const s = String(c ?? ""); return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s }).join(",")).join("\n");
  const a = document.createElement("a"); a.href = URL.createObjectURL(new Blob(["\ufeff" + t], { type: "text/csv" })); a.download = name; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 3000);
}
function dlg(html) { $("dlgbody").innerHTML = html; if (!$("dlg").open) $("dlg").showModal(); return $("dlgbody") }
$("dlgx").onclick = () => $("dlg").close();

/* ================= auth & boot ================= */
if (!db) msg("lmsg", "Supabase is not configured. Edit config.js.", 1);
async function boot() { if (!db) return; const { data } = await db.auth.getSession(); show(data.session) }
async function show(s) {
  session = s; $("login").hidden = !!s; $("app").hidden = !s; $("out").hidden = !s;
  if (s) { $("who").textContent = s.user.email; await loadAll(true); subscribe(); route() }
}
$("in").onclick = async () => { msg("lmsg", "Signing in…"); const { data, error } = await db.auth.signInWithPassword({ email: $("em").value.trim(), password: $("pw").value }); if (error) return msg("lmsg", error.message, 1); msg("lmsg", ""); show(data.session) };
$("pw").onkeydown = e => { if (e.key === "Enter") $("in").click() };
$("out").onclick = async () => { await db.auth.signOut(); E = null; location.hash = ""; show(null) };

async function loadAll(initial) {
  if (initial) $("view").innerHTML = "<p>Loading…</p>";
  const q = (t, f) => f(db.from(t).select("*"));
  const [a, b, c, d, e, f] = await Promise.all([
    q("quotation_requests", x => x.order("created_at", { ascending: false }).limit(1000)),
    q("quotations", x => x.order("created_at", { ascending: false }).limit(1000)),
    q("customers", x => x.limit(3000)), q("admin_users", x => x), q("products", x => x.order("id").limit(3000)), q("settings", x => x)]);
  if (a.error) { $("app").hidden = false; $("view").innerHTML = `<p class="msg err">${safe(a.error.message)} — is this account listed in admin_users?</p>`; return }
  S.reqs = a.data; S.quotes = b.data || []; S.customers = c.data || []; S.staff = d.data || []; S.products = e.data || [];
  S.v3 = !c.error && !e.error && !f.error && !b.error;
  S.me = S.staff.find(x => x.user_id === session.user.id) || { role: "owner" };
  if (!S.v3) S.me = { ...S.me, role: S.me.role || "owner" };
  const co = (f.data || []).find(x => x.key === "company"); S.company = { ...V.DEFAULT_COMPANY, ...(co ? co.value : {}) };
  const open = S.reqs.filter(r => r.status === "pending").length; document.title = (open ? `(${open}) ` : "") + "Vectra Admin";
}
let ch;
function subscribe() {
  if (ch || !db.channel) return;
  try { ch = db.channel("new-enquiries").on("postgres_changes", { event: "INSERT", schema: "public", table: "quotation_requests" }, async p => { toast("🔔 New enquiry from " + (p.new.customer_name || "a customer")); await loadAll(); route() }).subscribe() } catch { }
}

/* ================= router & navigation ================= */
function navItems() {
  const pend = S.reqs.filter(r => r.status === "pending").length;
  const n = [["dashboard", "Dashboard"], ["enquiries", "Enquiries" + (pend ? `<span class="dot">${pend}</span>` : "")], ["quotations", "Quotations"], ["customers", "Customers"], ["products", "Products"], ["reports", "Reports"]];
  if (isOwner()) n.push(["settings", "Settings"], ["staff", "Staff"]); return n;
}
let curTab = "dashboard";
function drawNav(cur = curTab) {
  curTab = cur; $("nav").innerHTML = navItems().map(([k, l]) => `<button role="tab" data-p="${k}" aria-selected="${k === cur}">${l}</button>`).join("");
  $("nav").querySelectorAll("button").forEach(b => b.onclick = () => { location.hash = "#/" + b.dataset.p });
}
function route() {
  if (!session) return; const [, page = "dashboard", arg, arg2] = location.hash.split("/"), cur = page === "enquiry" ? "enquiries" : page;
  drawNav(cur);
  const v = $("view"); v.innerHTML = (S.v3 ? "" : '<div class="banner"><b>Database upgrade needed.</b> Run the whole updated <code>supabase_schema.sql</code> in Supabase → SQL Editor to enable products, customers, tracking and the new quotation fields. Until then, new features that need it will not save.</div>');
  const body = document.createElement("div"); v.appendChild(body);
  const views = { dashboard: viewDashboard, enquiries: viewEnquiries, enquiry: () => viewEnquiry(arg, arg2), quotations: viewQuotations, customers: viewCustomers, products: viewProducts, reports: viewReports, settings: viewSettings, staff: viewStaff };
  const f = views[page] || viewDashboard; if ((page === "settings" || page === "staff") && !isOwner()) { body.innerHTML = "<p>Owner access only.</p>"; return }
  f(body);
}
window.addEventListener("hashchange", route);
const gotoEnquiry = (id, q) => { location.hash = "#/enquiry/" + id + (q ? "/" + q : "") };

/* ================= dashboard ================= */
function viewDashboard(v) {
  const now = new Date(), ym = iso(now).slice(0, 7), td = today(), ymOf = x => iso(x).slice(0, 7);
  const monthReqs = S.reqs.filter(r => ymOf(r.created_at) === ym), live = S.quotes.filter(q => !["draft", "superseded"].includes(q.status));
  const monthQ = live.filter(q => ymOf(q.created_at) === ym), acc = live.filter(q => q.status === "accepted"), accM = acc.filter(q => ymOf(q.customer_responded_at || q.updated_at || q.created_at) === ym);
  const sum = l => l.reduce((s, q) => s + Number(q.grand_total), 0), pend = S.reqs.filter(r => r.status === "pending");
  const due = S.reqs.filter(r => r.follow_up_at && r.status !== "closed" && r.follow_up_at <= td).sort((a, b) => a.follow_up_at.localeCompare(b.follow_up_at));
  const waiting = live.filter(q => q.status === "issued").length;
  const months = [...Array(6)].map((_, i) => { const d = new Date(now.getFullYear(), now.getMonth() - 5 + i, 1), k = iso(d).slice(0, 7); return { k, l: d.toLocaleString("en-IN", { month: "short" }), n: S.reqs.filter(r => ymOf(r.created_at) === k).length } });
  const mx = Math.max(1, ...months.map(m => m.n));
  const row = r => `<div class="req link" data-e="${safe(r.id)}"><div><strong>${safe(r.customer_name)}</strong> ${pill(r.status)}<small>${safe(r.customer_phone)} · ${r.items.length} item(s) · ${safe(fdate(r.created_at))}${r.assigned_to ? " · " + safe(staffName(r.assigned_to)) : ""}</small></div>${r.follow_up_at ? `<span class="pill ${r.follow_up_at < td ? "overdue" : ""}">Follow-up ${safe(fdate(r.follow_up_at))}</span>` : ""}</div>`;
  v.innerHTML = `<div class="kpis">
  <div class="kpi"><small>ENQUIRIES THIS MONTH</small><b>${monthReqs.length}</b><span>${S.reqs.length} in total</span></div>
  <div class="kpi"><small>PENDING (NOT QUOTED)</small><b>${pend.length}</b><span>${pend.filter(r => !r.assigned_to).length} unassigned</span></div>
  <div class="kpi"><small>QUOTES SENT THIS MONTH</small><b>${monthQ.length}</b><span>${money(sum(monthQ))}</span></div>
  <div class="kpi"><small>AWAITING CUSTOMER</small><b>${waiting}</b><span>quotes issued, no response</span></div>
  <div class="kpi"><small>ACCEPTED THIS MONTH</small><b>${money(sum(accM))}</b><span>${accM.length} quote(s)</span></div>
  <div class="kpi"><small>WIN RATE</small><b>${live.length ? Math.round(acc.length / live.length * 100) : 0}%</b><span>${acc.length} of ${live.length} quotes accepted</span></div></div>
  <div class="cols"><div class="box"><h3 style="margin-top:0">Follow-ups due ${due.length ? `(${due.length})` : ""}</h3>${due.length ? due.slice(0, 8).map(row).join("") : "<p class='hint'>Nothing due. Set a follow-up date on any enquiry to see it here.</p>"}</div>
  <div class="box"><h3 style="margin-top:0">Enquiries — last 6 months</h3><div class="bars">${months.map(m => `<div><b>${m.n}</b><i style="height:${Math.round(m.n / mx * 100)}px"></i>${m.l}</div>`).join("")}</div></div></div>
  <div class="box"><div class="row" style="justify-content:space-between"><h3 style="margin:0">Needs attention — pending enquiries</h3><a class="btn ghost" href="#/enquiries">All enquiries</a></div>${pend.length ? pend.slice(0, 8).map(row).join("") : "<p class='hint'>All caught up 🎉</p>"}</div>`;
  v.querySelectorAll("[data-e]").forEach(b => b.onclick = () => gotoEnquiry(b.dataset.e));
}

/* ================= enquiries list ================= */
const F = { q: "", status: "", who: "", period: "" };
function viewEnquiries(v) {
  v.innerHTML = `<div class="box"><div class="row"><input id="rs" type="search" placeholder="Search name / phone / ref / item" style="flex:1;min-width:200px" value="${safe(F.q)}">
  <select id="rf"><option value="">All statuses</option>${optList(["pending", "quoted", "closed"].map(x => [x, x]), F.status)}</select>
  <select id="rw"><option value="">Anyone</option><option value="me">Assigned to me</option><option value="none">Unassigned</option>${S.staff.map(s => `<option value="${safe(s.user_id)}">${safe(s.name || s.email)}</option>`).join("")}</select>
  <select id="rp"><option value="">All time</option><option value="7">Last 7 days</option><option value="30">Last 30 days</option><option value="due">Follow-up due</option></select>
  <button class="btn ghost" id="rr">Refresh</button><button class="btn ghost" id="rx">Export CSV</button></div><p class="meta" id="rc"></p><div id="rl"></div></div>`;
  $("rw").value = F.who; $("rp").value = F.period;
  const apply = () => {
    F.q = $("rs").value; F.status = $("rf").value; F.who = $("rw").value; F.period = $("rp").value;
    const s = F.q.toLowerCase().trim(), td = today();
    const r = S.reqs.filter(x => (!F.status || x.status === F.status) && (!F.who || (F.who === "me" ? x.assigned_to === session.user.id : F.who === "none" ? !x.assigned_to : x.assigned_to === F.who)) &&
      (!F.period || (F.period === "due" ? x.follow_up_at && x.follow_up_at <= td && x.status !== "closed" : Date.now() - new Date(x.created_at) < +F.period * 864e5)) &&
      (!s || (x.customer_name + x.customer_phone + x.id + V.refOf(x.id) + x.items.map(i => i.name).join(" ")).toLowerCase().includes(s)));
    const n = k => S.reqs.filter(x => x.status === k).length;
    $("rc").textContent = `${r.length} shown · ${n("pending")} pending · ${n("quoted")} quoted · ${n("closed")} closed`;
    $("rl").innerHTML = r.length ? r.slice(0, 200).map(x => `<div class="req link" data-e="${safe(x.id)}"><div><strong>${safe(x.customer_name)}</strong> ${pill(x.status)}${x.attachments && x.attachments.length ? " 📎" : ""}<small>${safe(x.customer_phone)} · ${safe(new Date(x.created_at).toLocaleString("en-IN"))} · ${x.items.length} item(s) · Ref ${V.refOf(x.id)}${x.assigned_to ? " · 👤 " + safe(staffName(x.assigned_to)) : " · unassigned"}</small></div>${x.follow_up_at ? `<span class="pill ${x.follow_up_at < td && x.status !== "closed" ? "overdue" : ""}">Follow-up ${safe(fdate(x.follow_up_at))}</span>` : ""}</div>`).join("") : "<p>No enquiries found.</p>";
    $("rl").querySelectorAll("[data-e]").forEach(b => b.onclick = () => gotoEnquiry(b.dataset.e)); apply.rows = r;
  };
  ["rs"].forEach(i => $(i).oninput = apply); ["rf", "rw", "rp"].forEach(i => $(i).onchange = apply);
  $("rr").onclick = async () => { await loadAll(); route() };
  $("rx").onclick = () => csvDownload("enquiries.csv", [["Ref", "Date", "Customer", "Phone", "Email", "GSTIN", "Status", "Assigned to", "Follow-up", "Items"], ...(apply.rows || []).map(r => [V.refOf(r.id), iso(r.created_at), r.customer_name, r.customer_phone, r.customer_email, r.customer_gstin, r.status, staffName(r.assigned_to), r.follow_up_at, r.items.map(i => i.name + " x" + i.quantity).join("; ")])]);
  apply();
}

/* ================= enquiry workspace ================= */
async function patchReq(id, patch, note) {
  const { error } = await db.from("quotation_requests").update(patch).eq("id", id); if (error) { toast(error.message); return false }
  Object.assign(reqById(id), patch); if (note) await addNote(id, "status", note); return true;
}
async function addNote(id, kind, body) {
  const { error } = await db.from("enquiry_notes").insert({ request_id: id, kind, body: body.slice(0, 1000), author: session.user.id, author_name: S.me.name || session.user.email });
  if (error) toast("Note not saved: " + error.message); return !error;
}
async function viewEnquiry(id, qid) {
  const v = $("view").lastChild, r = reqById(id); if (!r) { v.innerHTML = "<p>Enquiry not found. <a href='#/enquiries'>Back</a></p>"; return }
  const [nres, sres] = await Promise.all([db.from("enquiry_notes").select("*").eq("request_id", id).order("created_at", { ascending: false }),
    r.attachments && r.attachments.length ? db.storage.from("enquiry-files").createSignedUrls(r.attachments.map(a => a.path), 3600) : Promise.resolve({ data: [] })]);
  const notes = nres.data || [], urls = sres.data || [], cust = custOf(r), mine = S.quotes.filter(q => q.request_id === id);
  const wa = "https://wa.me/91" + V.phoneKey(r.customer_phone);
  v.innerHTML = `<p><a href="#/enquiries">← All enquiries</a></p>
  <div class="box"><div class="row" style="justify-content:space-between;align-items:flex-start"><div><h2 style="margin:0">${safe(r.customer_name)} ${pill(r.status)}</h2>
  <p class="meta" style="margin:4px 0">Ref <b>${V.refOf(r.id)}</b> · ${safe(new Date(r.created_at).toLocaleString("en-IN"))}<br>📞 <a href="tel:${safe(r.customer_phone)}">${safe(r.customer_phone)}</a> · <a href="${wa}" target="_blank" rel="noopener">WhatsApp</a>${r.customer_email ? ` · ✉ <a href="mailto:${safe(r.customer_email)}">${safe(r.customer_email)}</a>` : ""} · GSTIN ${safe(r.customer_gstin || "—")}</p>
  ${r.customer_notes ? `<p><b>Customer note:</b> ${safe(r.customer_notes)}</p>` : ""}${cust && cust.address ? `<p class="meta">Address: ${safe(cust.address)}</p>` : ""}</div>
  <div class="grid2" style="min-width:min(100%,380px)"><label class="f">Status<select id="eSt">${optList(["pending", "quoted", "closed"].map(x => [x, x]), r.status)}</select></label>
  <label class="f">Assigned to<select id="eAs"><option value="">Unassigned</option>${S.staff.map(s => `<option value="${safe(s.user_id)}" ${s.user_id === r.assigned_to ? "selected" : ""}>${safe(s.name || s.email)}</option>`).join("")}</select></label>
  <label class="f full">Follow-up date<input type="date" id="eFu" value="${safe(r.follow_up_at || "")}"></label></div></div></div>
  <div class="cols"><div class="box"><h3 style="margin-top:0">Requested items (${r.items.length})</h3><div class="scroll"><table class="l"><tbody>${r.items.map((x, i) => `<tr><td>${i + 1}</td><td><b>${safe(x.name)}</b>${x.size || x.make || x.note ? `<br><small>${safe([x.size && "Size: " + x.size, x.make && "Make: " + x.make, x.note].filter(Boolean).join(" | "))}</small>` : ""}</td><td>× ${safe(x.quantity)}</td></tr>`).join("")}</tbody></table></div>
  ${r.attachments && r.attachments.length ? `<h4>Attachments</h4>${r.attachments.map((a, i) => urls[i] && urls[i].signedUrl ? `<div><a href="${safe(urls[i].signedUrl)}" target="_blank" rel="noopener">📎 ${safe(a.name)}</a> <small class="hint">${Math.round(a.size / 1024)} KB</small></div>` : `<div>${safe(a.name)} <small class="hint">(unavailable)</small></div>`).join("")}` : ""}</div>
  <div class="box"><h3 style="margin-top:0">Follow-up log</h3><div class="row"><select id="nk"><option value="note">Note</option><option value="call">Call</option><option value="whatsapp">WhatsApp</option><option value="email">Email</option></select><input id="nt" maxlength="500" placeholder="What happened / what did the customer say?" style="flex:1;min-width:160px"><button class="btn" id="na">Add</button></div>
  <div class="timeline">${notes.length ? notes.map(n => `<div><b>${safe(n.kind)}</b> — ${safe(n.body)}<br><small>${safe(n.author_name || "")} · ${safe(new Date(n.created_at).toLocaleString("en-IN"))}</small></div>`).join("") : "<p class='hint'>No activity yet.</p>"}</div></div></div>
  <div class="box"><div class="row" style="justify-content:space-between"><h3 style="margin:0">Quotations</h3><button class="btn" id="nq">+ New quotation</button></div>
  ${mine.length ? mine.map(q => `<div class="req"><div><strong>${safe(q.quote_number)}</strong> ${pill(q.status)}<small>${safe(fdate(q.quote_date))} · ${money(q.grand_total)}${q.customer_feedback ? " · Customer: " + safe(q.customer_feedback) : ""}</small></div><div class="row"><button class="btn ghost" data-o="${safe(q.id)}">Open</button><button class="btn ghost" data-pr="${safe(q.id)}">Print / PDF</button></div></div>`).join("") : "<p class='hint'>No quotation yet.</p>"}</div>
  <div id="editor"></div>`;
  $("eSt").onchange = async () => { if (await patchReq(id, { status: $("eSt").value }, "Status changed to " + $("eSt").value)) { toast("Status updated"); drawNav() } };
  $("eAs").onchange = async () => { if (await patchReq(id, { assigned_to: $("eAs").value || null }, "Assigned to " + ($("eAs").selectedOptions[0].text))) toast("Assigned") };
  $("eFu").onchange = async () => { if (await patchReq(id, { follow_up_at: $("eFu").value || null }, $("eFu").value ? "Follow-up set for " + fdate($("eFu").value) : "Follow-up cleared")) toast("Follow-up saved") };
  $("na").onclick = async () => { const t = $("nt").value.trim(); if (!t) return; if (await addNote(id, $("nk").value, t)) viewEnquiry(id, qid) };
  $("nt").onkeydown = e => { if (e.key === "Enter") $("na").click() };
  $("nq").onclick = () => gotoEnquiry(id, "new");
  v.querySelectorAll("[data-o]").forEach(b => b.onclick = () => gotoEnquiry(id, b.dataset.o));
  v.querySelectorAll("[data-pr]").forEach(b => b.onclick = () => printSaved(S.quotes.find(q => q.id === b.dataset.pr)));
  if (qid === "new" || (!qid && !mine.length)) openEditor(r, null); else if (qid) openEditor(r, mine.find(q => q.id === qid) || null);
}
function printSaved(q) { const r = reqById(q.request_id) || {}; V.printHtml(V.printableQuote(q, { ...r, ...(custOf(r) || {}), customer_name: r.customer_name, customer_phone: r.customer_phone, customer_gstin: r.customer_gstin }, S.company), q.quote_number) }

/* ================= quotation editor ================= */
const UNITS = ["Nos", "Pcs", "Set", "Mtr", "Kg", "Ltr", "Box", "Pair"];
const baseNo = n => String(n || "").replace(/\/R\d+$/, "");
function lastRates(r) {   // previous rates quoted to the same customer, by product id or name
  const m = {}; S.quotes.filter(q => q.status !== "draft").forEach(q => { const rq = reqById(q.request_id); if (!rq || rq.phone_key !== r.phone_key) return;
    (q.items || []).forEach(x => { const k = x.pid ? "p" + x.pid : "n" + String(x.name).toLowerCase(); if (!m[k] && x.rate > 0) m[k] = { rate: x.rate, date: q.quote_date } }) }); return m;
}
function openEditor(r, q) {
  const co = S.company, cust = custOf(r) || {}, lr = lastRates(r), pm = new Map(S.products.map(p => [p.id, p]));
  const hist = x => lr[x.pid ? "p" + x.pid : "n" + String(x.name).toLowerCase()];
  const items = q ? q.items.map(x => ({ unit: "Nos", disc: 0, ...x })) : r.items.map(x => { const p = x.pid && pm.get(x.pid), h = hist(x); return { pid: x.pid, name: x.name, category: x.category, quantity: x.quantity, unit: "Nos", size: x.size || "", make: x.make || "", note: x.note || "", hsn: p && p.hsn || "", rate: h ? h.rate : 0, disc: 0, gst_rate: p && +p.gst_rate || 18, _h: h } });
  const sc = (r.customer_gstin || "").slice(0, 2), st = STATES[sc] ? `${STATES[sc]} (${sc})` : `${STATES[co.state_code] || "Gujarat"} (${co.state_code || "24"})`;
  E = { r, q, items, charges: q ? (q.charges || []).map(c => ({ ...c })) : [] };
  const d = new Date(); const val = new Date(Date.now() + (+co.validity_days || 15) * 864e5);
  $("editor").innerHTML = `<div class="box"><h2 style="margin-top:0">${q ? "Quotation " + safe(q.quote_number) : "Prepare quotation"}</h2>
  <div class="grid2" style="grid-template-columns:repeat(auto-fit,minmax(170px,1fr))"><label class="f">Quote no.<input id="qn" readonly value="${safe(q ? q.quote_number : "")}" placeholder="auto on save"></label>
  <label class="f">Date<input id="qd" type="date" value="${q ? q.quote_date : iso(d)}"></label><label class="f">Valid until<input id="qv" type="date" value="${q ? q.valid_until || "" : iso(val)}"></label>
  <label class="f">GST<select id="qg"><option value="intra">CGST + SGST (same state)</option><option value="inter">IGST (interstate)</option></select></label>
  <label class="f">Place of supply<input id="qp" maxlength="60" value="${safe(q ? q.place_of_supply || "" : st)}"></label></div>
  <div class="grid2" style="margin-top:10px"><label class="f">Bill to<textarea id="qb" rows="3" maxlength="400">${safe(q ? q.bill_to || "" : [r.customer_name, cust.address].filter(Boolean).join("\n"))}</textarea></label>
  <label class="f">Ship to (leave blank if same)<textarea id="qs" rows="3" maxlength="400">${safe(q ? q.ship_to || "" : "")}</textarea></label></div>
  <div class="row" style="margin:14px 0 6px;justify-content:space-between"><b>Items</b><div class="search-pop" style="flex:1;max-width:380px"><input id="ap" placeholder="+ Add product from catalogue (type to search)" style="width:100%" autocomplete="off"><div class="pop" id="apop" hidden></div></div></div>
  <div class="scroll"><table class="l" id="qt"><thead><tr><th>Product / specification</th><th>HSN/SAC</th><th>Qty / unit</th><th>Rate ₹</th><th>Disc %</th><th>GST %</th><th>Taxable ₹</th><th>Total ₹</th><th></th></tr></thead><tbody id="ql"></tbody></table></div>
  <div class="row" style="margin-top:8px"><button class="btn ghost" id="addc">+ Custom line</button></div>
  <h4 style="margin:16px 0 4px">Freight, packing &amp; discount</h4><div class="scroll"><table class="l"><tbody id="cl"></tbody></table></div>
  <div class="row" style="margin-top:8px"><button class="btn ghost" data-chg="Freight / transport">+ Freight</button><button class="btn ghost" data-chg="Packing & forwarding">+ Packing</button><button class="btn ghost" data-chg="Additional discount" data-d="1">+ Discount</button><button class="btn ghost" data-chg="Other charges">+ Other</button></div>
  <div class="tot" id="tt" style="margin-top:12px"></div>
  <div class="grid2" style="margin-top:12px"><label class="f">Payment terms<input id="qpt" maxlength="200" value="${safe(q ? q.payment_terms || "" : co.payment_terms)}"></label><label class="f">Delivery terms<input id="qdt" maxlength="200" value="${safe(q ? q.delivery_terms || "" : co.delivery_terms)}"></label>
  <label class="f full">Terms &amp; conditions<textarea id="qtm" rows="3" maxlength="2000">${safe(q ? q.terms || "" : co.terms)}</textarea></label></div>
  <div class="row" style="margin-top:14px"><button class="btn" id="sv">${q ? "Save changes" : "Save quotation"}</button>${q ? '<button class="btn ghost" id="rev">Save as new revision</button>' : ""}<button class="btn ghost" id="pr">Print / Save PDF</button><button class="btn wa" id="wa">Send on WhatsApp</button><button class="btn ghost" id="em2">Email</button><button class="btn ghost" id="cl2">Copy tracking link</button></div>
  <div class="msg" id="qm" aria-live="polite"></div></div>`;
  $("qg").value = q ? q.gst_treatment : V.gstTreatment(r.customer_gstin, co);
  drawLines(); drawCharges(); bindEditor(); $("editor").scrollIntoView({ behavior: "smooth" });
}
const cvt = (k, e) => ["name", "size", "make", "note", "unit"].includes(k) ? e.value : k === "hsn" ? e.value.replace(/\D/g, "") : ["gst_rate"].includes(k) ? +e.value : Math.max(0, +e.value || 0);
function drawLines() {
  $("ql").innerHTML = E.items.map((x, i) => `<tr data-i="${i}"><td class="n"><input data-k="name" value="${safe(x.name)}" maxlength="200" aria-label="Product name" style="font-weight:700">${/^Custom/.test(x.category || "") ? ' <span class="pill pending">Custom item</span>' : ""}<div class="dg"><input data-k="size" value="${safe(x.size || "")}" maxlength="60" placeholder="Size / spec"><input data-k="make" value="${safe(x.make || "")}" maxlength="60" placeholder="Make / brand"><input data-k="note" value="${safe(x.note || "")}" maxlength="200" placeholder="Description / other info"></div>${x._h ? `<span class="prevrate">Last quoted ₹${safe(x._h.rate)} on ${safe(fdate(x._h.date))}</span>` : ""}</td>
  <td><input data-k="hsn" value="${safe(x.hsn || "")}" maxlength="8" inputmode="numeric" style="min-width:70px"></td><td><input data-k="quantity" type="number" min="1" step="any" value="${safe(x.quantity)}"><select data-k="unit">${UNITS.map(u => `<option ${u === (x.unit || "Nos") ? "selected" : ""}>${u}</option>`).join("")}</select></td>
  <td><input data-k="rate" type="number" min="0" step="0.01" inputmode="decimal" value="${x.rate || ""}" placeholder="0.00"></td><td><input data-k="disc" type="number" min="0" max="100" step="0.1" value="${x.disc || ""}" placeholder="0"></td>
  <td><select data-k="gst_rate">${[0, 5, 12, 18, 28].map(n => `<option ${n === +x.gst_rate ? "selected" : ""}>${n}</option>`).join("")}</select></td><td class="r" data-c="b"></td><td class="r" data-c="s"></td><td><button class="x" data-del="${i}" aria-label="Remove line" title="Remove">×</button></td></tr>`).join("");
  $("ql").querySelectorAll("[data-k]").forEach(e => { const h = () => { const i = +e.closest("tr").dataset.i; E.items[i][e.dataset.k] = cvt(e.dataset.k, e); calc() }; e.oninput = h; e.onchange = h });
  $("ql").querySelectorAll("[data-del]").forEach(b => b.onclick = () => { E.items.splice(+b.dataset.del, 1); drawLines() });
  calc();
}
function drawCharges() {
  $("cl").innerHTML = E.charges.length ? E.charges.map((c, i) => `<tr data-i="${i}"><td><input data-ck="label" value="${safe(c.label)}" maxlength="60" aria-label="Label"></td><td style="width:140px"><input data-ck="amount" type="number" step="0.01" min="0" value="${c.amount ? Math.abs(c.amount) : ""}" placeholder="${c.kind === "discount" ? "Discount ₹" : "Amount ₹"}" aria-label="Amount"></td><td style="width:90px"><select data-ck="gst_rate">${[0, 5, 12, 18, 28].map(n => `<option ${n === +c.gst_rate ? "selected" : ""}>${n}</option>`).join("")}</select></td><td style="width:34px"><button class="x" data-cdel="${i}" aria-label="Remove">×</button></td></tr>`).join("") : "<tr><td class='hint'>None added.</td></tr>";
  $("cl").querySelectorAll("[data-ck]").forEach(e => { const h = () => { const c = E.charges[+e.closest("tr").dataset.i], k = e.dataset.ck; c[k] = k === "label" ? e.value : k === "gst_rate" ? +e.value : (c.kind === "discount" ? -1 : 1) * Math.abs(+e.value || 0); calc() }; e.oninput = h; e.onchange = h });
  $("cl").querySelectorAll("[data-cdel]").forEach(b => b.onclick = () => { E.charges.splice(+b.dataset.cdel, 1); drawCharges(); calc() });
}
function calc() {
  E.items.forEach((x, i) => { const r = $("ql").querySelector(`[data-i="${i}"]`); if (!r) return; const l = calcLine(x); r.querySelector("[data-c=b]").textContent = inr(l.b); r.querySelector("[data-c=s]").textContent = inr(l.s) });
  const t = calcQuote(E.items, E.charges), c = Math.round(t.t / 2), intra = $("qg").value === "intra";
  $("tt").innerHTML = `<div><span>Taxable value</span><span>₹ ${inr(t.b)}</span></div>${intra ? `<div><span>CGST</span><span>₹ ${inr(c)}</span></div><div><span>SGST</span><span>₹ ${inr(t.t - c)}</span></div>` : `<div><span>IGST</span><span>₹ ${inr(t.t)}</span></div>`}<div><span>Round off</span><span>${V.signed(t.ro)}</span></div><div class="g"><span>Grand total</span><span>₹ ${inr(t.g)}</span></div>`;
}
function bindEditor() {
  $("qg").onchange = calc;
  $("addc").onclick = () => { E.items.push({ name: "", category: "Custom (not in catalogue)", quantity: 1, unit: "Nos", size: "", make: "", note: "", hsn: "", rate: 0, disc: 0, gst_rate: 18 }); drawLines(); $("ql").lastElementChild.querySelector("[data-k=name]").focus() };
  $("editor").querySelectorAll("[data-chg]").forEach(b => b.onclick = () => { E.charges.push({ label: b.dataset.chg.replace("&amp;", "&"), amount: 0, gst_rate: 18, kind: b.dataset.d ? "discount" : "charge" }); drawCharges() });
  const ap = $("ap"), pop = $("apop");
  ap.oninput = () => { const w = ap.value.toLowerCase().split(/\s+/).filter(Boolean); if (!w.length) { pop.hidden = true; return }
    const r = S.products.filter(p => p.active && w.every(x => (p.name + " " + (p.brand || "") + " " + p.category).toLowerCase().includes(x))).slice(0, 8);
    pop.innerHTML = r.map(p => `<button type="button" data-p="${p.id}">${safe(p.name)} <small class="hint">${safe(p.category)}</small></button>`).join("") || "<div style='padding:8px' class='hint'>No match — use “Custom line”.</div>"; pop.hidden = false;
    pop.querySelectorAll("[data-p]").forEach(b => b.onclick = () => { const p = S.products.find(x => x.id === +b.dataset.p), h = lastRates(E.r)["p" + p.id];
      E.items.push({ pid: p.id, name: p.name, category: p.category, quantity: 1, unit: "Nos", size: "", make: p.brand || "", note: "", hsn: p.hsn || "", rate: h ? h.rate : 0, disc: 0, gst_rate: +p.gst_rate || 18, _h: h }); ap.value = ""; pop.hidden = true; drawLines() }) };
  if (!window._popBound) { window._popBound = 1; document.addEventListener("click", e => { const p = $("apop"); if (p && !e.target.closest(".search-pop")) p.hidden = true }) }
  $("sv").onclick = () => save(false); const rv = $("rev"); if (rv) rv.onclick = () => save(true);
  $("pr").onclick = () => { const q = build(true); if (q) V.printHtml(V.printableQuote({ ...q, quote_number: $("qn").value || "DRAFT" }, { ...E.r }, S.company), $("qn").value || "Quotation") };
  const link = () => location.origin + "/track?ref=" + V.refOf(E.r.id), summary = () => { const t = calcQuote(E.items, E.charges); return { no: $("qn").value || "(draft)", total: inr(t.g) } };
  $("wa").onclick = () => { const s = summary(); window.open("https://wa.me/91" + V.phoneKey(E.r.customer_phone) + "?text=" + encodeURIComponent(`Hello ${E.r.customer_name}, thank you for your enquiry. Quotation ${s.no} from ${S.company.name} — total ₹ ${s.total} incl. GST. Valid until ${fdate($("qv").value)}.\nView, download and accept it online: ${link()}\n(Use reference ${V.refOf(E.r.id)} and your mobile number)`), "_blank", "noopener") };
  $("em2").onclick = () => { const s = summary(); location.href = `mailto:${E.r.customer_email || ""}?subject=${encodeURIComponent("Quotation " + s.no + " — " + S.company.name)}&body=${encodeURIComponent(`Dear ${E.r.customer_name},\n\nThank you for your enquiry. Quotation ${s.no}: total ₹ ${s.total} incl. GST, valid until ${fdate($("qv").value)}.\n\nView, download and accept online: ${link()}\nReference: ${V.refOf(E.r.id)} (with your registered mobile number)\n\nRegards,\n${S.company.name}\n${S.company.phone}`)}` };
  $("cl2").onclick = async () => { try { await navigator.clipboard.writeText(link()); toast("Tracking link copied") } catch { toast(link()) } };
}
function build(forPrint) {
  const items = E.items.filter(x => x.name.trim());
  if (!items.length) { msg("qm", "Add at least one item.", 1); return null }
  if (!forPrint && items.some(x => !(x.rate > 0) || !(x.quantity > 0))) { msg("qm", "Enter a quantity and a rate above zero for every item.", 1); return null }
  const charges = E.charges.filter(c => +c.amount).map(({ label, amount, gst_rate, kind }) => ({ label: label || "Charges", amount: +amount, gst_rate, kind })), t = calcQuote(items, charges);
  if (t.g < 0) { msg("qm", "Discounts cannot exceed the total.", 1); return null }
  return { request_id: E.r.id, quote_date: $("qd").value, valid_until: $("qv").value || null, gst_treatment: $("qg").value, place_of_supply: $("qp").value.trim() || null, bill_to: $("qb").value.trim() || null, ship_to: $("qs").value.trim() || null, payment_terms: $("qpt").value.trim() || null, delivery_terms: $("qdt").value.trim() || null, terms: $("qtm").value,
    items: items.map(({ _h, ...x }) => x), charges, taxable_total: t.b / 100, gst_total: t.t / 100, grand_total: t.g / 100 };
}
async function save(asRevision) {
  const q = build(); if (!q) return; const btn = $(asRevision ? "rev" : "sv"); btn.disabled = true; msg("qm", "Saving…"); let res, no = E.q && E.q.quote_number;
  if (E.q && !asRevision) res = await db.from("quotations").update(q).eq("id", E.q.id).select().single();
  else {
    let revision = 0;
    if (asRevision) { const b = baseNo(no); revision = Math.max(0, ...S.quotes.filter(x => baseNo(x.quote_number) === b).map(x => x.revision || 0)) + 1; no = b + "/R" + revision }
    else { const n = await db.rpc("next_quote_number"); if (n.error) { btn.disabled = false; return msg("qm", "Could not generate number: " + n.error.message, 1) } no = n.data }
    res = await db.from("quotations").insert({ ...q, quote_number: no, revision, status: "issued", created_by: session.user.id }).select().single();
    if (!res.error && asRevision) await db.from("quotations").update({ status: "superseded" }).eq("id", E.q.id);
  }
  btn.disabled = false; if (res.error) return msg("qm", "Could not save: " + res.error.message, 1);
  if (E.r.status === "pending") await patchReq(E.r.id, { status: "quoted" }, "Quotation " + res.data.quote_number + " issued");
  await loadAll(); toast("Saved as " + res.data.quote_number);
  const target = "#/enquiry/" + E.r.id + "/" + res.data.id; if (location.hash === target) route(); else location.hash = target;
}

/* ================= quotations list ================= */
const QF = { q: "", s: "" };
function viewQuotations(v) {
  v.innerHTML = `<div class="box"><div class="row"><input id="qs1" type="search" placeholder="Search quote no. / customer" style="flex:1;min-width:180px" value="${safe(QF.q)}"><select id="qf1"><option value="">All statuses</option>${optList(["issued", "accepted", "rejected", "revision_requested", "superseded"].map(x => [x, x.replace("_", " ")]), QF.s)}</select><button class="btn ghost" id="qx">Export CSV</button></div><p class="meta" id="qc"></p><div id="qlist"></div></div>`;
  const apply = () => {
    QF.q = $("qs1").value; QF.s = $("qf1").value; const s = QF.q.toLowerCase().trim(), td = today();
    const r = S.quotes.filter(q => (!QF.s || q.status === QF.s) && (!s || (q.quote_number + (reqById(q.request_id) || {}).customer_name).toLowerCase().includes(s)));
    $("qc").textContent = `${r.length} quotations · ${money(r.filter(q => !["superseded", "draft"].includes(q.status)).reduce((a, q) => a + Number(q.grand_total), 0))} total value (excl. superseded)`;
    $("qlist").innerHTML = r.length ? r.slice(0, 300).map(q => { const rq = reqById(q.request_id) || {}, exp = q.valid_until && q.valid_until < td && q.status === "issued";
      return `<div class="req"><div><strong>${safe(q.quote_number)}</strong> ${pill(q.status)}${exp ? ' <span class="pill overdue">expired</span>' : ""}<small>${safe(rq.customer_name || "—")} · ${safe(fdate(q.quote_date))} · ${money(q.grand_total)}${q.customer_feedback ? " · “" + safe(q.customer_feedback) + "”" : ""}</small></div>
      <div class="row"><select data-s="${safe(q.id)}" aria-label="Status">${["issued", "accepted", "rejected", "revision_requested", "superseded"].map(x => `<option ${x === q.status ? "selected" : ""}>${x}</option>`).join("")}</select><button class="btn ghost" data-o="${safe(q.id)}">Open</button><button class="btn ghost" data-p="${safe(q.id)}">Print</button></div></div>` }).join("") : "<p>No quotations.</p>";
    $("qlist").querySelectorAll("[data-o]").forEach(b => b.onclick = () => { const q = S.quotes.find(x => x.id === b.dataset.o); gotoEnquiry(q.request_id, q.id) });
    $("qlist").querySelectorAll("[data-p]").forEach(b => b.onclick = () => printSaved(S.quotes.find(x => x.id === b.dataset.p)));
    $("qlist").querySelectorAll("[data-s]").forEach(e => e.onchange = async () => { const { error } = await db.from("quotations").update({ status: e.value }).eq("id", e.dataset.s); if (error) toast(error.message); else { S.quotes.find(x => x.id === e.dataset.s).status = e.value; toast("Status updated"); apply() } });
    apply.rows = r;
  };
  $("qs1").oninput = apply; $("qf1").onchange = apply;
  $("qx").onclick = () => csvDownload("quotations.csv", [["Quote no", "Date", "Valid until", "Customer", "Phone", "Status", "Taxable", "GST", "Total", "Revision"], ...(apply.rows || []).map(q => { const r = reqById(q.request_id) || {}; return [q.quote_number, q.quote_date, q.valid_until, r.customer_name, r.customer_phone, q.status, q.taxable_total, q.gst_total, q.grand_total, q.revision || 0] })]);
  apply();
}

/* ================= customers ================= */
let CQ = "";
function custStats(c) {
  const rs = S.reqs.filter(r => r.phone_key === c.phone_key), ids = new Set(rs.map(r => r.id)), qs = S.quotes.filter(q => ids.has(q.request_id) && !["draft", "superseded"].includes(q.status));
  return { rs, qs, won: qs.filter(q => q.status === "accepted").reduce((a, q) => a + Number(q.grand_total), 0), quoted: qs.reduce((a, q) => a + Number(q.grand_total), 0) };
}
function viewCustomers(v) {
  v.innerHTML = `<div class="box"><div class="row"><input id="cs" type="search" placeholder="Search name / phone / GSTIN" style="flex:1" value="${safe(CQ)}"><button class="btn ghost" id="cx">Export CSV</button></div><p class="meta" id="cc"></p><div id="cl3"></div></div>`;
  const apply = () => {
    CQ = $("cs").value; const s = CQ.toLowerCase().trim(); const r = S.customers.filter(c => !s || (c.name + c.phone + (c.gstin || "") + (c.email || "")).toLowerCase().includes(s)).sort((a, b) => String(b.last_enquiry_at || "").localeCompare(String(a.last_enquiry_at || "")));
    $("cc").textContent = r.length + " customers"; apply.rows = r;
    $("cl3").innerHTML = r.length ? r.slice(0, 300).map(c => { const st = custStats(c); return `<div class="req link" data-c="${safe(c.phone_key)}"><div><strong>${safe(c.name)}</strong><small>${safe(c.phone)}${c.gstin ? " · GSTIN " + safe(c.gstin) : ""} · ${st.rs.length} enquiries · quoted ${money(st.quoted)} · won ${money(st.won)}</small></div><small>${c.last_enquiry_at ? "Last: " + safe(fdate(c.last_enquiry_at)) : ""}</small></div>` }).join("") : "<p>No customers yet — they appear automatically when someone submits an enquiry.</p>";
    $("cl3").querySelectorAll("[data-c]").forEach(b => b.onclick = () => editCustomer(b.dataset.c));
  };
  $("cs").oninput = apply; apply();
  $("cx").onclick = () => csvDownload("customers.csv", [["Name", "Phone", "Email", "GSTIN", "Address", "Enquiries", "Quoted value", "Won value"], ...(apply.rows || []).map(c => { const s = custStats(c); return [c.name, c.phone, c.email, c.gstin, c.address, s.rs.length, s.quoted, s.won] })]);
}
function editCustomer(key) {
  const c = S.customers.find(x => x.phone_key === key), st = custStats(c);
  const b = dlg(`<h2 style="margin-top:0">${safe(c.name)}</h2><div class="grid2"><label class="f">Name / company<input id="cn" value="${safe(c.name)}" maxlength="180"></label><label class="f">Phone<input value="${safe(c.phone)}" readonly></label>
  <label class="f">Email<input id="ce" value="${safe(c.email || "")}" maxlength="160"></label><label class="f">GSTIN<input id="cg" value="${safe(c.gstin || "")}" maxlength="15" style="text-transform:uppercase"></label>
  <label class="f full">Address (used as “Bill to” on quotations)<textarea id="ca" rows="3" maxlength="400">${safe(c.address || "")}</textarea></label><label class="f full">Internal notes<textarea id="cnote" rows="2" maxlength="1000">${safe(c.notes || "")}</textarea></label></div>
  <div class="row" style="margin-top:12px"><button class="btn" id="csv">Save</button><span class="msg" id="cm"></span></div><h4>History</h4>
  ${st.rs.map(r => `<div class="req link" data-e="${safe(r.id)}"><div>Ref ${V.refOf(r.id)} ${pill(r.status)}<small>${safe(fdate(r.created_at))} · ${r.items.length} item(s)</small></div></div>`).join("") || "<p class='hint'>No enquiries.</p>"}`);
  b.querySelectorAll("[data-e]").forEach(x => x.onclick = () => { $("dlg").close(); gotoEnquiry(x.dataset.e) });
  $("csv").onclick = async () => { const patch = { name: $("cn").value.trim() || c.name, email: $("ce").value.trim() || null, gstin: $("cg").value.trim().toUpperCase() || null, address: $("ca").value.trim() || null, notes: $("cnote").value.trim() || null };
    const { error } = await db.from("customers").update(patch).eq("phone_key", key); if (error) return msg("cm", error.message, 1); Object.assign(c, patch); $("dlg").close(); toast("Customer saved"); route() };
}

/* ================= products ================= */
const PQ = { q: "", c: "" };
async function toBlob(file, max, type) {
  if (file.type === "application/pdf") return file;
  const bmp = await createImageBitmap(file), k = Math.min(1, max / Math.max(bmp.width, bmp.height)), c = document.createElement("canvas");
  c.width = Math.round(bmp.width * k); c.height = Math.round(bmp.height * k); const x = c.getContext("2d"); if (type === "image/webp") { x.fillStyle = "#fff"; x.fillRect(0, 0, c.width, c.height) }
  x.drawImage(bmp, 0, 0, c.width, c.height); return new Promise(r => c.toBlob(r, type, 0.85));
}
async function uploadPublic(file, folder, max = 1000, type = "image/webp") {
  const blob = await toBlob(file, max, type), isPdf = file.type === "application/pdf", ext = isPdf ? "pdf" : type === "image/png" ? "png" : "webp";
  const path = `${folder}/${Date.now()}-${Math.random().toString(36).slice(2, 7)}.${ext}`;
  const { error } = await db.storage.from("product-images").upload(path, blob, { contentType: isPdf ? "application/pdf" : type, cacheControl: "31536000" }); if (error) throw error;
  return db.storage.from("product-images").getPublicUrl(path).data.publicUrl;
}
function viewProducts(v) {
  const cats = [...new Set(S.products.map(p => p.category))].sort(), own = isOwner();
  v.innerHTML = `<div class="box"><div class="row"><input id="ps" type="search" placeholder="Search products" style="flex:1;min-width:180px" value="${safe(PQ.q)}"><select id="pc"><option value="">All categories</option>${optList(cats.map(c => [c, c]), PQ.c)}</select>
  ${own ? '<button class="btn" id="pa">+ Add product</button><button class="btn ghost" id="pcr">Rename category</button>' : ""}</div>
  ${!S.products.length ? `<div class="banner" style="margin-top:12px"><b>Your catalogue is still loaded from products.json.</b> ${own ? 'Click <button class="btn" id="imp">Import products.json into the database</button> once to manage products, photos, specifications and categories here — no code or GitHub upload needed afterwards.' : "Ask the owner to import it."}</div>` : ""}
  <p class="meta" id="pcnt"></p><div class="scroll"><table class="l"><thead><tr><th></th><th>Product</th><th>Category</th><th>Brand</th><th>HSN</th><th>GST</th><th>Status</th><th></th></tr></thead><tbody id="pl"></tbody></table></div></div>`;
  const apply = () => {
    PQ.q = $("ps").value; PQ.c = $("pc").value; const w = PQ.q.toLowerCase().split(/\s+/).filter(Boolean);
    const r = S.products.filter(p => (!PQ.c || p.category === PQ.c) && w.every(x => (p.name + " " + (p.brand || "") + " " + (p.model || "")).toLowerCase().includes(x)));
    $("pcnt").textContent = `${r.length} of ${S.products.length} products`;
    $("pl").innerHTML = r.slice(0, 150).map(p => `<tr><td><img class="thumb" src="${safe(V.imgUrl(p.image) || "")}" alt="" loading="lazy"></td><td><b>${safe(p.name)}</b></td><td>${safe(p.category)}</td><td>${safe(p.brand || "")}</td><td>${safe(p.hsn || "")}</td><td>${safe(p.gst_rate)}%</td><td>${p.active ? pill("issued").replace("issued", "live") : pill("off").replace("off", "hidden")}</td><td>${own ? `<button class="btn ghost" data-e="${p.id}">Edit</button>` : ""}</td></tr>`).join("") || "<tr><td colspan='8'>No products.</td></tr>";
    $("pl").querySelectorAll("[data-e]").forEach(b => b.onclick = () => editProduct(S.products.find(p => p.id === +b.dataset.e)));
  };
  $("ps").oninput = apply; $("pc").onchange = apply; apply();
  if (own) {
    $("pa").onclick = () => editProduct(null);
    $("pcr").onclick = () => { const b = dlg(`<h2 style="margin-top:0">Rename category</h2><label class="f">Category<select id="rc1">${optList(cats.map(c => [c, c]), "")}</select></label><label class="f" style="margin-top:8px">New name<input id="rc2" maxlength="120"></label><p><button class="btn" id="rcg">Rename</button> <span class="msg" id="rcm"></span></p>`);
      $("rcg").onclick = async () => { const n = $("rc2").value.trim(); if (!n) return msg("rcm", "Enter the new name.", 1); const { error } = await db.from("products").update({ category: n }).eq("category", $("rc1").value); if (error) return msg("rcm", error.message, 1); $("dlg").close(); await loadAll(); route(); toast("Category renamed") } };
    const imp = $("imp"); if (imp) imp.onclick = async () => {
      imp.disabled = true; imp.textContent = "Importing…";
      try { const d = await (await fetch("/products.json")).json(); const { data, error } = await db.rpc("import_products", { p: d.products }); if (error) throw error; await loadAll(); route(); toast(data + " products imported") }
      catch (e) { toast("Import failed: " + (e.message || e)); imp.disabled = false; imp.textContent = "Import products.json into the database" }
    };
  }
}
function editProduct(p) {
  const cats = [...new Set(S.products.map(x => x.category))].sort();
  const st = { imgs: p ? [p.image, ...(Array.isArray(p.images) ? p.images : [])].filter(Boolean) : [], specs: p && Array.isArray(p.specs) ? p.specs.map(s => ({ ...s })) : [], ds: p ? p.datasheet || "" : "" };
  const b = dlg(`<h2 style="margin-top:0">${p ? "Edit product" : "Add product"}</h2><div class="grid2">
  <label class="f full">Name *<input id="pn" maxlength="200" value="${safe(p ? p.name : "")}"></label>
  <label class="f">Category *<input id="pcat" list="cl" maxlength="120" value="${safe(p ? p.category : "")}"><datalist id="cl">${cats.map(c => `<option value="${safe(c)}">`).join("")}</datalist></label>
  <label class="f">Brand<input id="pb" maxlength="80" value="${safe(p ? p.brand || "" : "")}"></label><label class="f">Model<input id="pm" maxlength="80" value="${safe(p ? p.model || "" : "")}"></label>
  <label class="f">HSN code<input id="ph" maxlength="8" inputmode="numeric" value="${safe(p ? p.hsn || "" : "")}"></label>
  <label class="f">Default GST %<select id="pg">${[0, 5, 12, 18, 28].map(n => `<option ${n === +(p ? p.gst_rate : 18) ? "selected" : ""}>${n}</option>`).join("")}</select></label>
  <label class="chk"><input type="checkbox" id="pact" ${!p || p.active ? "checked" : ""}> Visible on website</label>
  <label class="f full">Description<textarea id="pd" rows="3" maxlength="2000">${safe(p ? p.description || "" : "")}</textarea></label></div>
  <h4 style="margin:14px 0 4px">Technical specifications</h4><div id="sp"></div><button class="btn ghost" id="spa" type="button">+ Add specification</button>
  <h4 style="margin:14px 0 4px">Images <small class="hint">(first image is the main one · photos are resized automatically)</small></h4><div class="imgs" id="im"></div><input type="file" id="pf" accept="image/*" multiple>
  <h4 style="margin:14px 0 4px">Datasheet (PDF)</h4><div id="dsb"></div><input type="file" id="dsf" accept="application/pdf">
  <div class="row" style="margin-top:16px"><button class="btn" id="psv">Save product</button>${p ? '<button class="btn ghost" id="pdel" style="color:var(--red)">Delete</button>' : ""}<span class="msg" id="pm2"></span></div>`);
  const drawSp = () => { $("sp").innerHTML = st.specs.map((s, i) => `<div class="row" style="margin-bottom:6px"><input data-sk="${i}" placeholder="e.g. Power" value="${safe(s.k)}" style="flex:1" maxlength="60"><input data-sv="${i}" placeholder="e.g. 850 W" value="${safe(s.v)}" style="flex:2" maxlength="120"><button class="x" data-sd="${i}" aria-label="Remove">×</button></div>`).join("");
    $("sp").querySelectorAll("[data-sk]").forEach(e => e.oninput = () => st.specs[+e.dataset.sk].k = e.value); $("sp").querySelectorAll("[data-sv]").forEach(e => e.oninput = () => st.specs[+e.dataset.sv].v = e.value);
    $("sp").querySelectorAll("[data-sd]").forEach(e => e.onclick = () => { st.specs.splice(+e.dataset.sd, 1); drawSp() }) };
  const drawIm = () => { $("im").innerHTML = st.imgs.map((u, i) => `<span><img src="${safe(V.imgUrl(u))}" alt="" title="${i ? "Click to make main image" : "Main image"}" data-m="${i}"><button data-r="${i}" aria-label="Remove image">×</button></span>`).join("") || "<span class='hint'>No images.</span>";
    $("im").querySelectorAll("[data-r]").forEach(e => e.onclick = () => { st.imgs.splice(+e.dataset.r, 1); drawIm() }); $("im").querySelectorAll("[data-m]").forEach(e => e.onclick = () => { const [x] = st.imgs.splice(+e.dataset.m, 1); st.imgs.unshift(x); drawIm() }) };
  const drawDs = () => { $("dsb").innerHTML = st.ds ? `<a href="${safe(st.ds)}" target="_blank" rel="noopener">View current datasheet</a> <button class="x" id="dsr" aria-label="Remove">×</button>` : ""; const r = $("dsr"); if (r) r.onclick = () => { st.ds = ""; drawDs() } };
  drawSp(); drawIm(); drawDs(); $("spa").onclick = () => { st.specs.push({ k: "", v: "" }); drawSp() };
  $("pf").onchange = async e => { msg("pm2", "Uploading…"); try { for (const f of e.target.files) st.imgs.push(await uploadPublic(f, "p")); msg("pm2", ""); drawIm() } catch (er) { msg("pm2", "Upload failed: " + er.message, 1) } e.target.value = "" };
  $("dsf").onchange = async e => { const f = e.target.files[0]; if (!f) return; msg("pm2", "Uploading…"); try { st.ds = await uploadPublic(f, "datasheets"); msg("pm2", ""); drawDs() } catch (er) { msg("pm2", "Upload failed: " + er.message, 1) } };
  $("psv").onclick = async () => {
    const name = $("pn").value.trim(), category = $("pcat").value.trim(); if (!name || !category) return msg("pm2", "Name and category are required.", 1);
    const row = { name, category, brand: $("pb").value.trim() || null, model: $("pm").value.trim() || null, description: $("pd").value.trim() || null, hsn: $("ph").value.replace(/\D/g, "") || null, gst_rate: +$("pg").value, active: $("pact").checked,
      specs: st.specs.filter(s => s.k.trim() && s.v.trim()).map(s => ({ k: s.k.trim(), v: s.v.trim() })), image: st.imgs[0] || null, images: st.imgs.slice(1), datasheet: st.ds || null };
    $("psv").disabled = true; const r = p ? await db.from("products").update(row).eq("id", p.id) : await db.from("products").insert(row); $("psv").disabled = false;
    if (r.error) return msg("pm2", r.error.message, 1); $("dlg").close(); await loadAll(); route(); toast("Product saved");
  };
  const del = $("pdel"); if (del) del.onclick = async () => { if (!confirm("Delete “" + p.name + "” permanently? Hiding it from the website is safer.")) return; const { error } = await db.from("products").delete().eq("id", p.id); if (error) return msg("pm2", error.message, 1); $("dlg").close(); await loadAll(); route(); toast("Deleted") };
}

/* ================= reports ================= */
let RP = "6";
function viewReports(v) {
  v.innerHTML = `<div class="box"><div class="row"><label class="f">Period<select id="rpp">${optList([["3", "Last 3 months"], ["6", "Last 6 months"], ["12", "Last 12 months"], ["fy", "This financial year"], ["all", "All time"]], RP)}</select></label></div></div><div id="rbody"></div>`;
  const draw = () => {
    RP = $("rpp").value; const now = new Date(); let from = new Date(0);
    if (RP === "fy") from = new Date(now.getMonth() < 3 ? now.getFullYear() - 1 : now.getFullYear(), 3, 1); else if (RP !== "all") from = new Date(now.getFullYear(), now.getMonth() - (+RP - 1), 1);
    const reqs = S.reqs.filter(r => new Date(r.created_at) >= from), rid = new Set(reqs.map(r => r.id)), qs = S.quotes.filter(q => !["draft", "superseded"].includes(q.status) && new Date(q.created_at) >= from);
    const mk = x => iso(x.created_at).slice(0, 7), months = [...new Set([...reqs.map(mk), ...qs.map(mk)])].sort().reverse();
    const sum = l => l.reduce((a, q) => a + Number(q.grand_total), 0), won = qs.filter(q => q.status === "accepted");
    const prod = {}; reqs.forEach(r => r.items.forEach(i => { const k = i.name; prod[k] = prod[k] || { n: 0, q: 0 }; prod[k].n++; prod[k].q += +i.quantity || 0 }));
    const topP = Object.entries(prod).sort((a, b) => b[1].n - a[1].n || b[1].q - a[1].q).slice(0, 15);
    const cust = {}; qs.forEach(q => { const r = reqById(q.request_id); if (!r) return; const k = r.phone_key; cust[k] = cust[k] || { name: r.customer_name, q: 0, w: 0 }; cust[k].q += Number(q.grand_total); if (q.status === "accepted") cust[k].w += Number(q.grand_total) });
    const topC = Object.values(cust).sort((a, b) => b.q - a.q).slice(0, 10);
    const per = {}; reqs.forEach(r => { const k = r.assigned_to || "—"; per[k] = per[k] || { n: 0, q: 0, w: 0 }; per[k].n++ }); qs.forEach(q => { const r = reqById(q.request_id); if (!r || !rid.has(r.id)) return; const k = r.assigned_to || "—"; per[k] = per[k] || { n: 0, q: 0, w: 0 }; per[k].q += Number(q.grand_total); if (q.status === "accepted") per[k].w += Number(q.grand_total) });
    const T = (h, rows) => `<div class="scroll"><table class="l"><thead><tr>${h.map(x => `<th>${x}</th>`).join("")}</tr></thead><tbody>${rows.map(r => `<tr>${r.map((c, i) => `<td ${i ? 'class="r"' : ""}>${c}</td>`).join("")}</tr>`).join("") || `<tr><td colspan="${h.length}">No data.</td></tr>`}</tbody></table></div>`;
    $("rbody").innerHTML = `<div class="kpis"><div class="kpi"><small>ENQUIRIES</small><b>${reqs.length}</b></div><div class="kpi"><small>QUOTES SENT</small><b>${qs.length}</b><span>${money(sum(qs))}</span></div><div class="kpi"><small>ACCEPTED</small><b>${won.length}</b><span>${money(sum(won))}</span></div><div class="kpi"><small>ENQUIRY → QUOTE</small><b>${reqs.length ? Math.round(reqs.filter(r => r.status !== "pending").length / reqs.length * 100) : 0}%</b></div><div class="kpi"><small>QUOTE → WON</small><b>${qs.length ? Math.round(won.length / qs.length * 100) : 0}%</b></div></div>
    <div class="box"><div class="row" style="justify-content:space-between"><h3 style="margin:0">By month</h3><button class="btn ghost" id="rm">CSV</button></div>${T(["Month", "Enquiries", "Quotes", "Quoted value", "Accepted", "Accepted value"], months.map(m => { const a = reqs.filter(r => mk(r) === m).length, q = qs.filter(x => mk(x) === m), w = q.filter(x => x.status === "accepted"); return [m, a, q.length, money(sum(q)), w.length, money(sum(w))] }))}</div>
    <div class="cols"><div class="box"><h3 style="margin-top:0">Most requested products</h3>${T(["Product", "Enquiries", "Total qty"], topP.map(([k, v]) => [safe(k), v.n, num(v.q)]))}</div>
    <div class="box"><h3 style="margin-top:0">Top customers (quoted value)</h3>${T(["Customer", "Quoted", "Won"], topC.map(c => [safe(c.name), money(c.q), money(c.w)]))}</div></div>
    <div class="box"><h3 style="margin-top:0">By salesperson</h3>${T(["Staff", "Enquiries", "Quoted", "Won"], Object.entries(per).map(([k, x]) => [k === "—" ? "Unassigned" : safe(staffName(k)), x.n, money(x.q), money(x.w)]))}</div>`;
    $("rm").onclick = () => csvDownload("monthly-report.csv", [["Month", "Enquiries", "Quotes", "Quoted value", "Accepted", "Accepted value"], ...months.map(m => { const a = reqs.filter(r => mk(r) === m).length, q = qs.filter(x => mk(x) === m), w = q.filter(x => x.status === "accepted"); return [m, a, q.length, sum(q), w.length, sum(w)] })]);
  };
  $("rpp").onchange = draw; draw();
}

/* ================= settings (owner) ================= */
function viewSettings(v) {
  const c = S.company, f = (id, l, val, ex = "") => `<label class="f ${ex}">${l}<input id="${id}" value="${safe(val || "")}" maxlength="200"></label>`;
  v.innerHTML = `<div class="box"><h2 style="margin-top:0">Company &amp; quotation settings</h2><p class="hint">These appear on every quotation PDF and the customer tracking page.</p><div class="grid2">
  ${f("sn", "Company name", c.name)}${f("st", "Tagline", c.tagline)}${f("sa", "Address", c.address, "full")}${f("sp", "Phone", c.phone)}${f("se", "Email", c.email)}${f("sg", "GSTIN", c.gstin)}${f("ss", "State code (e.g. 24 = Gujarat)", c.state_code)}${f("sv", "Default validity (days)", c.validity_days)}${f("ssig", "Signatory text", c.signatory)}
  <div class="f full"><span>Logo</span><div class="row">${c.logo ? `<img id="lp" src="${safe(c.logo)}" alt="" style="max-height:50px">` : ""}<input type="file" id="lf" accept="image/*"><button class="btn ghost" id="lr" type="button">Remove logo</button></div></div>
  <label class="f full">Bank details (shown on quotations)<textarea id="sb" rows="3" maxlength="500" placeholder="Bank name, A/c no., IFSC, branch">${safe(c.bank || "")}</textarea></label>
  <label class="f full">Default terms &amp; conditions<textarea id="sterm" rows="3" maxlength="2000">${safe(c.terms || "")}</textarea></label>
  ${f("spt", "Default payment terms", c.payment_terms)}${f("sdt", "Default delivery terms", c.delivery_terms)}</div>
  <p><button class="btn" id="ssv">Save settings</button> <span class="msg" id="sm"></span></p></div>`;
  let logo = c.logo || "";
  $("lf").onchange = async e => { const f0 = e.target.files[0]; if (!f0) return; msg("sm", "Uploading logo…"); try { logo = await uploadPublic(f0, "branding", 500, "image/png"); msg("sm", "Logo uploaded — click Save settings."); const im = $("lp"); if (im) im.src = logo } catch (er) { msg("sm", "Upload failed: " + er.message, 1) } };
  $("lr").onclick = () => { logo = ""; const im = $("lp"); if (im) im.remove(); msg("sm", "Logo removed — click Save settings.") };
  $("ssv").onclick = async () => {
    const val = { name: $("sn").value.trim(), tagline: $("st").value.trim(), address: $("sa").value.trim(), phone: $("sp").value.trim(), email: $("se").value.trim(), gstin: $("sg").value.trim().toUpperCase(), state_code: $("ss").value.trim(), validity_days: +$("sv").value || 15, signatory: $("ssig").value.trim(), logo, bank: $("sb").value.trim(), terms: $("sterm").value.trim(), payment_terms: $("spt").value.trim(), delivery_terms: $("sdt").value.trim() };
    const { error } = await db.from("settings").upsert({ key: "company", value: val, updated_at: new Date().toISOString() }); if (error) return msg("sm", error.message, 1); S.company = { ...V.DEFAULT_COMPANY, ...val }; msg("sm", "Saved ✓");
  };
}

/* ================= staff (owner) ================= */
function viewStaff(v) {
  v.innerHTML = `<div class="box"><h2 style="margin-top:0">Staff accounts</h2><p class="hint"><b>Owner</b>: everything, including products, settings and staff. <b>Sales</b>: enquiries, quotations and customers; can view products. To add a person: first create their login in Supabase → Authentication → Users, then add their email here.</p>
  <div id="stl"></div></div><div class="box"><h3 style="margin-top:0">Add staff member</h3><div class="row"><input id="ae" type="email" placeholder="Email (must exist in Authentication)" style="flex:1;min-width:200px"><input id="an" placeholder="Name" style="width:160px"><select id="ar"><option value="sales">Sales</option><option value="owner">Owner</option></select><button class="btn" id="aa">Add</button></div><div class="msg" id="am"></div></div>`;
  $("stl").innerHTML = S.staff.map(s => `<div class="req"><div><strong>${safe(s.name || s.email)}</strong>${s.user_id === session.user.id ? " (you)" : ""}<small>${safe(s.email)}</small></div><div class="row"><select data-r="${safe(s.user_id)}" data-e="${safe(s.email)}" data-n="${safe(s.name || "")}" ${s.user_id === session.user.id ? "disabled" : ""}>${optList([["sales", "Sales"], ["owner", "Owner"]], s.role)}</select>${s.user_id !== session.user.id ? `<button class="btn ghost" data-d="${safe(s.user_id)}">Remove</button>` : ""}</div></div>`).join("");
  $("stl").querySelectorAll("[data-r]").forEach(e => e.onchange = async () => { const { error } = await db.rpc("add_staff", { p_email: e.dataset.e, p_name: e.dataset.n, p_role: e.value }); if (error) toast(error.message); else { toast("Role updated"); await loadAll(); route() } });
  $("stl").querySelectorAll("[data-d]").forEach(b => b.onclick = async () => { if (!confirm("Remove this staff member's access?")) return; const { error } = await db.rpc("remove_staff", { p_user: b.dataset.d }); if (error) toast(error.message); else { await loadAll(); route() } });
  $("aa").onclick = async () => { const { error } = await db.rpc("add_staff", { p_email: $("ae").value, p_name: $("an").value, p_role: $("ar").value }); if (error) return msg("am", error.message.replace(/^.*?:\s*/, ""), 1); await loadAll(); route(); toast("Staff member added") };
}

boot();


})();
