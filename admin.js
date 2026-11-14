"use strict";
(()=>{
const $=id=>document.getElementById(id),cfg=window.VECTRA_SUPABASE_CONFIG||{};
const db=cfg.url&&!/YOUR_/.test(cfg.url+cfg.anonKey)&&window.supabase?window.supabase.createClient(cfg.url,cfg.anonKey):null;
const safe=v=>String(v??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const inr=p=>(p/100).toLocaleString("en-IN",{minimumFractionDigits:2,maximumFractionDigits:2});
const rupee=n=>"₹ "+Number(n||0).toLocaleString("en-IN",{maximumFractionDigits:0});
const msg=(id,t,e)=>{const m=$(id);m.textContent=t;m.className="msg"+(e?" err":"")};
const p10=s=>String(s||"").replace(/\D/g,"").slice(-10);
const today=()=>new Date().toISOString().slice(0,10);
const OPEN=["pending","quoted"];
let reqs=[],saved=[],prods=[],cur=null,items=[],editing=null,pedit=null;

/* ---------- money (integer paise) ---------- */
const line=x=>{const base=Math.round(x.quantity*x.rate*100),d=Math.round(base*(x.disc||0)/100),b=base-d,t=Math.round(b*x.gst_rate/100);return{b,t,s:b+t,d}};
const frt=()=>{const fb=Math.round((+$("fr").value||0)*100);return{b:fb,t:Math.round(fb*(+$("fg").value||0)/100)}};
function totals(){let b=0,t=0;items.forEach(x=>{const l=line(x);b+=l.b;t+=l.t});const f=frt();b+=f.b;t+=f.t;const e=b+t,g=Math.round(e/100)*100;return{b,t,g,ro:g-e,f}}
const rof=p=>(p<0?"− ":"+ ")+"₹ "+inr(Math.abs(p));
function words(n){const o="One Two Three Four Five Six Seven Eight Nine Ten Eleven Twelve Thirteen Fourteen Fifteen Sixteen Seventeen Eighteen Nineteen".split(" "),t="Twenty Thirty Forty Fifty Sixty Seventy Eighty Ninety".split(" ");
 const w=n=>n<20?o[n-1]||"":n<100?t[Math.floor(n/10)-2]+(n%10?" "+o[n%10-1]:""):o[Math.floor(n/100)-1]+" Hundred"+(n%100?" "+w(n%100):"");
 let r=Math.floor(n),s="";[[1e7,"Crore"],[1e5,"Lakh"],[1e3,"Thousand"]].forEach(([d,l])=>{if(r>=d){s+=w(Math.floor(r/d))+" "+l+" ";r%=d}});if(r)s+=w(r);return s.trim()||"Zero"}
const inWords=p=>"Rupees "+words(Math.floor(p/100))+(p%100?" and "+words(p%100)+" Paise":"")+" Only";
const imgUrl=i=>!i?"":/^https?:/.test(i)?i:"product/"+i;

/* ---------- auth ---------- */
if(!db)msg("lmsg","Supabase is not configured. Edit config.js.",1);
async function boot(){if(!db)return;const{data}=await db.auth.getSession();show(data.session)}
async function show(s){$("login").hidden=!!s;$("app").hidden=!s;$("out").hidden=!s;if(s){$("who").textContent=s.user.email;await load()}}
$("in").onclick=async()=>{msg("lmsg","Signing in…");const{data,error}=await db.auth.signInWithPassword({email:$("em").value.trim(),password:$("pw").value});if(error)return msg("lmsg",error.message,1);msg("lmsg","");show(data.session)};
$("pw").onkeydown=e=>{if(e.key==="Enter")$("in").click()};
$("out").onclick=async()=>{await db.auth.signOut();cur=null;show(null)};

/* ---------- tabs ---------- */
const VIEWS=["d","r","f","q","c","p"];
function tab(n){VIEWS.forEach(v=>{$("v"+v).hidden=v!==n});$("tabs").querySelectorAll("button").forEach(b=>b.setAttribute("aria-selected",b.dataset.t===n));({d:drawDash,r:drawReqs,f:drawFollow,q:drawSaved,c:drawCust,p:drawProds})[n]()}
$("tabs").onclick=e=>{const b=e.target.closest("button[data-t]");if(b)tab(b.dataset.t)};

/* ---------- load ---------- */
async function load(){
 $("rl").innerHTML="<p>Loading…</p>";
 const[a,b,c]=await Promise.all([db.from("quotation_requests").select("*").order("created_at",{ascending:false}).limit(1000),db.from("quotations").select("*").order("created_at",{ascending:false}).limit(1000),db.from("products").select("*").order("id").limit(2000)]);
 if(a.error){$("rl").innerHTML='<p class="msg err">'+safe(a.error.message)+" — is this account listed in admin_users, and has the v3 SQL been run?</p>";return}
 reqs=a.data;saved=b.data||[];prods=c.error?[]:c.data;
 const staff=[...new Set(reqs.map(r=>r.assigned_to).filter(Boolean))].sort();
 $("staff").innerHTML=staff.map(s=>`<option value="${safe(s)}">`).join("");
 $("ra").innerHTML='<option value="">All staff</option>'+staff.map(s=>`<option>${safe(s)}</option>`).join("");
 const due=reqs.filter(isDue).length;$("fcnt").hidden=!due;$("fcnt").textContent=due;
 const act=document.querySelector("#tabs [aria-selected=true]");tab(act?act.dataset.t:"d");
}
const isDue=r=>r.follow_up_date&&r.follow_up_date<=today()&&OPEN.includes(r.status);

/* ---------- dashboard ---------- */
function drawDash(){
 const n=k=>reqs.filter(x=>x.status===k).length,issued=saved.filter(s=>s.status!=="draft"),acc=saved.filter(s=>s.status==="accepted");
 const sum=a=>a.reduce((t,s)=>t+Number(s.grand_total||0),0),decided=n("won")+n("lost");
 const k=[["Total enquiries",reqs.length],["Pending",n("pending")],["Quoted",n("quoted")],["Won",n("won")],["Quotation value",rupee(sum(issued))],["Accepted value",rupee(sum(acc))],["Win rate",decided?Math.round(n("won")/decided*100)+"%":"—"],["Follow-ups due",reqs.filter(isDue).length]];
 $("kpis").innerHTML=k.map(([l,v])=>`<div class="kpi"><b>${safe(v)}</b><small>${safe(l)}</small></div>`).join("");
 const m=[];for(let i=5;i>=0;i--){const d=new Date();d.setDate(1);d.setMonth(d.getMonth()-i);m.push({k:d.getFullYear()+"-"+String(d.getMonth()+1).padStart(2,"0"),l:d.toLocaleString("en-IN",{month:"short"}),c:0})}
 reqs.forEach(r=>{const x=m.find(y=>y.k===r.created_at.slice(0,7));if(x)x.c++});const mx=Math.max(1,...m.map(x=>x.c));
 $("bars").innerHTML=m.map(x=>`<div><i style="height:${Math.round(x.c/mx*100)}px"></i>${x.c}<br>${x.l}</div>`).join("");
 const due=reqs.filter(isDue).sort((a,b)=>a.follow_up_date.localeCompare(b.follow_up_date));
 $("fdue").innerHTML=due.length?due.slice(0,8).map(fRow).join(""):"<p class='meta'>Nothing due. 🎉</p>";bindFollow($("fdue"));
}
function csv(rows,name){const q=v=>'"'+String(v??"").replace(/"/g,'""')+'"';const t=rows.map(r=>r.map(q).join(",")).join("\n");const a=document.createElement("a");a.href=URL.createObjectURL(new Blob(["\ufeff"+t],{type:"text/csv"}));a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(a.href),2000)}
$("exR").onclick=()=>csv([["Ref","Date","Customer","Phone","Email","GSTIN","Status","Assigned","Follow-up","Items"],...reqs.map(r=>[r.id.slice(0,8).toUpperCase(),r.created_at.slice(0,10),r.customer_name,r.customer_phone,r.customer_email,r.customer_gstin,r.status,r.assigned_to,r.follow_up_date,r.items.length])],"vectra-enquiries.csv");
$("exQ").onclick=()=>csv([["Quote no","Date","Customer","Status","Taxable","GST","Total"],...saved.map(s=>[s.quote_number,s.quote_date,(reqs.find(r=>r.id===s.request_id)||{}).customer_name,s.status,s.taxable_total,s.gst_total,s.grand_total])],"vectra-quotations.csv");

/* ---------- enquiries ---------- */
function drawReqs(){
 const s=$("rs").value.toLowerCase().trim(),f=$("rf").value,a=$("ra").value,from=$("rfrom").value,to=$("rto").value;
 const r=reqs.filter(x=>(!f||x.status===f)&&(!a||x.assigned_to===a)&&(!from||x.created_at.slice(0,10)>=from)&&(!to||x.created_at.slice(0,10)<=to)&&(!s||(x.customer_name+x.customer_phone+x.id+(x.customer_gstin||"")).toLowerCase().includes(s)));
 const n=k=>reqs.filter(x=>x.status===k).length;
 $("rc").textContent=`${r.length} shown · ${n("pending")} pending · ${n("quoted")} quoted · ${n("won")} won · ${n("lost")} lost · ${n("closed")} closed`;
 $("rl").innerHTML=r.length?r.map(x=>`<div class="req"><div><strong>${safe(x.customer_name)}</strong> <span class="pill ${safe(x.status)}">${safe(x.status)}</span>${isDue(x)?' <span class="pill late">follow-up due</span>':""}<small>${safe(x.customer_phone)} · ${safe(new Date(x.created_at).toLocaleString("en-IN"))} · ${x.items.length} item(s) · Ref ${safe(x.id.slice(0,8).toUpperCase())}${x.assigned_to?" · 👤 "+safe(x.assigned_to):""}</small></div><button class="btn ghost" data-o="${safe(x.id)}">Open</button></div>`).join(""):"<p>No enquiries found.</p>";
 $("rl").querySelectorAll("[data-o]").forEach(b=>b.onclick=()=>openReq(b.dataset.o));
}
["rs","rf","ra","rfrom","rto"].forEach(i=>{$(i).oninput=drawReqs;$(i).onchange=drawReqs});$("rr").onclick=load;

function openReq(id,qid){
 cur=reqs.find(x=>x.id===id);if(!cur)return;tab("r");
 const q=qid?saved.find(s=>s.id===qid):saved.find(s=>s.request_id===id);editing=q||null;
 items=q?q.items.map(x=>({size:"",make:"",note:"",disc:0,...x})):cur.items.map(x=>({name:x.name,category:x.category,quantity:x.quantity,size:x.size||"",make:x.make||"",note:x.note||"",hsn:"",rate:0,disc:0,gst_rate:18}));
 const d=new Date(),m=(q&&q.meta)||{};
 $("cust").textContent=`${cur.customer_name} · ${cur.customer_phone} · ${cur.customer_email||"no email"} · GSTIN ${cur.customer_gstin||"—"}${cur.customer_notes?" · Note: "+cur.customer_notes:""}`;
 $("as").value=cur.assigned_to||"";$("rst").value=cur.status;$("fd").value=cur.follow_up_date||"";$("fn").value=cur.follow_up_note||"";$("inn").value=cur.internal_notes||"";msg("hm","");
 $("qn").value=q?q.quote_number:"";$("qd").value=q?q.quote_date:d.toISOString().slice(0,10);$("qv").value=q?q.valid_until||"":new Date(Date.now()+15*864e5).toISOString().slice(0,10);
 $("qg").value=q?q.gst_treatment:(/^24/.test(cur.customer_gstin||"")||!cur.customer_gstin?"intra":"inter");
 $("fr").value=m.freight||"";$("fg").value=m.freight_gst??18;if(m.payment)$("pt").value=m.payment;if(m.delivery)$("dt").value=m.delivery;
 if(q&&q.terms)$("qt").value=q.terms;
 $("sn").hidden=!q;$("ed").hidden=false;drawLines();msg("qm",q?"Editing saved quotation "+q.quote_number+".":"");$("ed").scrollIntoView({behavior:"smooth"});
}
$("sh").onclick=async()=>{if(!cur)return;
 const u={assigned_to:$("as").value.trim()||null,status:$("rst").value,follow_up_date:$("fd").value||null,follow_up_note:$("fn").value.trim()||null,internal_notes:$("inn").value.trim()||null,updated_at:new Date().toISOString()};
 const r=await db.from("quotation_requests").update(u).eq("id",cur.id);if(r.error)return msg("hm",r.error.message,1);msg("hm","Saved ✓");const id=cur.id;await load();cur=reqs.find(x=>x.id===id)};

/* ---------- quotation lines ---------- */
function drawLines(){
 $("ql").innerHTML=items.map((x,i)=>`<tr data-i="${i}"><td><input data-k="name" value="${safe(x.name)}" maxlength="160" aria-label="Product name" style="font-weight:700">${/^Custom/.test(x.category||"")?' <span class="pill pending">Custom item</span>':""}<div class="dg"><input data-k="size" value="${safe(x.size||"")}" maxlength="60" placeholder="Size / spec"><input data-k="make" value="${safe(x.make||"")}" maxlength="60" placeholder="Make / brand"><input data-k="note" value="${safe(x.note||"")}" maxlength="200" placeholder="Description / other info"></div><button type="button" class="linkbtn" data-rm="${i}">remove line</button></td><td><input data-k="hsn" value="${safe(x.hsn||"")}" maxlength="8" inputmode="numeric" aria-label="HSN"></td><td><input data-k="quantity" type="number" min="1" value="${x.quantity}"></td><td><input data-k="rate" type="number" min="0" step="0.01" inputmode="decimal" value="${x.rate||""}" placeholder="0.00"></td><td><input data-k="disc" type="number" min="0" max="100" step="0.1" value="${x.disc||""}" placeholder="0"></td><td><select data-k="gst_rate">${[0,5,12,18,28].map(n=>`<option ${n===x.gst_rate?"selected":""}>${n}</option>`).join("")}</select></td><td data-c="b"></td><td data-c="t"></td><td data-c="s"></td></tr>`).join("");
 $("ql").querySelectorAll("[data-k]").forEach(e=>{const h=()=>{const i=+e.closest("tr").dataset.i,k=e.dataset.k;items[i][k]=["size","make","note","name"].includes(k)?e.value:k==="hsn"?e.value.replace(/\D/g,""):k==="gst_rate"?+e.value:Math.max(0,+e.value||0);calc()};e.oninput=h;e.onchange=h});
 $("ql").querySelectorAll("[data-rm]").forEach(b=>b.onclick=()=>{items.splice(+b.dataset.rm,1);drawLines()});
 calc();
}
$("addl").onclick=()=>{items.push({name:"New item",category:"Custom (not in catalogue)",quantity:1,size:"",make:"",note:"",hsn:"",rate:0,disc:0,gst_rate:18});drawLines()};
function calc(){
 items.forEach((x,i)=>{const r=$("ql").querySelector(`[data-i="${i}"]`);if(!r)return;const l=line(x);r.querySelector("[data-c=b]").textContent=inr(l.b);r.querySelector("[data-c=t]").textContent=inr(l.t);r.querySelector("[data-c=s]").textContent=inr(l.s)});
 const t=totals(),c=Math.round(t.t/2),tax=$("qg").value==="intra"?`<div><span>CGST</span><span>₹ ${inr(c)}</span></div><div><span>SGST</span><span>₹ ${inr(t.t-c)}</span></div>`:`<div><span>IGST</span><span>₹ ${inr(t.t)}</span></div>`;
 $("tt").innerHTML=`<div><span>Taxable value${t.f.b?" (incl. freight)":""}</span><span>₹ ${inr(t.b)}</span></div>${tax}<div><span>Round off</span><span>${rof(t.ro)}</span></div><div class="g"><span>Grand total</span><span>₹ ${inr(t.g)}</span></div>`;
}
$("qg").onchange=calc;$("fr").oninput=calc;$("fg").onchange=calc;
function build(){
 if(!cur||!items.length||items.some(x=>!x.name.trim()||!(x.rate>0)||!(x.quantity>0))){msg("qm","Every line needs a name, a quantity and a rate above zero.",1);return null}
 const t=totals();return{request_id:cur.id,quote_date:$("qd").value,valid_until:$("qv").value||null,gst_treatment:$("qg").value,items,terms:$("qt").value,taxable_total:t.b/100,gst_total:t.t/100,grand_total:t.g/100,meta:{freight:+$("fr").value||0,freight_gst:+$("fg").value,payment:$("pt").value.trim(),delivery:$("dt").value.trim()}}}
async function save(asNew){
 const q=build();if(!q)return;$("sv").disabled=$("sn").disabled=true;msg("qm","Saving…");
 const{data:{session}}=await db.auth.getSession();let res;
 if(editing&&!asNew)res=await db.from("quotations").update(q).eq("id",editing.id).select().single();
 else{const n=await db.rpc("next_quote_number");if(n.error){$("sv").disabled=$("sn").disabled=false;return msg("qm","Could not generate number: "+n.error.message,1)}
  res=await db.from("quotations").insert({...q,quote_number:n.data,status:"issued",created_by:session.user.id}).select().single()}
 $("sv").disabled=$("sn").disabled=false;if(res.error)return msg("qm","Could not save: "+res.error.message,1);
 editing=res.data;$("qn").value=editing.quote_number;$("sn").hidden=false;
 if($("rst").value==="pending")await db.from("quotation_requests").update({status:"quoted",updated_at:new Date().toISOString()}).eq("id",cur.id);
 const id=cur.id;msg("qm","Saved as "+editing.quote_number+".");await load();cur=reqs.find(x=>x.id===id);$("rst").value=cur.status;
}
$("sv").onclick=()=>save(false);$("sn").onclick=()=>save(true);

/* ---------- print / share ---------- */
function printable(q,c,no){
 const m=q.meta||{},fb=Math.round((m.freight||0)*100),ft=Math.round(fb*(m.freight_gst||0)/100),cg=Math.round(q.gst_total*100/2),ro=Math.round(q.grand_total*100)-Math.round(q.taxable_total*100)-Math.round(q.gst_total*100);
 const rows=q.items.map((x,i)=>{const l=line(x);return`<tr><td>${i+1}</td><td><b>${safe(x.name)}</b>${x.size||x.make?`<br><small>${safe([x.size&&"Size: "+x.size,x.make&&"Make: "+x.make].filter(Boolean).join(" | "))}</small>`:""}${x.note?`<br><small>${safe(x.note)}</small>`:""}</td><td>${safe(x.hsn||"—")}</td><td>${x.quantity}</td><td style="text-align:right">${inr(x.rate*100)}</td><td>${x.disc?x.disc+"%":"—"}</td><td>${x.gst_rate}%</td><td style="text-align:right">${inr(l.b)}</td><td style="text-align:right">${inr(l.s)}</td></tr>`}).join("")+(fb?`<tr><td></td><td><b>Freight / delivery</b></td><td></td><td>1</td><td style="text-align:right">${inr(fb)}</td><td>—</td><td>${m.freight_gst||0}%</td><td style="text-align:right">${inr(fb)}</td><td style="text-align:right">${inr(fb+ft)}</td></tr>`:"");
 const tax=q.gst_treatment==="intra"?`<div>CGST: ₹ ${inr(cg)}</div><div>SGST: ₹ ${inr(Math.round(q.gst_total*100)-cg)}</div>`:`<div>IGST: ₹ ${inr(q.gst_total*100)}</div>`;
 return`<div style="display:flex;justify-content:space-between;border-bottom:3px solid #a51d32;padding-bottom:12px"><div><h1 style="margin:0">VECTRA ENTERPRISES</h1><b>INDUSTRIAL • ENERGY • MRO</b><p style="margin:6px 0">First Floor, Shop No. 135 Wing, Opp. Kataria Show Room, Makarpura, Vadodara, Gujarat – 390014<br>+91 75975 77129 · vectra2029@yahoo.com<br>GSTIN: 24ABCFV2730P1ZX</p></div><div style="text-align:right"><h2 style="margin:0">QUOTATION</h2><b>${safe(no)}</b><p>Date: ${safe(q.quote_date)}<br>Valid until: ${safe(q.valid_until||"—")}</p></div></div>
 <p><b>To:</b> ${safe(c.customer_name)}<br>${safe(c.customer_phone)} ${safe(c.customer_email||"")}<br>GSTIN: ${safe(c.customer_gstin||"—")}</p>
 <table><thead><tr><th>#</th><th>Description</th><th>HSN/SAC</th><th>Qty</th><th>Rate ₹</th><th>Disc</th><th>GST</th><th>Taxable ₹</th><th>Total ₹</th></tr></thead><tbody>${rows}</tbody></table>
 <div style="margin:16px 0 0 auto;width:290px;line-height:1.8"><div>Taxable value: ₹ ${inr(q.taxable_total*100)}</div>${tax}<div>Round off: ${rof(ro)}</div><h3 style="margin:6px 0">Grand total: ₹ ${inr(q.grand_total*100)}</h3></div>
 <p><b>Amount in words:</b> ${inWords(Math.round(q.grand_total*100))}</p>${m.payment?`<p><b>Payment:</b> ${safe(m.payment)}</p>`:""}${m.delivery?`<p><b>Delivery:</b> ${safe(m.delivery)}</p>`:""}<p style="white-space:pre-wrap"><b>Terms &amp; Conditions</b><br>${safe(q.terms)}</p>
 <p style="margin-top:50px;text-align:right"><b>For VECTRA ENTERPRISES</b><br><br><br>Authorised Signatory</p>`}
$("pr").onclick=()=>{const q=build();if(!q)return;$("printArea").innerHTML=printable(q,cur,$("qn").value||"DRAFT");const old=document.title;document.title=($("qn").value||"Quotation").replace(/\//g,"-");window.print();document.title=old};
const summary=()=>{const t=totals();return`Quotation ${$("qn").value||"(draft)"} from Vectra Enterprises — total ₹ ${inr(t.g)} incl. GST. Valid until ${$("qv").value||"—"}.`};
$("wa").onclick=()=>{const p=p10(cur.customer_phone);window.open("https://wa.me/91"+p+"?text="+encodeURIComponent(`Hello ${cur.customer_name}, thank you for your enquiry. ${summary()} You can track and accept it at ${location.origin}/#track (Ref ${cur.id.slice(0,8).toUpperCase()}, your mobile number).`),"_blank","noopener")};
$("em2").onclick=()=>{if(!cur.customer_email)return msg("qm","This customer gave no email address.",1);location.href="mailto:"+encodeURIComponent(cur.customer_email)+"?subject="+encodeURIComponent("Quotation "+($("qn").value||"")+" – Vectra Enterprises")+"&body="+encodeURIComponent(`Dear ${cur.customer_name},\n\n${summary()}\n\nTrack or accept it online: ${location.origin}/#track (Ref ${cur.id.slice(0,8).toUpperCase()}).\nPlease find the PDF attached.\n\nRegards,\nVectra Enterprises\n+91 75975 77129`)};

/* ---------- follow-ups ---------- */
function fRow(x){const late=x.follow_up_date<today();return`<div class="req"><div><strong>${safe(x.customer_name)}</strong> <span class="pill ${late?"late":"pending"}">${late?"overdue · ":""}${safe(x.follow_up_date)}</span><small>${safe(x.customer_phone)}${x.assigned_to?" · 👤 "+safe(x.assigned_to):""}${x.follow_up_note?" · "+safe(x.follow_up_note):""}</small></div><div class="row"><a class="btn ghost" href="tel:${safe(x.customer_phone)}">Call</a><button class="btn ghost" data-o="${safe(x.id)}">Open</button><button class="btn ghost" data-done="${safe(x.id)}">Done</button></div></div>`}
function bindFollow(root){root.querySelectorAll("[data-o]").forEach(b=>b.onclick=()=>openReq(b.dataset.o));root.querySelectorAll("[data-done]").forEach(b=>b.onclick=async()=>{const r=await db.from("quotation_requests").update({follow_up_date:null,follow_up_note:null,updated_at:new Date().toISOString()}).eq("id",b.dataset.done);if(r.error)alert(r.error.message);else load()})}
function drawFollow(){const l=reqs.filter(x=>x.follow_up_date&&OPEN.includes(x.status)).sort((a,b)=>a.follow_up_date.localeCompare(b.follow_up_date));$("fl").innerHTML=l.length?l.map(fRow).join(""):"<p>No follow-ups scheduled. Set one inside any enquiry.</p>";bindFollow($("fl"))}

/* ---------- saved quotations ---------- */
function drawSaved(){
 const s=$("qs").value.toLowerCase().trim(),f=$("qf").value;
 const l=saved.filter(x=>{const c=reqs.find(r=>r.id===x.request_id);return(!f||x.status===f)&&(!s||(x.quote_number+(c?c.customer_name:"")).toLowerCase().includes(s))});
 $("ql2").innerHTML=l.length?l.map(s=>{const c=reqs.find(r=>r.id===s.request_id);return`<div class="req"><div><strong>${safe(s.quote_number)}</strong> <span class="pill ${safe(s.status)}">${safe(s.status)}</span><small>${safe(c?c.customer_name:"—")} · ${safe(s.quote_date)} · ₹ ${inr(s.grand_total*100)}</small></div><div class="row"><select data-s="${safe(s.id)}" aria-label="Status">${["issued","accepted","rejected"].map(x=>`<option ${x===s.status?"selected":""}>${x}</option>`).join("")}</select><button class="btn ghost" data-e="${safe(s.id)}">Open / revise</button></div></div>`}).join(""):"<p>No saved quotations.</p>";
 $("ql2").querySelectorAll("[data-e]").forEach(b=>b.onclick=()=>{const s=saved.find(x=>x.id===b.dataset.e);openReq(s.request_id,s.id)});
 $("ql2").querySelectorAll("[data-s]").forEach(e=>e.onchange=async()=>{const r=await db.from("quotations").update({status:e.value}).eq("id",e.dataset.s);if(r.error)alert(r.error.message);else await load()});
}
$("qs").oninput=drawSaved;$("qf").onchange=drawSaved;

/* ---------- customers ---------- */
function drawCust(){
 const map=new Map();reqs.forEach(r=>{const k=p10(r.customer_phone)||r.id;const c=map.get(k)||{name:r.customer_name,phone:r.customer_phone,email:r.customer_email,gst:r.customer_gstin,n:0,last:r.created_at,val:0,ids:[]};c.n++;c.ids.push(r.id);if(!c.email)c.email=r.customer_email;if(!c.gst)c.gst=r.customer_gstin;map.set(k,c)});
 saved.filter(s=>s.status!=="draft").forEach(s=>{for(const c of map.values())if(c.ids.includes(s.request_id)){c.val+=Number(s.grand_total);break}});
 const q=$("cs").value.toLowerCase().trim(),l=[...map.values()].filter(c=>!q||(c.name+c.phone+(c.gst||"")).toLowerCase().includes(q)).sort((a,b)=>b.last.localeCompare(a.last));
 $("cl").innerHTML=l.length?l.map(c=>`<div class="req"><div><strong>${safe(c.name)}</strong><small>${safe(c.phone)}${c.email?" · "+safe(c.email):""}${c.gst?" · GSTIN "+safe(c.gst):""}</small><small>${c.n} enquiry(ies) · quoted ${rupee(c.val)} · last ${safe(c.last.slice(0,10))}</small></div><div class="row"><a class="btn ghost" href="tel:${safe(c.phone)}">Call</a><button class="btn ghost" data-ph="${safe(p10(c.phone))}">View enquiries</button></div></div>`).join(""):"<p>No customers yet.</p>";
 $("cl").querySelectorAll("[data-ph]").forEach(b=>b.onclick=()=>{$("rs").value=b.dataset.ph;$("rf").value="";tab("r")});
}
$("cs").oninput=drawCust;

/* ---------- product manager ---------- */
function drawProds(){
 const s=$("ps").value.toLowerCase().trim(),l=prods.filter(p=>!s||(p.name+p.category+(p.brand||"")).toLowerCase().includes(s));
 $("pc").textContent=prods.length?`${l.length} of ${prods.length} products`:"No products in the database yet — import your current catalogue below.";$("pi").hidden=!!prods.length;
 $("cats").innerHTML=[...new Set(prods.map(p=>p.category))].sort().map(c=>`<option value="${safe(c)}">`).join("");
 $("pl").innerHTML=l.slice(0,150).map(p=>`<div class="pr"><img src="${safe(imgUrl(p.image))}" alt="" loading="lazy"><div><strong>${safe(p.name)}</strong> ${p.active?"":'<span class="pill closed">hidden</span>'}<small>${safe(p.category)}${p.brand?" · "+safe(p.brand):""}</small></div><button class="btn ghost" data-pe="${p.id}">Edit</button></div>`).join("")+(l.length>150?"<p class='meta'>Showing first 150 — use search.</p>":"");
 $("pl").querySelectorAll("[data-pe]").forEach(b=>b.onclick=()=>editProd(prods.find(p=>p.id==b.dataset.pe)));
}
$("ps").oninput=drawProds;
function editProd(p){pedit=p||null;$("pe").hidden=false;$("pt2").textContent=p?"Edit product":"New product";
 $("pnm").value=p?p.name:"";$("pcat").value=p?p.category:"";$("pbr").value=p?p.brand||"":"";$("pim").value=p?p.image||"":"";$("pds").value=p?p.description||"":"";
 $("psp").value=p?(p.specs||[]).map(s=>s.k+": "+s.v).join("\n"):"";$("pac").checked=p?p.active:true;$("pup").value="";$("pdl").hidden=!p;msg("pm","");$("pe").scrollIntoView({behavior:"smooth"})}
$("pn").onclick=()=>editProd(null);$("pcx").onclick=()=>$("pe").hidden=true;
$("ps2").onclick=async()=>{
 const name=$("pnm").value.trim(),category=$("pcat").value.trim();if(!name||!category)return msg("pm","Name and category are required.",1);
 let image=$("pim").value.trim()||null;const f=$("pup").files[0];
 if(f){if(f.size>2*1024*1024)return msg("pm","Image is over 2 MB.",1);msg("pm","Uploading image…");
  const ext=({"image/jpeg":"jpg","image/png":"png","image/webp":"webp"})[f.type];if(!ext)return msg("pm","Use JPG, PNG or WebP.",1);
  const path=Date.now()+"_"+name.toLowerCase().replace(/[^a-z0-9]+/g,"_").slice(0,40)+"."+ext;
  const up=await db.storage.from("product-images").upload(path,f,{contentType:f.type,cacheControl:"31536000"});
  if(up.error)return msg("pm","Upload failed: "+up.error.message,1);image=db.storage.from("product-images").getPublicUrl(path).data.publicUrl}
 const specs=$("psp").value.split("\n").map(l=>l.trim()).filter(Boolean).map(l=>{const i=l.indexOf(":");return i>0?{k:l.slice(0,i).trim(),v:l.slice(i+1).trim()}:{k:"",v:l}});
 const row={name,category,brand:$("pbr").value.trim()||null,description:$("pds").value.trim()||null,specs,image,active:$("pac").checked};
 msg("pm","Saving…");const r=pedit?await db.from("products").update(row).eq("id",pedit.id):await db.from("products").insert(row);
 if(r.error)return msg("pm",r.error.message,1);$("pe").hidden=true;await load();tab("p")};
$("pdl").onclick=async()=>{if(!pedit||!confirm("Delete this product permanently? (Use 'Visible on website' to hide instead.)"))return;const r=await db.from("products").delete().eq("id",pedit.id);if(r.error)return msg("pm",r.error.message,1);$("pe").hidden=true;await load();tab("p")};
$("pi").onclick=async()=>{
 $("pi").disabled=true;try{const d=await (await fetch("products.json")).json();
  const rows=d.products.map(p=>({name:p.n,category:p.c,image:p.i,active:true}));
  for(let i=0;i<rows.length;i+=100){const r=await db.from("products").insert(rows.slice(i,i+100));if(r.error)throw r.error}
  await load();tab("p")}catch(e){alert("Import failed: "+(e.message||e))}$("pi").disabled=false};

boot();
})();
