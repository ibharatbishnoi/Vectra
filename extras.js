"use strict";
(()=>{
const $=id=>document.getElementById(id),V=()=>window.Vectra,WA="917597577129";
const el=(t,c,x)=>{const e=document.createElement(t);if(c)e.className=c;if(x!=null)e.textContent=x;return e};
const clamp=n=>Math.min(9999,Math.max(1,parseInt(n,10)||1));

/* ---------- homepage: category cards + recently added ---------- */
function home(){
 const v=V(),box=$("catcards");if(!box)return;box.innerHTML="";
 v.cats.forEach(c=>{const p=v.P.find(x=>x.c===c&&x.i),n=v.P.filter(x=>x.c===c).length;
  const b=el("button","catcard");b.type="button";
  if(p){const i=new Image();i.src=v.img(p);i.alt="";i.loading="lazy";b.appendChild(i)}
  b.append(el("strong","",c),el("small","",n+" products"));b.onclick=()=>v.setCat(c);box.appendChild(b)});
 const row=$("recentRow");row.innerHTML="";const r=[...v.P].sort((a,b)=>b.id-a.id).slice(0,8);
 r.forEach(p=>row.appendChild(mini(p)));$("recent").hidden=!r.length;
 openHash();
}
function mini(p){const v=V(),c=el("button","mini");c.type="button";const i=new Image();i.src=v.img(p);i.alt=p.n;i.loading="lazy";c.append(i,el("span","",p.n));c.onclick=()=>openProduct(p.id);return c}

/* ---------- product detail modal ---------- */
let curP=null;
function openProduct(id,push=true){
 const v=V(),p=v.P.find(x=>x.id==id);if(!p)return;curP=p;
 $("pmImg").src=v.img(p);$("pmImg").alt=p.n;$("pmCat").textContent=p.c;$("pmName").textContent=p.n;
 $("pmBrand").textContent=p.b?"Brand: "+p.b:"";
 $("pmDesc").textContent=p.d||"Share your size, make and quantity and we will send an item-wise GST quotation.";
 const t=$("pmSpec");t.innerHTML="";(p.s||[]).forEach(s=>{const r=t.insertRow();r.insertCell().textContent=s.k||"";r.insertCell().textContent=s.v||""});
 ["pmSize","pmMake","pmNote"].forEach(i=>$(i).value="");$("pmQty").value=1;
 $("pmWa").href="https://wa.me/"+WA+"?text="+encodeURIComponent("Hello Vectra Enterprises, I am interested in: "+p.n);
 const rel=$("pmRel");rel.innerHTML="";v.P.filter(x=>x.c===p.c&&x.id!==p.id).slice(0,4).forEach(x=>rel.appendChild(mini(x)));
 $("pm").hidden=$("pmScrim").hidden=false;document.body.style.overflow="hidden";$("pmClose").focus();$("pm").scrollTop=0;
 if(push)try{history.replaceState(null,"","#p-"+p.id)}catch{}
}
function closeProduct(){$("pm").hidden=$("pmScrim").hidden=true;document.body.style.overflow="";if(/^#p-/.test(location.hash))try{history.replaceState(null,"",location.pathname)}catch{}}
function openHash(){const m=/^#p-(\d+)$/.exec(location.hash);if(m)openProduct(m[1],false)}
$("pmClose").onclick=$("pmScrim").onclick=closeProduct;
document.addEventListener("keydown",e=>{if(e.key==="Escape"&&!$("pm").hidden)closeProduct()});
$("pmAdd").onclick=()=>{if(!curP)return;V().add(curP.id,clamp($("pmQty").value),{size:$("pmSize").value,make:$("pmMake").value,note:$("pmNote").value});closeProduct();V().openCart()};
$("grid").addEventListener("click",e=>{const d=e.target.closest("[data-det]"),c=e.target.closest(".photo,h3");
 if(d)openProduct(d.dataset.det);else if(c){const a=c.closest(".card");if(a)openProduct(a.dataset.id)}});

/* ---------- bulk enquiry ---------- */
let parsed=[];
const norm=s=>String(s||"").toLowerCase().replace(/[^a-z0-9 ]+/g," ").replace(/\s+/g," ").trim();
function best(name){
 const w=norm(name).split(" ").filter(x=>x.length>1);if(!w.length)return null;let top=null,sc=0;
 V().P.forEach(p=>{const h=" "+norm(p.n+" "+(p.b||""))+" ";let m=0;w.forEach(x=>{if(h.includes(" "+x+" ")||h.includes(" "+x))m++});
  const s=m/w.length-(Math.abs(norm(p.n).split(" ").length-w.length)*0.02);if(s>sc){sc=s;top=p}});
 return sc>=0.67?top:null}
function parseRow(cells){
 cells=cells.map(c=>String(c??"").trim());if(!cells[0])return null;let name=cells[0],qty=1,size=cells[2]||"",make=cells[3]||"";
 if(cells.length>1&&/^\d+(\.\d+)?$/.test(cells[1]))qty=clamp(cells[1]);
 else if(cells.length===1){const m=/^(.*?)(?:\s*[x×*]\s*|\s+qty:?\s*|\s+)(\d{1,4})$/i.exec(name);if(m){name=m[1].trim();qty=clamp(m[2])}}
 if(/^(product|item|description|name)$/i.test(name))return null;
 return{name,qty,size,make}}
function parseText(t){return t.split(/\r?\n/).map(l=>l.trim()).filter(Boolean).map(l=>parseRow(l.includes("\t")?l.split("\t"):l.split(/\s*[,;]\s*/))).filter(Boolean)}
function showMatches(){
 const out=$("bOut");out.innerHTML="";if(!parsed.length){out.textContent="No items found. Put one product per line.";return}
 parsed.forEach(r=>{r.p=best(r.name)});
 const t=el("table","btable");const hd=t.createTHead().insertRow();["Your item","Qty","Matched to"].forEach(h=>hd.appendChild(el("th","",h)));
 parsed.slice(0,60).forEach(r=>{const x=t.insertRow();x.insertCell().textContent=r.name+(r.size?" ("+r.size+")":"");x.insertCell().textContent=r.qty;const c=x.insertCell();c.textContent=r.p?"✓ "+r.p.n:"Custom item";c.className=r.p?"okm":"cust"});
 out.append(el("p","meta",parsed.filter(r=>r.p).length+" matched · "+parsed.filter(r=>!r.p).length+" will be added as custom items"+(parsed.length>60?" · only the first 60 are used":"")),t);
 const b=el("button","btn","Add all to quotation list");b.type="button";b.onclick=()=>{let n=0;parsed.slice(0,60).forEach(r=>{const d={size:r.size,make:r.make,note:""};
  if(r.p){V().add(r.p.id,r.qty,d);n++}else if(V().addRaw({custom:true,name:r.name.slice(0,120),q:r.qty,size:r.size.slice(0,60),make:r.make.slice(0,60),note:""}))n++});
  V().toast(n+" items added");V().openCart()};out.appendChild(b)}
$("bParse").onclick=()=>{parsed=parseText($("bText").value);showMatches()};
$("bFile").onchange=async e=>{const f=e.target.files[0];if(!f)return;
 try{if(/\.xlsx?$/i.test(f.name)){await loadXlsx();const wb=XLSX.read(await f.arrayBuffer(),{type:"array"}),rows=XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]],{header:1,blankrows:false});parsed=rows.map(parseRow).filter(Boolean)}
 else parsed=parseText(await f.text());showMatches()}catch(err){$("bOut").textContent="Could not read that file. Try CSV, or paste the list."}e.target.value=""};
function loadXlsx(){return window.XLSX?Promise.resolve():new Promise((ok,no)=>{const s=document.createElement("script");s.src="https://cdn.jsdelivr.net/npm/xlsx@0.18.5/dist/xlsx.full.min.js";s.onload=ok;s.onerror=no;document.head.appendChild(s)})}
$("bTpl").onclick=()=>{const a=document.createElement("a");a.href=URL.createObjectURL(new Blob(["Product,Quantity,Size,Make\nAngle grinder,5,4 inch,Bosch\nRotary hammer,2,,\n"],{type:"text/csv"}));a.download="vectra-bulk-enquiry-template.csv";a.click()};

/* ---------- quotation tracking ---------- */
const inr=n=>"₹ "+Number(n).toLocaleString("en-IN",{minimumFractionDigits:2,maximumFractionDigits:2});
const LABEL={pending:"Received – being reviewed",quoted:"Quotation sent",won:"Accepted",lost:"Declined",closed:"Closed"};
async function track(){
 const out=$("tOut"),db=V().db,ref=$("tRef").value.trim(),ph=$("tPhone").value.trim();out.innerHTML="";
 if(!db)return out.textContent="Tracking is not available right now. Please WhatsApp us.";
 if(ref.length<6||ph.replace(/\D/g,"").length<10)return out.textContent="Enter your reference and the 10-digit mobile number you used.";
 $("tGo").disabled=true;const{data,error}=await db.rpc("track_request",{p_ref:ref,p_phone:ph});$("tGo").disabled=false;
 if(error||!data)return out.textContent=error?"Could not check right now. Please try again.":"No request found for that reference and mobile number.";
 out.append(el("p","tstat",(LABEL[data.status]||data.status)+" · Ref "+data.ref),el("p","meta",data.item_count+" item(s) · requested "+new Date(data.created_at).toLocaleDateString("en-IN")));
 if(!data.quotations.length)out.append(el("p","","Our team is preparing your quotation. We will contact you shortly."));
 data.quotations.forEach(q=>{const d=el("div","tq");d.append(el("strong","",q.quote_number),el("span","pillq "+q.status,q.status),el("small","",inr(q.grand_total)+" incl. GST · "+q.quote_date+(q.valid_until?" · valid until "+q.valid_until:"")));
  if(q.status==="issued"){const row=el("div","trow2");[["accepted","Accept","btn"],["rejected","Decline","btn ghost"]].forEach(([dec,l,c])=>{const b=el("button",c,l);b.type="button";b.onclick=async()=>{if(!confirm(l+" quotation "+q.quote_number+"?"))return;const r=await db.rpc("respond_quotation",{p_ref:ref,p_phone:ph,p_quote:q.quote_number,p_decision:dec});V().toast(r.data?"Response recorded":"Could not record response");if(r.data)track()};row.appendChild(b)});d.appendChild(row)}
  out.appendChild(d)});
 out.append(el("p","meta","Need the PDF or a revised quotation? WhatsApp us with your reference."));
}
$("tGo").onclick=track;$("tPhone").onkeydown=e=>{if(e.key==="Enter")track()};
try{const s=JSON.parse(localStorage.getItem("vectra_ref")||"null");if(s){$("tRef").value=s.r;$("tPhone").value=s.p}}catch{}

window.addEventListener("vectra:ready",home);if(V()&&V().P.length)home();
window.addEventListener("hashchange",openHash);
})();
