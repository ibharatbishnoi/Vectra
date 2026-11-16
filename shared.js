"use strict";
/* Shared by the public site, the tracking page and the admin panel. */
window.Vectra = (() => {
  const cfg = window.VECTRA_SUPABASE_CONFIG || {};
  const configured = !!(cfg.url && cfg.anonKey && !/YOUR_/.test(cfg.url + cfg.anonKey));
  const db = configured && window.supabase ? window.supabase.createClient(cfg.url, cfg.anonKey) : null;

  const safe = v => String(v ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const inr = p => (p / 100).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const fdate = d => { if (!d) return "—"; const x = new Date(d.length === 10 ? d + "T00:00:00" : d); return isNaN(x) ? "—" : x.toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" }); };
  const phoneKey = s => String(s || "").replace(/\D/g, "").slice(-10);
  const refOf = id => String(id).slice(0, 8).toUpperCase();

  const DEFAULT_COMPANY = {
    name: "VECTRA ENTERPRISES", tagline: "INDUSTRIAL • ENERGY • MRO",
    address: "First Floor, Shop No. 135 Wing, Opp. Kataria Show Room, Makarpura, Vadodara, Gujarat – 390014",
    phone: "+91 75975 77129", email: "vectra2029@yahoo.com", gstin: "24ABCFV2730P1ZX", state_code: "24",
    logo: "", validity_days: 15,
    terms: "Prices are exclusive of GST unless stated. GST will be charged at applicable rates. Goods once sold will not be taken back.",
    payment_terms: "As mutually agreed", delivery_terms: "Ex-Vadodara. Freight and transit insurance as mentioned.",
    bank: "", signatory: "Authorised Signatory"
  };

  /* ---------- Indian number to words ---------- */
  function words(n) {
    const o = "One Two Three Four Five Six Seven Eight Nine Ten Eleven Twelve Thirteen Fourteen Fifteen Sixteen Seventeen Eighteen Nineteen".split(" "),
      t = "Twenty Thirty Forty Fifty Sixty Seventy Eighty Ninety".split(" ");
    const w = n => n < 20 ? o[n - 1] || "" : n < 100 ? t[Math.floor(n / 10) - 2] + (n % 10 ? " " + o[n % 10 - 1] : "") : o[Math.floor(n / 100) - 1] + " Hundred" + (n % 100 ? " " + w(n % 100) : "");
    let r = Math.floor(n), s = "";
    [[1e7, "Crore"], [1e5, "Lakh"], [1e3, "Thousand"]].forEach(([d, l]) => { if (r >= d) { s += w(Math.floor(r / d)) + " " + l + " "; r %= d } });
    if (r) s += w(r);
    return s.trim() || "Zero";
  }
  const inWords = p => "Rupees " + words(Math.floor(p / 100)) + (p % 100 ? " and " + words(p % 100) + " Paise" : "") + " Only";

  /* ---------- quotation maths (integer paise, so totals always add up) ---------- */
  function calcLine(x) {
    const base = Math.round((+x.quantity || 0) * (+x.rate || 0) * 100);
    const disc = Math.round(base * (+x.disc || 0) / 100);
    const b = base - disc, t = Math.round(b * (+x.gst_rate || 0) / 100);
    return { base, disc, b, t, s: b + t };
  }
  const calcCharge = c => { const b = Math.round((+c.amount || 0) * 100), t = Math.round(b * (+c.gst_rate || 0) / 100); return { b, t, s: b + t } };
  function calcQuote(items, charges) {
    let b = 0, t = 0, disc = 0;
    (items || []).forEach(x => { const l = calcLine(x); b += l.b; t += l.t; disc += l.disc });
    (charges || []).forEach(c => { const l = calcCharge(c); b += l.b; t += l.t });
    const e = b + t, g = Math.round(e / 100) * 100;
    return { b, t, g, ro: g - e, disc };
  }
  const signed = p => (p < 0 ? "− " : "+ ") + "₹ " + inr(Math.abs(p));

  /* GSTIN state code -> intra (same state as company) or inter */
  const gstTreatment = (gstin, company) => {
    const sc = (gstin || "").slice(0, 2);
    return !/^\d{2}$/.test(sc) || sc === (company || DEFAULT_COMPANY).state_code ? "intra" : "inter";
  };

  /* ---------- images ---------- */
  const imgUrl = f => !f ? "" : /^(https?:)?\/\//.test(f) || f.startsWith("/") || f.startsWith("data:") ? f : "/product/" + f;

  /* ---------- print / save as PDF ---------- */
  function printHtml(html, title) {
    let a = document.getElementById("printArea");
    if (!a) {
      a = document.createElement("div"); a.id = "printArea"; document.body.appendChild(a);
      const s = document.createElement("style");
      s.textContent = "#printArea{display:none}@media print{body>*:not(#printArea){display:none!important}#printArea{display:block!important;background:#fff}@page{margin:12mm}}";
      document.head.appendChild(s);
    }
    a.innerHTML = html;
    const old = document.title; document.title = (title || "Quotation").replace(/[\\/]/g, "-");
    window.print(); document.title = old;
  }

  /* ---------- the printable quotation (admin + customer tracking page) ---------- */
  function printableQuote(q, cust, company) {
    const co = { ...DEFAULT_COMPANY, ...(company || {}) }, items = q.items || [], charges = q.charges || [];
    const T = calcQuote(items, charges), intra = q.gst_treatment === "intra", hasDisc = items.some(x => +x.disc > 0);
    const R = "text-align:right;white-space:nowrap";
    const rows = items.map((x, i) => {
      const l = calcLine(x), spec = [x.size && "Size: " + x.size, x.make && "Make: " + x.make].filter(Boolean).join(" | ");
      return `<tr><td>${i + 1}</td><td><b>${safe(x.name)}</b>${spec ? `<br><small>${safe(spec)}</small>` : ""}${x.note ? `<br><small>${safe(x.note)}</small>` : ""}</td>
      <td>${safe(x.hsn || "—")}</td><td>${safe(x.quantity)} ${safe(x.unit || "")}</td><td style="${R}">${inr(Math.round(x.rate * 100))}</td>${hasDisc ? `<td style="${R}">${+x.disc ? x.disc + "%" : "—"}</td>` : ""}
      <td>${x.gst_rate}%</td><td style="${R}">${inr(l.b)}</td><td style="${R}">${inr(l.s)}</td></tr>`;
    }).join("");
    const crow = charges.filter(c => +c.amount).map(c => { const l = calcCharge(c); return `<tr><td></td><td colspan="${hasDisc ? 6 : 5}"><i>${safe(c.label || "Charges")}</i></td><td style="${R}">${l.b < 0 ? "− " : ""}${inr(Math.abs(l.b))}</td><td style="${R}">${l.b < 0 ? "− " : ""}${inr(Math.abs(l.s))}</td></tr>` }).join("");
    const half = Math.round(T.t / 2);
    const taxRows = intra ? `<div><span>CGST</span><span>₹ ${inr(half)}</span></div><div><span>SGST</span><span>₹ ${inr(T.t - half)}</span></div>` : `<div><span>IGST</span><span>₹ ${inr(T.t)}</span></div>`;
    const colspan = hasDisc ? 9 : 8;
    return `<div style="font:13px/1.45 Arial,Helvetica,sans-serif;color:#182230">
<style>#printArea table.qt{width:100%;border-collapse:collapse;margin-top:14px}#printArea .qt th,#printArea .qt td{border:1px solid #cfd6de;padding:6px 7px;text-align:left;vertical-align:top}#printArea .qt th{background:#f1f4f7;font-size:12px}#printArea .sum div{display:flex;justify-content:space-between;padding:2px 0}</style>
<div style="display:flex;justify-content:space-between;gap:20px;border-bottom:3px solid #a51d32;padding-bottom:12px">
  <div style="display:flex;gap:12px;align-items:center">${co.logo ? `<img src="${safe(co.logo)}" alt="" style="max-height:62px;max-width:130px;object-fit:contain">` : ""}<div>
  <h1 style="margin:0;font-size:22px">${safe(co.name)}</h1><b style="font-size:11px;letter-spacing:.1em">${safe(co.tagline)}</b>
  <div style="margin-top:5px;font-size:12px">${safe(co.address)}<br>${safe(co.phone)} · ${safe(co.email)}<br>GSTIN: ${safe(co.gstin)}</div></div></div>
  <div style="text-align:right"><h2 style="margin:0;font-size:20px">QUOTATION</h2><b>${safe(q.quote_number || "DRAFT")}</b>
  <div style="margin-top:6px;font-size:12px">Date: ${safe(fdate(q.quote_date))}<br>Valid until: ${safe(fdate(q.valid_until))}${q.place_of_supply ? `<br>Place of supply: ${safe(q.place_of_supply)}` : ""}</div></div></div>
<div style="display:flex;gap:24px;margin-top:12px;font-size:12px"><div style="flex:1"><b>Bill to</b><br>${safe(q.bill_to || cust.customer_name || cust.name).replace(/\n/g, "<br>")}<br>${safe(cust.customer_phone || cust.phone || "")}${cust.customer_gstin || cust.gstin ? `<br>GSTIN: ${safe(cust.customer_gstin || cust.gstin)}` : ""}</div>
${q.ship_to ? `<div style="flex:1"><b>Ship to</b><br>${safe(q.ship_to).replace(/\n/g, "<br>")}</div>` : ""}</div>
<table class="qt"><thead><tr><th>#</th><th>Description</th><th>HSN/SAC</th><th>Qty</th><th>Rate ₹</th>${hasDisc ? "<th>Disc</th>" : ""}<th>GST</th><th>Taxable ₹</th><th>Amount ₹</th></tr></thead>
<tbody>${rows}${crow}</tbody><tfoot><tr><td colspan="${colspan}" style="border:0;padding:0"></td></tr></tfoot></table>
<div class="sum" style="margin:14px 0 0 auto;width:300px"><div><span>Taxable value</span><span>₹ ${inr(T.b)}</span></div>${taxRows}<div><span>Round off</span><span>${signed(T.ro)}</span></div>
<div style="font-size:16px;font-weight:700;border-top:2px solid #182230;margin-top:4px;padding-top:4px"><span>Grand total</span><span>₹ ${inr(T.g)}</span></div></div>
<p style="margin:10px 0"><b>Amount in words:</b> ${safe(inWords(T.g))}</p>
<div style="display:flex;gap:24px;font-size:12px"><div style="flex:1"><b>Terms &amp; conditions</b><div style="white-space:pre-wrap">${safe(q.terms)}</div>
${q.payment_terms ? `<p style="margin:6px 0 0"><b>Payment:</b> ${safe(q.payment_terms)}</p>` : ""}${q.delivery_terms ? `<p style="margin:3px 0 0"><b>Delivery:</b> ${safe(q.delivery_terms)}</p>` : ""}</div>
${co.bank ? `<div style="flex:1"><b>Bank details</b><div style="white-space:pre-wrap">${safe(co.bank)}</div></div>` : ""}</div>
<p style="margin-top:46px;text-align:right"><b>For ${safe(co.name)}</b><br><br><br>${safe(co.signatory || "Authorised Signatory")}</p>
<p style="text-align:center;font-size:11px;color:#667">This is a computer-generated quotation.</p></div>`;
  }

  return { db, configured, safe, inr, fdate, phoneKey, refOf, DEFAULT_COMPANY, words, inWords, calcLine, calcCharge, calcQuote, signed, gstTreatment, imgUrl, printHtml, printableQuote };
})();
