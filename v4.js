"use strict";
/* v4 additions: company details, industries shortcuts, call-back form, list download/share, analytics. */
(() => {
const $ = id => document.getElementById(id), V = window.Vectra, C = window.VECTRA_COMPANY || {}, WA = "917597577129";
const show = (id, on) => { const e = $(id); if (e) e.hidden = !on };

/* ---------- analytics (only if a GA4 id is set in config.js) ---------- */
const GA = (window.VECTRA_GA_ID || "").trim();
if (/^G-[A-Z0-9]+$/.test(GA)) {
  window.dataLayer = window.dataLayer || []; window.gtag = function () { dataLayer.push(arguments) };
  gtag("js", new Date()); gtag("config", GA, { anonymize_ip: true });
  const s = document.createElement("script"); s.async = true; s.src = "https://www.googletagmanager.com/gtag/js?id=" + GA; document.head.appendChild(s);
}
window.vtrack = (name, params) => { try { window.gtag && gtag("event", name, params || {}) } catch { } };
document.addEventListener("click", e => {
  const a = e.target.closest("a[href]"); if (a) { const h = a.getAttribute("href"); if (/^tel:/.test(h)) vtrack("call_click"); else if (/wa\.me/.test(h)) vtrack("whatsapp_click", { where: a.closest(".mbar") ? "mobile_bar" : a.className.includes("floatwa") ? "float" : "page" }) }
  const b = e.target.closest("#openBulk,#openBulk2,#openBulk3,#drawBulk"); if (b) vtrack("bulk_upload_open");
});

/* ---------- company details from config.js (only shown when filled in) ---------- */
if (C.gstin) { show("tGst", true); $("tGstV").textContent = C.gstin; const f = $("footGst"); f.hidden = false; f.textContent = "GSTIN: " + C.gstin }
if (C.established) { show("tEst", true); $("tEstV").textContent = C.established }
if (C.serviceArea) $("factArea").textContent = C.serviceArea;
if (C.hours) { show("factHoursW", true); $("factHours").textContent = C.hours; show("cHoursW", true); $("cHours").textContent = C.hours }
if (C.quoteTurnaround) { show("factQtW", true); $("factQt").textContent = "Quotations " + C.quoteTurnaround }

/* ---------- industries: jump to the matching category in the catalogue ---------- */
document.querySelectorAll(".ind").forEach(b => b.onclick = () => {
  const want = b.dataset.cat, chip = [...document.querySelectorAll("#filters .chip")].find(c => c.textContent === want);
  if (chip) chip.click(); $("catalog").scrollIntoView();
});

/* ---------- call-back request (stored as an enquiry, so it shows up in the admin workspace) ---------- */
const msg = (t, cls) => { const m = $("cbMsg"); m.textContent = t; m.className = "msg" + (cls ? " " + cls : "") };
$("cbGo").onclick = async () => {
  const name = $("cbName").value.trim(), phone = $("cbPhone").value.replace(/[\s\-()]/g, ""), note = $("cbNote").value.trim();
  if ($("cbWeb").value) return;
  if (!name) { $("cbName").focus(); return msg("Please enter your name or company.", "err") }
  if (!/^(\+91|0)?[6-9]\d{9}$/.test(phone)) { $("cbPhone").focus(); return msg("Enter a valid 10-digit Indian mobile number.", "err") }
  if (Date.now() - (+localStorage.getItem("vectra_last") || 0) < 30000) return msg("Please wait a few seconds before sending another request.", "err");
  if (!V.db) { msg(""); const a = document.createElement("a"); a.href = `https://wa.me/${WA}?text=` + encodeURIComponent(`Hello Vectra Enterprises, please call me back.\nName: ${name}\nPhone: ${phone}${note ? "\nNeed: " + note : ""}`); a.target = "_blank"; a.rel = "noopener"; a.textContent = "Online requests are unavailable. Tap to send this on WhatsApp."; $("cbMsg").appendChild(a); return }
  $("cbGo").disabled = true; msg("Sending…");
  const { error } = await V.db.from("quotation_requests").insert({ id: crypto.randomUUID(), customer_name: name, customer_phone: phone, customer_notes: "CALL-BACK REQUEST" + (note ? " — " + note : ""), items: [{ name: "Call-back request", category: "Call back", quantity: 1, size: "", make: "", note: note.slice(0, 200) }], attachments: [], status: "pending" });
  $("cbGo").disabled = false;
  if (error) { console.error(error); return msg("Could not send. Please call or WhatsApp us instead.", "err") }
  try { localStorage.setItem("vectra_last", Date.now()) } catch { }
  vtrack("callback_submit"); $("cbName").value = $("cbPhone").value = $("cbNote").value = ""; msg("Thank you. We will call you back soon.", "ok");
};

/* ---------- quotation list: download CSV / share on WhatsApp ---------- */
const rows = () => (window.VectraList ? window.VectraList.rows() : []);
const csvCell = v => { v = String(v ?? ""); if (/^[=+\-@\t\r]/.test(v)) v = "'" + v; return /[",\n]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v };
$("dlList").onclick = () => {
  const r = rows(); if (!r.length) return V && alert("Your list is empty.");
  const csv = ["Product,Quantity,Size / specification,Make / brand,Notes", ...r.map(x => [x.name, x.qty, x.size, x.make, x.note].map(csvCell).join(","))].join("\r\n");
  const a = document.createElement("a"); a.href = URL.createObjectURL(new Blob(["\ufeff" + csv], { type: "text/csv" })); a.download = "vectra-quotation-list.csv"; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 2000); vtrack("list_download", { items: r.length });
};
$("shList").onclick = () => {
  const r = rows(); if (!r.length) return V && alert("Your list is empty.");
  const t = "Hello Vectra Enterprises, please quote:\n" + r.map((x, i) => `${i + 1}. ${x.name} × ${x.qty}${[x.size && "Size: " + x.size, x.make && "Make: " + x.make, x.note].filter(Boolean).length ? " (" + [x.size && "Size: " + x.size, x.make && "Make: " + x.make, x.note].filter(Boolean).join(", ") + ")" : ""}`).join("\n");
  window.open(`https://wa.me/${WA}?text=` + encodeURIComponent(t.slice(0, 3500)), "_blank", "noopener"); vtrack("list_share_whatsapp", { items: r.length });
};
})();
