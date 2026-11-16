"use strict";
(() => {
const V = window.Vectra, db = V.db, safe = V.safe, $ = id => document.getElementById(id);
const EKEY = "vectra_enquiries_v3";
let data = null, cred = null;
const msg = (t, e) => { const m = $("m"); m.textContent = t; m.className = "msg" + (e ? " err" : "") };
const toast = t => { const e = $("toast"); e.textContent = t; e.classList.add("on"); setTimeout(() => e.classList.remove("on"), 2200) };
const load = () => { try { return JSON.parse(localStorage.getItem(EKEY)) || [] } catch { return [] } };
const LABEL = { issued: "Awaiting your response", accepted: "Accepted", rejected: "Declined", revision_requested: "Revision requested" };

async function lookup(ref, phone, quiet) {
  if (!db) return msg("Tracking is not available right now. Please call or WhatsApp us.", 1);
  if (!ref || V.phoneKey(phone).length < 10) return msg("Enter your reference number and 10-digit mobile number.", 1);
  msg("Checking…"); $("go").disabled = true;
  const { data: d, error } = await db.rpc("track_enquiry", { p_ref: ref, p_phone: phone }); $("go").disabled = false;
  if (error) { console.error(error); return msg("Could not check right now. Please try again.", 1) }
  if (!d) { $("out").innerHTML = ""; return msg("No enquiry found for that reference and mobile number. Check both and try again.", 1) }
  msg(""); data = d; cred = { ref: d.ref, phone };
  const l = load().filter(x => x.ref !== d.ref); l.unshift({ ref: d.ref, phone, name: d.customer.name, at: Date.now() }); try { localStorage.setItem(EKEY, JSON.stringify(l.slice(0, 8))) } catch { }
  draw();
}
function draw() {
  const d = data, qs = d.quotations || [], accepted = qs.some(q => q.status === "accepted");
  const stage = accepted ? 3 : qs.length ? 2 : 1, labels = ["Request received", "Under review", "Quotation sent", "Accepted"];
  const steps = labels.map((l, i) => `<div class="${i < stage ? "on" : ""} ${i === stage ? "cur" : ""}">${l}</div>`).join("");
  const items = (d.items || []).map(x => `<li>${safe(x.name)} × ${safe(x.quantity)}${x.size || x.make ? " <small>(" + safe([x.size, x.make].filter(Boolean).join(", ")) + ")</small>" : ""}</li>`).join("");
  const exp = q => q.valid_until && q.status === "issued" && new Date(q.valid_until + "T23:59:59") < new Date();
  const qhtml = qs.map(q => { const t = V.calcQuote(q.items, q.charges), open = ["issued", "revision_requested"].includes(q.status);
    return `<div class="qcard" data-q="${safe(q.id)}"><div class="qhead"><div><b>${safe(q.quote_number)}</b> <span class="pill ${safe(q.status)}">${safe(LABEL[q.status] || q.status)}</span>${exp(q) ? ' <span class="pill rejected">Validity expired</span>' : ""}<br><small>Date ${safe(V.fdate(q.quote_date))} · Valid until ${safe(V.fdate(q.valid_until))}</small></div><div class="big">₹ ${V.inr(t.g)}</div></div>
    <p class="meta">${(q.items || []).length} item(s) · includes GST</p>${q.customer_feedback ? `<p class="meta"><i>Your note: ${safe(q.customer_feedback)}</i></p>` : ""}
    <div class="row"><button class="btn" data-pdf="${safe(q.id)}">View / Download PDF</button>${open && !exp(q) ? `<button class="btn wa" data-act="accept">Accept</button><button class="btn ghost" data-act="revise">Request revision</button><button class="btn ghost" data-act="reject">Decline</button>` : ""}</div>
    <div class="respond" hidden><label class="field">Message (optional)<textarea rows="2" maxlength="500" placeholder="Add a note for our team"></textarea></label><div class="row"><button class="btn" data-send>Confirm</button><button class="btn ghost" data-cancel>Cancel</button></div></div></div>` }).join("");
  $("out").innerHTML = `<div class="box"><div class="qhead"><div><h2 style="margin:0">Reference ${safe(d.ref)}</h2><small class="meta">Submitted ${safe(V.fdate(d.created_at))} · ${safe(d.customer.name)}</small></div></div><div class="steps">${steps}</div>
  <details><summary><b>${(d.items || []).length} item(s) requested</b></summary><ul class="items">${items}</ul></details></div>
  <div class="box"><h2 style="margin-top:0">Quotations</h2>${qhtml || "<p class='meta'>Our team is preparing your quotation. We will contact you on " + safe(d.customer.phone) + ". Check back here any time.</p>"}</div>
  <p class="meta">Questions? <a href="https://wa.me/917597577129?text=${encodeURIComponent("Hello Vectra Enterprises, regarding enquiry " + d.ref)}" target="_blank" rel="noopener"><u>WhatsApp us</u></a> or call +91 75975 77129.</p>`;
  $("out").querySelectorAll("[data-pdf]").forEach(b => b.onclick = () => { const q = qs.find(x => x.id === b.dataset.pdf); V.printHtml(V.printableQuote(q, d.customer, d.company), q.quote_number) });
  $("out").querySelectorAll(".qcard").forEach(card => {
    const q = qs.find(x => x.id === card.dataset.q), box = card.querySelector(".respond"); let act = "";
    card.querySelectorAll("[data-act]").forEach(b => b.onclick = () => { act = b.dataset.act; box.hidden = false; box.querySelector("[data-send]").textContent = { accept: "Confirm acceptance", reject: "Confirm decline", revise: "Send revision request" }[act] });
    const c = card.querySelector("[data-cancel]"); if (c) c.onclick = () => box.hidden = true;
    const s = card.querySelector("[data-send]"); if (s) s.onclick = async () => {
      s.disabled = true; const { error } = await db.rpc("respond_to_quotation", { p_ref: cred.ref, p_phone: cred.phone, p_quote: q.id, p_action: act, p_message: box.querySelector("textarea").value });
      s.disabled = false; if (error) return toast(error.message.replace(/^.*?:\s*/, "")); toast("Thank you — our team has been notified."); lookup(cred.ref, cred.phone, true);
    };
  });
}
$("tf").onsubmit = e => { e.preventDefault(); lookup($("ref").value.trim(), $("ph").value.trim()) };
const rec = load(), u = new URLSearchParams(location.search);
if (rec.length) { $("recent").innerHTML = "<small class='meta'>Your recent enquiries:</small><br>" + rec.map((x, i) => `<button type="button" class="btn ghost" data-i="${i}">${safe(x.ref)} · ${safe(x.name || "")}</button>`).join(""); $("recent").querySelectorAll("[data-i]").forEach(b => b.onclick = () => { const x = rec[b.dataset.i]; $("ref").value = x.ref; $("ph").value = x.phone; lookup(x.ref, x.phone) }) }
const r0 = (u.get("ref") || "").toUpperCase(); if (r0) { $("ref").value = r0; const m = rec.find(x => x.ref === r0); if (m) { $("ph").value = m.phone; lookup(m.ref, m.phone) } else $("ph").focus() }
else if (rec.length === 1) { $("ref").value = rec[0].ref; $("ph").value = rec[0].phone }
})();
