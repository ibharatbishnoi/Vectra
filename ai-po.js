"use strict";
/* Customer PO upload: reads PDF / photo / Excel / CSV / Word / text with AI (via /api/parse-po)
   and shows the lines in the existing review table, matched to the catalogue. */
(() => {
const $ = id => document.getElementById(id), B = window.VectraBulk;
if (!B || !$("poGo")) return;
const MAX_B64_BYTES = 3.1e6, MAX_READ = 10e6;
const ext = f => (f.name.split(".").pop() || "").toLowerCase();
const SHEET = ["xlsx", "xls", "xlsm", "xlsb", "ods"], PLAIN = ["csv", "tsv", "txt"], IMG = ["jpg", "jpeg", "png", "webp", "gif", "heic", "heif"];
const msg = (t, cls) => { const m = $("poMsg"); m.className = "msg" + (cls ? " " + cls : ""); m.textContent = t; return m };
const b64 = buf => { const a = new Uint8Array(buf); let s = ""; for (let i = 0; i < a.length; i += 0x8000) s += String.fromCharCode.apply(null, a.subarray(i, i + 0x8000)); return btoa(s) };
const load = (src, test) => new Promise((res, rej) => { if (test()) return res(); const s = document.createElement("script"); s.src = src; s.onload = res; s.onerror = () => rej(new Error("load")); document.head.appendChild(s) });

async function imagePayload(f) {
  let bmp; try { bmp = await createImageBitmap(f) } catch { throw new Error("This image format can't be read by your browser (for example HEIC). Please save it as JPG or PNG, or take a screenshot.") }
  const k = Math.min(1, 2000 / Math.max(bmp.width, bmp.height)), c = document.createElement("canvas"); c.width = Math.round(bmp.width * k); c.height = Math.round(bmp.height * k);
  const g = c.getContext("2d"); g.fillStyle = "#fff"; g.fillRect(0, 0, c.width, c.height); g.drawImage(bmp, 0, 0, c.width, c.height);
  for (const q of [0.85, 0.7, 0.55]) { const blob = await new Promise(r => c.toBlob(r, "image/jpeg", q)); if (blob && blob.size * 1.34 <= MAX_B64_BYTES) return { blob, data: b64(await blob.arrayBuffer()) } }
  throw new Error("This photo is too large to read. Please take a closer, smaller photo of the item list.");
}
async function sheetText(f) {
  await B.loadXlsx(); const wb = XLSX.read(await f.arrayBuffer(), { type: "array" });
  return wb.SheetNames.slice(0, 6).map(n => `### Sheet: ${n}\n` + XLSX.utils.sheet_to_csv(wb.Sheets[n], { blankrows: false }).split("\n").slice(0, 600).join("\n")).join("\n\n");
}
async function docxText(f) {
  await load("https://cdnjs.cloudflare.com/ajax/libs/mammoth/1.4.21/mammoth.browser.min.js", () => window.mammoth);
  const html = (await mammoth.convertToHtml({ arrayBuffer: await f.arrayBuffer() })).value, doc = new DOMParser().parseFromString(html, "text/html"), out = [];
  doc.body.childNodes.forEach(n => {
    if (n.nodeName === "TABLE") n.querySelectorAll("tr").forEach(tr => out.push([...tr.children].map(c => c.textContent.trim().replace(/\s+/g, " ")).join(" | ")));
    else if (n.textContent.trim()) out.push(n.textContent.trim());
  });
  return out.join("\n");
}
async function prepare(f) {
  const e = ext(f);
  if (f.size > MAX_READ) throw new Error("That file is over 10 MB. Please upload a smaller file.");
  if (e === "pdf") { if (f.size * 1.34 > MAX_B64_BYTES) throw new Error("This PDF is too large for automatic reading (about 3 MB maximum). Try Excel, a smaller PDF, or attach it to your request."); return { body: { kind: "pdf", data: b64(await f.arrayBuffer()) }, attach: f } }
  if (IMG.includes(e) || /^image\//.test(f.type)) { const im = await imagePayload(f); return { body: { kind: "image", mime: "image/jpeg", data: im.data }, attach: new File([im.blob], f.name.replace(/\.\w+$/, "") + ".jpg", { type: "image/jpeg" }) } }
  if (PLAIN.includes(e)) return { body: { kind: "text", data: await f.text() }, attach: f };
  if (SHEET.includes(e)) { try { return { body: { kind: "text", data: await sheetText(f) }, attach: ["xlsx", "xls"].includes(e) ? f : null } } catch (er) { throw new Error("Could not open that spreadsheet. Save it as .xlsx or CSV and try again.") } }
  if (e === "docx") { try { return { body: { kind: "text", data: await docxText(f) }, attach: f } } catch { throw new Error("Could not read that Word file. Save it as PDF or .docx and try again.") } }
  if (["doc", "rtf", "odt", "pages"].includes(e)) throw new Error("Please save this file as PDF or .docx (Word) and upload again.");
  throw new Error("This file type is not supported. Use PDF, photo, Excel, CSV, Word or text.");
}

let busy = false;
async function run(f) {
  if (busy) return; busy = true; const go = $("poGo"); go.disabled = true;
  const m = msg(""); const sp = document.createElement("span"); sp.className = "spin"; m.append(sp, "Reading your PO… this can take up to a minute for long documents.");
  let prepared = null;
  try {
    prepared = await prepare(f);
    const ctl = new AbortController(), t = setTimeout(() => ctl.abort(), 65000);
    let r; try { r = await fetch("/api/parse-po", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...prepared.body, filename: f.name }), signal: ctl.signal }) } finally { clearTimeout(t) }
    let j = {}; try { j = await r.json() } catch { }
    if (!r.ok || !j.ok) throw new Error(j.error || (r.status === 404 ? "Automatic PO reading is not set up yet." : "Could not read that file. Please try again."));
    if (j.isPO === false || !j.items.length) throw new Error("We could not find any products in that file. Try a clearer copy, or use the simple list below.");
    if (prepared.attach) B.attach(prepared.attach);
    window.vtrack && window.vtrack("po_ai_read", { items: j.items.length, kind: prepared.body.kind });
    msg(""); $("poFile").value = "";
    B.show(j.items.map(x => ({ name: x.name, qty: x.qty, size: x.size, make: x.make, note: [x.note, x.unit && !/^(nos?\.?|pcs?\.?|each|ea|units?)$/i.test(x.unit) ? "Unit: " + x.unit : "", x.hsn ? "HSN " + x.hsn : ""].filter(Boolean).join(" · "), catalogueId: x.catalogueId, confidence: x.confidence })), { ...j.po, warnings: j.warnings });
  } catch (e) {
    const m2 = msg(e.name === "AbortError" ? "Reading took too long. Please try a smaller file." : e.message || "Could not read that file.", "err");
    if (prepared && prepared.attach || ["pdf", "docx", "xlsx", "xls", "csv", "txt", "jpg", "jpeg", "png", "webp"].includes(ext(f))) {
      const b = document.createElement("button"); b.type = "button"; b.className = "linkbtn"; b.textContent = "Attach this file to my request instead";
      b.onclick = async () => { const ok = await B.attach(prepared && prepared.attach || f); m2.className = "msg" + (ok ? " ok" : " err"); m2.textContent = ok ? "Attached. Close this window and submit your request, and we will read it manually." : "Could not attach that file." };
      m2.append(document.createElement("br"), b);
    }
  } finally { busy = false; go.disabled = false }
}
$("poGo").onclick = () => { const f = $("poFile").files[0]; if (!f) return msg("Choose your PO file first.", "err"); run(f) };
$("poFile").onchange = () => { msg("") };
const box = $("poBox");
["dragenter", "dragover"].forEach(ev => box.addEventListener(ev, e => { e.preventDefault(); box.classList.add("drag") }));
["dragleave", "drop"].forEach(ev => box.addEventListener(ev, e => { e.preventDefault(); box.classList.remove("drag") }));
box.addEventListener("drop", e => { const f = e.dataTransfer && e.dataTransfer.files[0]; if (f) { try { const dt = new DataTransfer(); dt.items.add(f); $("poFile").files = dt.files } catch { } run(f) } });
})();
