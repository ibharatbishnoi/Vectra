"use strict";
(()=>{
const $=id=>document.getElementById(id),PAGE=24,KEY="vectra_cart_v2",CKEY="vectra_contact_v2";
const cfg=window.VECTRA_SUPABASE_CONFIG||{};
const ok=cfg.url&&cfg.anonKey&&!/YOUR_/.test(cfg.url+cfg.anonKey);
const db=ok&&window.supabase?window.supabase.createClient(cfg.url,cfg.anonKey):null;
let P=[],cats=[],cat="All",q="",shown=PAGE,cart=load(KEY,[]);
function load(k,d){try{return JSON.parse(localStorage.getItem(k))||d}catch{return d}}
function save(k,v){try{localStorage.setItem(k,JSON.stringify(v))}catch{}}
const toast=t=>{const e=$("toast");e.textContent=t;e.classList.add("on");clearTimeout(toast.t);toast.t=setTimeout(()=>e.classList.remove("on"),1800)};
const el=(t,c,x)=>{const e=document.createElement(t);if(c)e.className=c;if(x!=null)e.textContent=x;return e};
const img=p=>"product/"+p.i;
const F=[["size","Size / specification","e.g. 4 inch, 1.5 HP, 25 mm"],["make","Make / brand","e.g. Bosch, Kirloskar"],["note","Other info","Any extra detail"]];
function fields(o,on){const w=el("div","dfields");F.forEach(([k,l,ph])=>{const lb=el("label","dl",l),i=el("input");i.maxLength=k==="note"?200:60;i.placeholder=ph;i.value=o[k]||"";i.oninput=()=>{o[k]=i.value;on&&on()};lb.appendChild(i);w.appendChild(lb)});return w}
const spec=x=>[x.size&&"Size: "+x.size,x.make&&"Make: "+x.make,x.note].filter(Boolean).join(", ");

fetch("products.json").then(r=>r.json()).then(async d=>{P=d.products;cats=d.categories;if(db){try{const live=await db.from("products").select("id,name,category,image,description,brand,model,specifications").eq("active",true).order("id");if(!live.error&&live.data&&live.data.length){P=live.data.map(x=>({id:x.id,n:x.name,c:x.category,i:x.image||"",description:x.description||"",brand:x.brand||"",model:x.model||"",specifications:x.specifications||{}}));cats=[...new Set(P.map(x=>x.c))].sort()}}catch(e){console.warn("Using bundled catalogue fallback",e)}}$("nProd").textContent=P.length;$("nCat").textContent=cats.length;chips();render();drawCart()})
.catch(()=>{$("count").textContent="Could not load the catalogue. Please refresh or contact us on WhatsApp."});
$("year").textContent=new Date().getFullYear();

function chips(){const f=$("filters");f.innerHTML="";["All",...cats].forEach(c=>{const b=el("button","chip",c);b.type="button";b.setAttribute("aria-pressed",c===cat);b.onclick=()=>{cat=c;shown=PAGE;chips();render()};f.appendChild(b)})}
function render(){
 const words=q.toLowerCase().split(/\s+/).filter(Boolean);
 const r=P.filter(p=>(cat==="All"||p.c===cat)&&words.every(w=>(p.n+" "+p.c).toLowerCase().includes(w)));
 $("count").textContent=r.length?`Showing ${Math.min(shown,r.length)} of ${r.length} products`:"";
 const g=$("grid");g.innerHTML="";
 if(!r.length){const e=el("div","empty","No products match. You can add it to your list manually and we will quote it. "),b=el("button","btn ghost",q?`Add “${q}” manually`:"Add a custom item");b.type="button";b.onclick=()=>openCustom(q);e.appendChild(b);g.appendChild(e);$("more").hidden=true;return}
 const fr=document.createDocumentFragment();
 r.slice(0,shown).forEach(p=>{
  const c=el("article","card"),ph=el("div","photo"),im=new Image();im.src=img(p);im.alt=p.n;im.loading="lazy";im.width=240;im.height=212;ph.appendChild(im);
  const d={size:"",make:"",note:""},dt=el("details","moredet");dt.append(el("summary","","+ Add size / make / notes (optional)"),fields(d));
  const b=el("div","cb"),a=el("div","act"),qt=el("input","qty");qt.type="number";qt.min=1;qt.max=9999;qt.value=1;qt.setAttribute("aria-label","Quantity for "+p.n);
  const ad=el("button","add","Add to list");ad.type="button";
  ad.onclick=()=>{add(p.id,Math.min(9999,Math.max(1,parseInt(qt.value,10)||1)),d);d.size=d.make=d.note="";dt.querySelectorAll("input").forEach(i=>i.value="");dt.open=false;ad.textContent="Added ✓";ad.classList.add("done");setTimeout(()=>{ad.textContent="Add to list";ad.classList.remove("done")},1200)};
  a.append(qt,ad);b.append(el("div","cat",p.c),el("h3","",p.n));if(p.brand||p.model)b.append(el("div","meta",[p.brand,p.model].filter(Boolean).join(" · ")));if(p.description)b.append(el("p","pdesc",p.description));b.append(dt,a);c.append(ph,b);fr.appendChild(c)});
 g.appendChild(fr);$("more").hidden=r.length<=shown;
}
let t;$("search").addEventListener("input",e=>{clearTimeout(t);t=setTimeout(()=>{q=e.target.value.trim();shown=PAGE;render()},150)});
$("more").onclick=()=>{shown+=PAGE;render()};

function add(id,n,d={}){if(cart.length>=60)return toast("List is full (60 items max)");const nd={size:(d.size||"").trim(),make:(d.make||"").trim(),note:(d.note||"").trim()},k=x=>[x.size,x.make,x.note].map(s=>(s||"").trim().toLowerCase()).join("|");
 const x=cart.find(i=>i.id===id&&k(i)===k(nd));x?x.q=Math.min(9999,x.q+n):cart.push({id,q:n,...nd});persist();toast("Added to quotation list")}
const PH="data:image/svg+xml,"+encodeURIComponent("<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 46 46'><rect width='46' height='46' fill='#eef1f5'/><text x='23' y='31' font-size='22' text-anchor='middle'>✎</text></svg>");
function importBulk(file){if(!file)return;if(!window.XLSX)return toast("Spreadsheet reader could not load. Please try CSV.");const reader=new FileReader();reader.onload=()=>{try{const wb=XLSX.read(reader.result,{type:"array"}),rows=XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]],{defval:""});let count=0;rows.slice(0,100).forEach(r=>{const norm={};Object.keys(r).forEach(k=>norm[k.toLowerCase().trim()]=r[k]);const name=String(norm.product||norm.name||norm["product name"]||norm.item||"").trim();if(!name)return;const found=P.find(p=>p.n.toLowerCase()===name.toLowerCase());const q=Math.max(1,Math.min(9999,parseInt(norm.quantity||norm.qty||1,10)||1));if(cart.length>=60)return;cart.push(found?{id:found.id,q,size:String(norm.size||norm.specification||""),make:String(norm.make||norm.brand||""),note:String(norm.description||norm.note||"")}:{custom:true,name,q,size:String(norm.size||norm.specification||""),make:String(norm.make||norm.brand||""),note:String(norm.description||norm.note||"")});count++});persist();toast(count+" spreadsheet item(s) added")}catch(e){toast("Could not read spreadsheet. Check the first sheet and column names.")}};reader.readAsArrayBuffer(file)}
$("bulkFile")?.addEventListener("change",e=>importBulk(e.target.files[0]));
function addCustom(){const n=$("cName").value.trim();if(!n){$("cName").focus();return toast("Enter the product name")}
 if(cart.length>=60)return toast("List is full (60 items max)");
 cart.push({custom:true,name:n,q:Math.min(9999,Math.max(1,parseInt($("cQty").value,10)||1)),size:$("cSize").value.trim(),make:$("cMake").value.trim(),note:$("cNote").value.trim()});
 ["cName","cSize","cMake","cNote"].forEach(id=>$(id).value="");$("cQty").value=1;persist();toast("Custom item added")}
function openCustom(name){open();$("custom").open=true;if(name)$("cName").value=name;$("cName").focus()}
function persist(){save(KEY,cart);const n=cart.length;$("badge").textContent=n;drawCart()}
function drawCart(){
 const L=$("lines");L.innerHTML="";
 const rows=cart.map(i=>({i,p:i.custom?{n:i.name,c:"Custom item",i:null}:P.find(p=>p.id===i.id)})).filter(r=>r.p);
 if(!rows.length){L.appendChild(el("p","meta","Your list is empty. Add products from the catalogue."));return}
 rows.forEach(({i,p})=>{
  const d=el("div","line"),im=new Image();im.src=p.i?img(p):PH;im.alt="";
  const q=el("input","qty");q.type="number";q.min=1;q.max=9999;q.value=i.q;q.setAttribute("aria-label","Quantity for "+p.n);
  q.onchange=()=>{i.q=Math.min(9999,Math.max(1,parseInt(q.value,10)||1));save(KEY,cart)};
  const x=el("button","x","×");x.type="button";x.setAttribute("aria-label","Remove "+p.n);x.onclick=()=>{cart=cart.filter(c=>c!==i);persist()};
  d.append(im,el("span","",i.custom?p.n+" (custom)":p.n),q,x);
  const dt=el("details","moredet");dt.open=!!(i.size||i.make||i.note);dt.append(el("summary","","Size / make / notes (optional)"),fields(i,()=>save(KEY,cart)));
  const w=el("div","litem");w.append(d,dt);L.appendChild(w)});
}
persist();

/* drawer */
const dr=$("drawer"),sc=$("scrim");let last;
function open(){last=document.activeElement;dr.classList.add("on");sc.classList.add("on");dr.setAttribute("aria-hidden","false");const c=load(CKEY,{});$("fName").value=$("fName").value||c.n||"";$("fPhone").value=$("fPhone").value||c.p||"";$("fEmail").value=$("fEmail").value||c.e||"";$("fGst").value=$("fGst").value||c.g||"";$("closeCart").focus();drawCart()}
function close(){dr.classList.remove("on");sc.classList.remove("on");dr.setAttribute("aria-hidden","true");last&&last.focus()}
$("openCart").onclick=open;$("cAdd").onclick=addCustom;$("openCustom").onclick=()=>openCustom();$("cName").addEventListener("keydown",e=>{if(e.key==="Enter"){e.preventDefault();addCustom()}});$("closeCart").onclick=close;sc.onclick=close;
document.addEventListener("keydown",e=>{if(e.key==="Escape"&&dr.classList.contains("on"))close()});
$("burger").onclick=()=>{const n=$("nav").classList.toggle("on");$("burger").setAttribute("aria-expanded",n)};
$("nav").addEventListener("click",e=>{if(e.target.tagName==="A")$("nav").classList.remove("on")});
$("clear").onclick=()=>{cart=[];persist();msg("")};

const msg=(t,err)=>{const m=$("msg");m.textContent=t;m.className="msg"+(err?" err":"")};
const bad=(id,on)=>$(id).setAttribute("aria-invalid",on);
$("submit").onclick=async()=>{
 const name=$("fName").value.trim(),phone=$("fPhone").value.replace(/[\s\-()]/g,""),email=$("fEmail").value.trim(),gst=$("fGst").value.trim().toUpperCase(),notes=$("fNotes").value.trim();
 const e={fName:!name,fPhone:!/^(\+91|0)?[6-9]\d{9}$/.test(phone),fEmail:!!email&&!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email),fGst:!!gst&&!/^\d{2}[A-Z]{5}\d{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/.test(gst)};
 Object.keys(e).forEach(k=>bad(k,e[k]));
 if(!cart.length)return msg("Please add at least one product.",1);
 if(e.fName)return msg("Please enter your name or company.",1);
 if(e.fPhone)return msg("Enter a valid 10-digit Indian mobile number.",1);
 if(e.fEmail)return msg("That email address looks invalid.",1);
 if(e.fGst)return msg("GSTIN should be 15 characters, e.g. 24ABCDE1234F1Z5 — or leave it blank.",1);
 if($("fWeb").value)return;                       // honeypot: bots fill this
 if(Date.now()-(+localStorage.getItem("vectra_last")||0)<30000)return msg("Please wait a few seconds before sending another request.",1);
 const items=cart.map(i=>{const p=i.custom?{n:i.name,c:"Custom (not in catalogue)"}:P.find(p=>p.id===i.id);return p&&{name:p.n,category:p.c,quantity:i.q,size:(i.size||"").trim(),make:(i.make||"").trim(),note:(i.note||"").trim()}}).filter(Boolean);
 const summary=items.map((x,n)=>`${n+1}. ${x.name} × ${x.quantity}${spec(x)?" ("+spec(x)+")":""}`).join("\n");
 save(CKEY,{n:name,p:phone,e:email,g:gst});
 const wa=ref=>"https://wa.me/917597577129?text="+encodeURIComponent(`Hello Vectra Enterprises, I have submitted a quotation request${ref?` (Ref ${ref})`:""}.\nName: ${name}\nPhone: ${phone}\n\n${summary}`);
 if(!db){msg("");$("msg").innerHTML="";const b=el("a","btn wa","Send this list on WhatsApp instead");b.href=wa();b.target="_blank";b.rel="noopener";$("msg").append("Online submission is not available right now. ",b);return}
 const btn=$("submit");btn.disabled=true;btn.textContent="Submitting…";
 const id=crypto.randomUUID();
 const {error}=await db.from("quotation_requests").insert({id,customer_name:name,customer_phone:phone,customer_email:email||null,customer_gstin:gst||null,customer_notes:notes||null,items,status:"pending"});
 btn.disabled=false;btn.textContent="Submit request";
 if(error){msg("Could not submit online. Please try again, or send it on WhatsApp.",1);console.error(error);return}
 localStorage.setItem("vectra_last",Date.now());
 const ref=id.slice(0,8).toUpperCase();cart=[];persist();$("fNotes").value="";msg("");
 const box=el("div","ok-box");box.append(el("strong","","Request received ✓"),el("p","","Reference: "+ref+". Our team will contact you on "+phone+"."));
 const b=el("a","btn wa","Also notify us on WhatsApp");b.href=wa(ref);b.target="_blank";b.rel="noopener";box.appendChild(b);$("msg").appendChild(box);
};
})();
