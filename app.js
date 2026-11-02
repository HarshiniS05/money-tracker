'use strict';
// ---------- helpers ----------
const $=(s,e=document)=>e.querySelector(s);
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const inr=n=>(n<0?'-':'')+'₹'+Math.abs(n||0).toLocaleString('en-IN',{minimumFractionDigits:2,maximumFractionDigits:2});
const T=()=>new Date().toLocaleDateString('sv');
const addM=(k,n)=>{const[y,m]=k.split('-').map(Number);return new Date(y,m-1+n,1).toLocaleDateString('sv').slice(0,7)};
const wk=d=>{const x=new Date(d+'T00:00');x.setDate(x.getDate()-(x.getDay()+6)%7);return x.toLocaleDateString('sv')};
const toast=m=>{const t=$('#toast');t.textContent=m;t.hidden=false;setTimeout(()=>t.hidden=true,2500)};
const D={accounts:[{name:'Cash',open:0},{name:'Bank',open:0}],
 inc:['Salary','Freelancing','Business','Allowance','Gift','Interest','Refund','Other'],
 exp:['Food and groceries','Travel and transport','Shopping','Education','Entertainment','Bills and utilities','Rent','Healthcare','Personal care','Subscriptions','Family','Travel and holidays','Other'],
 budget:0,cb:{},goals:[],plans:[],ips:[],loans:[],bills:[],autolock:0,name:'',lastBackup:'',theme:'auto'};
const METHODS=['Cash','UPI','Debit card','Credit card','Bank transfer','Other'];
const S={tx:[],cfg:{}},V={},P={},A={},C={},F={};
// ---------- storage (IndexedDB, stays on this device) ----------
let db;
const openDB=()=>new Promise((res,rej)=>{const r=indexedDB.open('moneydb',1);r.onupgradeneeded=()=>{r.result.createObjectStore('tx',{keyPath:'id',autoIncrement:true});r.result.createObjectStore('kv')};r.onsuccess=()=>{db=r.result;res()};r.onerror=()=>rej(r.error)});
const rq=r=>new Promise((res,rej)=>{r.onsuccess=()=>res(r.result);r.onerror=()=>rej(r.error)});
const st=(n,m='readonly')=>db.transaction(n,m).objectStore(n);
const getKV=k=>rq(st('kv').get(k)),setKV=(k,v)=>rq(st('kv','readwrite').put(v,k));
const putTx=t=>rq(st('tx','readwrite').put(t)),delTx=id=>rq(st('tx','readwrite').delete(id));
async function load(){S.tx=await rq(st('tx').getAll());S.cfg={...structuredClone(D),...(await getKV('cfg')||{})};S.cfg.ips=S.cfg.ips||[];S.cfg.loans=S.cfg.loans||[];S.cfg.plans=S.cfg.plans||[];S.cfg.bills=S.cfg.bills||[];document.documentElement.dataset.theme=S.cfg.theme}
const saveCfg=()=>setKV('cfg',S.cfg);
// ---------- validation ----------
function clean(o){const s=(v,n=200)=>String(v??'').replace(/[\u0000-\u001f]/g,' ').trim().slice(0,n);const a=Number(o.amount);
 if(!['income','expense','transfer'].includes(o.type)||!/^\d{4}-\d{2}-\d{2}$/.test(o.date||'')||isNaN(new Date(o.date))||!(a>0)||a>1e10)return null;
 return{...(o.id?{id:+o.id}:{}),type:o.type,date:o.date,amount:Math.round(a*100)/100,category:s(o.category,60)||'Other',sub:s(o.sub,60),desc:s(o.desc),party:s(o.party),account:s(o.account,60),to:s(o.to,60),method:s(o.method,30),notes:s(o.notes,500),...(o.grp?{grp:String(o.grp).slice(0,30)}:{}),...(o.pl?{pl:String(o.pl).slice(0,30)}:{}),...(o.ip?{ip:String(o.ip).slice(0,30)}:{}),...(o.ln?{ln:String(o.ln).slice(0,30)}:{}),...(o.lr?{lr:1}:{}),...(o.bl?{bl:String(o.bl).slice(0,30)}:{}),...(o.src?{src:s(o.src,60)}:{})}}
// ---------- maths ----------
const sum=(a,ty)=>a.filter(t=>t.type===ty).reduce((s,t)=>s+t.amount,0);
const opening=()=>S.cfg.accounts.reduce((s,a)=>s+a.open,0);
const balance=()=>opening()+sum(S.tx,'income')-sum(S.tx,'expense'); // transfers never counted
const accBal=a=>a.open+S.tx.reduce((s,t)=>s+(t.account===a.name?(t.type==='income'?t.amount:-t.amount):0)+(t.type==='transfer'&&t.to===a.name?t.amount:0),0);
const inR=(a,f,t)=>a.filter(x=>x.date>=f&&x.date<=t);
const byCat=l=>{const m={};l.filter(t=>t.type==='expense').forEach(t=>m[t.category]=(m[t.category]||0)+t.amount);return m};
const ranked=o=>Object.entries(o).sort((a,b)=>b[1]-a[1]);
function rng(p,c){const n=new Date(),f=d=>d.toLocaleDateString('sv'),y=n.getFullYear(),m=n.getMonth();
 if(p==='today')return[T(),T()];
 if(p==='week'){const s=new Date(n);s.setDate(n.getDate()-(n.getDay()+6)%7);const e=new Date(s);e.setDate(s.getDate()+6);return[f(s),f(e)]}
 if(p==='month')return[f(new Date(y,m,1)),f(new Date(y,m+1,0))];
 if(p==='year')return[y+'-01-01',y+'-12-31'];return c}
const rate=(i,e)=>i>0?((i-e)/i*100).toFixed(1)+'%':'n/a (no income)';
const warn=(used,lim,name)=>{if(!(lim>0))return'';const p=used/lim*100;if(p<80)return'';const l=p>=100?100:p>=90?90:80;return`<div class="alert ${l>=100?'hi':''}">⚠ ${esc(name)}: ${l}% reached — spent ${inr(used)} of ${inr(lim)}</div>`};
const opt=(a,v)=>a.map(x=>`<option${x===v?' selected':''}>${esc(x)}</option>`).join('');
// ---------- Dashboard ----------
V.dash=()=>{const p=S.p||'month',[f,t]=rng(p,S.cr||[T(),T()]),[mf,mt]=rng('month');
 const td=S.tx.filter(x=>x.date===T()),mo=inR(S.tx,mf,mt),pr=inR(S.tx,f,t);
 const ti=sum(td,'income'),te=sum(td,'expense'),mi=sum(mo,'income'),me=sum(mo,'expense'),bc=ranked(byCat(mo))[0],B=S.cfg.budget;
 const c=(l,v,k='')=>`<div class="card"><small>${l}</small><b class="${k}">${v}</b></div>`;
 const ps=['today','week','month','year','custom'];
 return`<h2>Hi${S.cfg.name?', '+esc(S.cfg.name):''} 👋</h2><div class="bar"><button class="pri" data-a="qa" data-v="expense">− Add expense</button><button data-a="qa" data-v="income">+ Add income</button></div>${planAlerts()}${warn(me,B,'Monthly budget')}${Object.entries(S.cfg.cb).map(([k,v])=>warn(byCat(mo)[k]||0,v,k)).join('')}
 <div class="grid">${c('Current balance',inr(balance()),balance()<0?'neg':'')}${c("Today's income",inr(ti),'inc')}${c("Today's expenses",inr(te),'exp')}${c("Today's net cash flow",inr(ti-te),ti-te<0?'neg':'pos')}
 ${c('Income this month',inr(mi),'inc')}${c('Expenses this month',inr(me),'exp')}${c('Net savings this month',inr(mi-me),mi-me<0?'neg':'pos')}${c('Savings rate',rate(mi,me))}
 ${c('Highest spending category',bc?esc(bc[0])+' · '+inr(bc[1]):'No expenses yet')}${c('Remaining monthly budget',B>0?inr(B-me):'Set in Budgets',B>0&&B-me<0?'neg':'')}${planCards(c,mi,me)}</div>
 <h3>Period summary</h3><div class="chips">${ps.map(x=>`<button data-a="p" data-v="${x}" class="${x===p?'on':''}">${x}</button>`).join('')}
 ${p==='custom'?`<input type="date" id="cf" value="${f}" data-c="cr"><input type="date" id="ct" value="${t}" data-c="cr">`:''}</div>
 <div class="grid">${c('Income',inr(sum(pr,'income')),'inc')}${c('Expenses',inr(sum(pr,'expense')),'exp')}${c('Net',inr(sum(pr,'income')-sum(pr,'expense')))}${c('Transactions',pr.length)}</div>
 <h3>Accounts</h3><div class="grid">${S.cfg.accounts.map(a=>c(esc(a.name),inr(accBal(a)))).join('')}</div>
 ${S.tx.length?'':'<p class="mut">No transactions yet. Use “Add Transaction” to start. Your opening balances are in Settings.</p>'}`};
A.qa=el=>{S.ft=el.dataset.v;if(location.hash==='#add')render();else location.hash='#add'};
const planPaid=(p,mk=T().slice(0,7))=>S.tx.find(t=>t.pl===p.id&&t.date.startsWith(mk));
const LA=['Money lent','Money borrowed'],SP=n=>LA.includes(n)||(S.cfg.plans||[]).some(p=>p.to===n);
const incGot=(p,mk=T().slice(0,7))=>S.tx.find(t=>t.ip===p.id&&t.date.startsWith(mk));
const loanLeft=l=>l.amount-S.tx.filter(t=>t.ln===l.id&&t.lr).reduce((x,t)=>x+t.amount,0);
const owed=d=>(S.cfg.loans||[]).filter(l=>l.dir===d).reduce((x,l)=>x+Math.max(0,loanLeft(l)),0);
const spendable=()=>S.cfg.accounts.filter(a=>!SP(a.name)).reduce((x,a)=>x+accBal(a),0);
const billPaid=(b,mk=T().slice(0,7))=>S.tx.find(t=>t.bl===b.id&&t.date.startsWith(mk));
const billsLeft=()=>(S.cfg.bills||[]).filter(b=>!billPaid(b)).reduce((x,b)=>x+b.amount,0);
const mInc=()=>sum(S.tx.filter(t=>t.date.startsWith(T().slice(0,7))),'income'),mExp=()=>sum(S.tx.filter(t=>t.date.startsWith(T().slice(0,7))),'expense');
function dayLimit(mi,me){const n=new Date(),days=new Date(n.getFullYear(),n.getMonth()+1,0).getDate()-n.getDate()+1,exp=(S.cfg.ips||[]).filter(p=>!incGot(p)).reduce((x,p)=>x+p.amount,0)+0,rd=(S.cfg.plans||[]).reduce((x,p)=>x+p.amount,0);
 let av=mi+exp-rd-billsLeft()-me;if(S.cfg.budget>0)av=Math.min(av,S.cfg.budget-me);return{av,dl:days,per:av/days,known:mi>0||exp>0}}
const planAlerts=()=>{const dd=+T().slice(8),o=[];
 if(S.tx.length){const ago=S.cfg.lastBackup?(Date.now()-new Date(S.cfg.lastBackup))/864e5:999;if(ago>14)o.push(`💾 ${S.cfg.lastBackup?'Your last backup was '+Math.floor(ago)+' days ago':'You have not made a backup yet'}. <a href="#set">Back up now</a>`)}
 (S.cfg.plans||[]).filter(p=>!planPaid(p)&&dd>=p.day).forEach(p=>o.push(`⏳ ${esc(p.name)} ${inr(p.amount)} is not marked paid this month. <a href="#plan">Mark as paid</a>`));
 (S.cfg.bills||[]).filter(b=>!billPaid(b)&&dd>=b.day).forEach(b=>o.push(`🧾 Bill “${esc(b.name)}” ${inr(b.amount)} is due. <a href="#plan">Mark as paid</a>`));
 (S.cfg.ips||[]).filter(p=>!incGot(p)&&dd>=p.day).forEach(p=>o.push(`💰 ${esc(p.name)} ${inr(p.amount)} is not marked received yet. <a href="#plan">Mark received</a>`));
  (S.cfg.loans||[]).filter(l=>loanLeft(l)>0&&l.due&&l.due<T()).forEach(l=>o.push(`⚠ ${l.dir==='lent'?esc(l.who)+' has not returned':'You still owe '+esc(l.who)}: ${inr(loanLeft(l))} (due ${l.due}). <a href="#loan">Open</a>`));
 const L=dayLimit(mInc(),mExp()),te=sum(S.tx.filter(t=>t.date===T()),'expense');if(L.known&&L.av>0&&te>L.per)o.push(`📊 You have spent ${inr(te)} today, above your daily limit of ${inr(L.per)}.`);
 return o.map(x=>`<div class="alert">${x}</div>`).join('')};
function planCards(c,mi,me){const pl=S.cfg.plans||[],ips=S.cfg.ips||[],g=owed('lent'),w=owed('borrowed'),L=dayLimit(mi,me);let o='';
 o+=L.known?c('Daily spending limit',L.av>0?inr(L.per)+' / day':'No money left',L.av>0?'pos':'neg')+c(`Left to spend (${L.dl} days)`,inr(L.av),L.av<0?'neg':''):c('Daily spending limit','Add income first');
 if(ips.length)o+=c('Fixed income still to receive',inr(ips.filter(p=>!incGot(p)).reduce((x,p)=>x+p.amount,0)));
  if((S.cfg.bills||[]).length)o+=c('Bills still to pay',inr(billsLeft()));
 if(pl.length){const a=pl.reduce((x,p)=>x+p.amount,0),d=pl.filter(p=>planPaid(p)).reduce((x,p)=>x+p.amount,0);
  o+=c('Set aside this month (RD etc.)',inr(a))+c('Set-aside paid / pending',`${inr(d)} / ${inr(a-d)}`)+c('Income after set-asides',inr(mi-a),mi-a<0?'neg':'pos')+c('Safe to spend left',inr(mi-a-billsLeft()-me),mi-a-billsLeft()-me<0?'neg':'pos')}
 if(pl.length||g||w)o+=c('Spendable balance (without RD / loans)',inr(spendable()));
 if(g)o+=c('To get back (lent)',inr(g),'pos');if(w)o+=c('To pay back (borrowed)',inr(w),'neg');return o}
A.p=el=>{S.p=el.dataset.v;render()};C.cr=()=>{S.p='custom';S.cr=[$('#cf').value,$('#ct').value];render()};
// ---------- Add / edit ----------
V.add=id=>{const t=id?S.tx.find(x=>x.id==id):null,ty=t?.type||S.ft||'expense',cats=ty==='income'?S.cfg.inc:S.cfg.exp,ac=S.cfg.accounts.map(a=>a.name),v=k=>esc(t?.[k]??'');
 const L=(n,h)=>`<label>${n}${h}</label>`;
 return`<h2>${t?'Edit':'Add'} transaction</h2><div class="seg">${['expense','income','transfer'].map(x=>`<button type="button" data-a="ft" data-v="${x}" class="${x===ty?'on':''}" ${t?'disabled':''}>${x}</button>`).join('')}</div>
 <form data-s="save" class="grid"><input type="hidden" name="id" value="${t?.id||''}"><input type="hidden" name="type" value="${ty}">
 ${L('Date',`<input type="date" name="date" required value="${t?.date||T()}">`)}${L('Amount (₹)',`<input type="number" name="amount" data-c="fb" required min="0.01" step="0.01" inputmode="decimal" value="${t?.amount||''}" ${t?'':'autofocus'}>`)}
 ${ty==='transfer'?L('From account',`<select name="account" data-c="fb">${opt(ac,t?.account)}</select>`)+L('To account',`<select name="to">${opt(ac,t?.to||ac[1])}</select>`):
 L('Category',`<select name="category">${opt(cats,t?.category)}</select>`)+L('Or new category',`<input name="newcat" maxlength="60">`)+L(ty==='income'?'Income source':'Merchant / recipient',`<input name="party" maxlength="200" value="${v('party')}">`)+(ty==='expense'?L('Subcategory',`<input name="sub" maxlength="60" value="${v('sub')}">`):'')+(ty==='expense'?L('Paid with money from (optional)',`<select name="src"><option value="">— not specified —</option>${opt(S.cfg.inc,t?.src)}</select>`):'')+L('Account',`<select name="account" data-c="fb">${opt(ac,t?.account)}</select>`)+L('Payment method',`<select name="method">${opt(METHODS,t?.method||'UPI')}</select>`)}
 ${L('Description',`<input name="desc" maxlength="200" value="${v('desc')}">`)}${L('Notes (optional)',`<input name="notes" maxlength="500" value="${v('notes')}">`)}
 ${!t&&ty==='expense'?`<details class="box" style="grid-column:1/-1"><summary>Split this payment into items (e.g. ₹1000 dress = top ₹500 + pant ₹500)</summary><p class="mut">Enter the total in Amount above. Item amounts must add up to it.</p>${[0,1,2,3,4].map(i=>`<div class="bar"><input name="si${i}" placeholder="Item (e.g. Top)" maxlength="60"><select name="sc${i}">${opt(S.cfg.exp,'Shopping')}</select><input name="sa${i}" type="number" min="0" step="0.01" placeholder="₹" style="width:90px"></div>`).join('')}</details>`:''}
 <small id="ab" class="mut" style="grid-column:1/-1"></small><button class="pri">${t?'Save changes':'Add'}</button></form><p class="mut">Never enter bank passwords, UPI PINs, CVVs or OTPs here.</p>`};
A.ft=el=>{S.ft=el.dataset.v;render()};
F.save=async f=>{const d=Object.fromEntries(new FormData(f));const nc=(d.newcat||'').trim().slice(0,60);
 if(d.type==='transfer'){d.category='Transfer';if(d.account===d.to)return toast('Choose two different accounts')}
 else if(nc){d.category=nc;const l=S.cfg[d.type==='income'?'inc':'exp'];if(!l.includes(nc)){l.push(nc);await saveCfg()}}
 const t=clean(d);if(!t)return toast('Please check the date and amount');
 const parts=[0,1,2,3,4].map(i=>({n:(d['si'+i]||'').trim(),c:d['sc'+i],a:Number(d['sa'+i])||0})).filter(p=>p.a>0);
 if(parts.length&&!t.id&&t.type==='expense'){const ps=Math.round(parts.reduce((x,p)=>x+p.a,0)*100)/100;if(Math.abs(ps-t.amount)>0.009)return toast(`Items add up to ${inr(ps)} but the total is ${inr(t.amount)}`);
  const g='g'+Date.now();for(const p of parts){const x=clean({...d,amount:p.a,category:p.c,desc:(p.n||p.c)+(t.desc?' – '+t.desc:''),grp:g});delete x.id;await putTx(x)}}
 else{if(!t.id)delete t.id;await putTx(t)}
 S.tx=await rq(st('tx').getAll());const a=S.cfg.accounts.find(x=>x.name===t.account);toast('Saved ✓'+(a?` · ${a.name} balance ${inr(accBal(a))}`:''));
 if(d.id)location.hash='#sheet';else render()};
C.fb=()=>{const f=$('#app form');if(!f)return;const d=Object.fromEntries(new FormData(f)),a=S.cfg.accounts.find(x=>x.name===d.account),n=Number(d.amount)||0,el=$('#ab');if(!a||!el||d.id)return;
 const now=accBal(a),after=d.type==='income'?now+n:now-n;el.textContent=`${a.name}: balance ${inr(now)} → after this ${inr(after)}`;el.className=after<0?'neg':'mut'};
P.add=()=>C.fb();
// ---------- CSV helpers ----------
const FIELDS=['date','type','category','desc','party','income','expense','amount','account','to','method','notes'];
const csvParse=t=>{t=t.replace(/^\uFEFF/,'');const r=[];let row=[],c='',q=false;for(let i=0;i<t.length;i++){const h=t[i];if(q){if(h=='"'){if(t[i+1]=='"'){c+='"';i++}else q=false}else c+=h}else if(h=='"')q=true;else if(h==','){row.push(c);c=''}else if(h=='\n'||h=='\r'){if(h=='\r'&&t[i+1]=='\n')i++;row.push(c);r.push(row);row=[];c=''}else c+=h}
 if(c||row.length){row.push(c);r.push(row)}return r.filter(x=>x.some(v=>v.trim()))};
const cell=v=>{v=String(v??'');if(/^[=+\-@\t\r]/.test(v))v="'"+v;return/[",\n\r]/.test(v)?'"'+v.replace(/"/g,'""')+'"':v}; // blocks spreadsheet formula injection
const dl=(name,text,type='text/csv')=>{const a=document.createElement('a');a.href=URL.createObjectURL(new Blob([text],{type}));a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(a.href),1000)};
const toCSV=l=>'\uFEFF'+['Date,Type,Category,Subcategory,Description,Merchant,Income,Expense,Amount,Account,ToAccount,Method,Notes',...l.map(t=>[t.date,t.type,t.category,t.sub,t.desc,t.party,t.type==='income'?t.amount:'',t.type==='expense'?t.amount:'',t.amount,t.account,t.to,t.method,t.notes].map((v,i)=>[6,7,8].includes(i)?v:cell(v)).join(','))].join('\r\n');
const pd=v=>{v=String(v).trim();let m=v.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/),y,mo,d;if(m)[,y,mo,d]=m;else if(m=v.match(/^(\d{1,2})[\/.-](\d{1,2})[\/.-](\d{4})$/))[,d,mo,y]=m;else return'';const s=`${y}-${mo.padStart(2,'0')}-${d.padStart(2,'0')}`;return isNaN(new Date(s))?'':s};
const num=v=>parseFloat(String(v??'').replace(/[₹,\s]/g,''));
const dupKey=t=>[t.date,t.type,t.amount,(t.desc||t.party).toLowerCase()].join('|');
// ---------- My Money Sheet ----------
V.sheet=()=>{const m=S.m||T().slice(0,7),q=S.q||'',ty=S.sty||'',ct=S.sct||'',k=S.sk||'date',dir=S.sd||-1,g=S.g||'day';
 const sorted=[...S.tx].sort((a,b)=>a.date.localeCompare(b.date)||a.id-b.id),bal={};let run=opening();
 sorted.forEach(t=>{run+=t.type==='income'?t.amount:t.type==='expense'?-t.amount:0;bal[t.id]=run});
 const rows=S.tx.filter(t=>t.date.startsWith(m)&&(!ty||t.type===ty)&&(!ct||t.category===ct)&&(!q||[t.desc,t.party,t.category,t.sub,t.notes,t.account].join(' ').toLowerCase().includes(q.toLowerCase())));
 const val=t=>k==='bal'?bal[t.id]:t[k];rows.sort((a,b)=>(val(a)>val(b)?1:val(a)<val(b)?-1:0)*dir);
 const gk=t=>g==='month'?t.date.slice(0,7):g==='week'?wk(t.date):t.date,gm={};
 rows.forEach(t=>{if(t.type==='transfer')return;const x=gm[gk(t)]??={i:0,e:0};t.type==='income'?x.i+=t.amount:x.e+=t.amount});
 const I=sum(rows,'income'),E=sum(rows,'expense'),th=(l,key,r)=>`<th data-a="sort" data-v="${key}" class="${r?'r':''}">${l}${k===key?(dir>0?' ▲':' ▼'):''}</th>`;
 const cats=[...new Set([...S.cfg.inc,...S.cfg.exp])];
 return`<h2>My Money Sheet</h2><div class="bar noprint"><button data-a="mn" data-v="-1">◀</button><input type="month" value="${m}" data-c="sm"><button data-a="mn" data-v="1">▶</button>
 <input type="search" placeholder="Search…" value="${esc(q)}" data-c="sq"><select data-c="sty"><option value="">All types</option>${opt(['income','expense','transfer'],ty)}</select>
 <select data-c="sct"><option value="">All categories</option>${opt(cats,ct)}</select></div>
 <div class="grid"><div class="card"><small>Income</small><b class="inc">${inr(I)}</b></div><div class="card"><small>Expenses</small><b class="exp">${inr(E)}</b></div><div class="card"><small>Net cash flow</small><b>${inr(I-E)}</b></div></div>
 <div class="tw"><table><tr>${th('Date','date')}${th('Type','type')}${th('Category','category')}${th('Description','desc')}${th('Income','amount',1)}<th class="r">Expense</th>${th('Account','account')}${th('Payment Method','method')}${th('Balance','bal',1)}<th class="noprint"></th></tr>
 ${rows.map(t=>`<tr class="${t.type==='transfer'?'mut':''}"><td>${t.date}</td><td>${t.type}</td><td>${esc(t.category)}</td><td>${esc(t.type==='transfer'?`${t.account} → ${t.to}`:t.desc||t.party)}${t.grp?' <span class="mut" title="Part of a split payment">⧉</span>':''}</td><td class="r inc">${t.type==='income'?inr(t.amount):''}</td><td class="r exp">${t.type==='expense'?inr(t.amount):''}</td><td>${esc(t.account)}</td><td>${esc(t.method)}</td><td class="r">${inr(bal[t.id])}</td>
 <td class="noprint"><a href="#add/${t.id}">✏️</a> <button class="del" data-a="del" data-v="${t.id}">🗑</button></td></tr>`).join('')||'<tr><td colspan="10" class="mut">No transactions match.</td></tr>'}</table></div>
 <h3>Totals by <select data-c="sg" class="noprint">${['day','week','month'].map(x=>`<option${x===g?' selected':''}>${x}</option>`).join('')}</select></h3>
 <div class="tw"><table><tr><th>${g}</th><th class="r">Income</th><th class="r">Expense</th><th class="r">Net</th></tr>${Object.entries(gm).sort().reverse().map(([k,x])=>`<tr><td>${k}</td><td class="r inc">${inr(x.i)}</td><td class="r exp">${inr(x.e)}</td><td class="r">${inr(x.i-x.e)}</td></tr>`).join('')}</table></div>
 <div class="bar noprint"><button data-a="exp">⬇ Export CSV (all)</button><button data-a="expm">⬇ Export this month</button><button data-a="print">🖨 Print monthly report</button><label>Import CSV<input type="file" accept=".csv,text/csv" data-c="csvf"></label></div>${S.imp?impUI():''}`};
A.sort=el=>{const k=el.dataset.v;S.sd=S.sk===k?-(S.sd||-1):1;S.sk=k;render()};
A.mn=el=>{S.m=addM(S.m||T().slice(0,7),+el.dataset.v);render()};
C.sm=el=>{if(el.value){S.m=el.value;render()}};C.sq=el=>{S.q=el.value;render()};C.sty=el=>{S.sty=el.value;render()};C.sct=el=>{S.sct=el.value;render()};C.sg=el=>{S.g=el.value;render()};
A.print=()=>print();A.exp=()=>dl('money-all-'+T()+'.csv',toCSV(S.tx));A.expm=()=>dl('money-'+(S.m||T().slice(0,7))+'.csv',toCSV(S.tx.filter(t=>t.date.startsWith(S.m||T().slice(0,7)))));
A.del=async el=>{const t=S.tx.find(x=>x.id===+el.dataset.v),g=t?.grp?S.tx.filter(x=>x.grp===t.grp):[t];if(!t||!confirm(g.length>1?`This is part of a split payment (${g.length} items). Delete ALL items? This cannot be undone.`:'Delete this transaction? This cannot be undone.'))return;for(const x of g)await delTx(x.id);S.tx=await rq(st('tx').getAll());toast('Deleted');render()};
// ---------- CSV import ----------
C.csvf=async el=>{const f=el.files[0];if(!f)return;if(f.size>5e6)return toast('File too large (max 5 MB)');const r=csvParse(await f.text());if(r.length<2)return toast('No data rows found');
 const h=r[0].map(x=>x.trim()),g=n=>h.findIndex(x=>x.toLowerCase().replace(/[^a-z]/g,'').includes(n)),guess={date:g('date'),type:g('type'),category:g('categ'),desc:g('desc')>=0?g('desc'):g('narr'),party:g('merch')>=0?g('merch'):g('payee'),income:g('income')>=0?g('income'):g('credit'),expense:g('expense')>=0?g('expense'):g('debit'),amount:g('amount'),account:g('account'),to:g('toacc'),method:g('method'),notes:g('note')};
 S.imp={h,rows:r.slice(1),map:guess};render()};
const impUI=()=>`<div class="box"><h3>Map your CSV columns</h3><div class="grid">${FIELDS.map(f=>`<label>${f}<select data-c="imap" data-f="${f}"><option value="-1">— none —</option>${S.imp.h.map((x,i)=>`<option value="${i}"${S.imp.map[f]===i?' selected':''}>${esc(x)}</option>`).join('')}</select></label>`).join('')}</div>
 <p class="mut">Need: a date plus either Amount (with Type or negative = expense) or separate Income/Expense columns. Rows with no type default to expense.</p><button class="pri" data-a="impgo">Validate &amp; import</button> <button data-a="impx">Cancel</button></div>`;
C.imap=el=>{S.imp.map[el.dataset.f]=+el.value};A.impx=()=>{S.imp=null;render()};
A.impgo=async()=>{const{rows,map}=S.imp,g=(r,f)=>map[f]>=0?r[map[f]]??'':'',seen=new Set(S.tx.map(dupKey)),ok=[];let bad=0,dup=0;
 for(const r of rows){const inc=num(g(r,'income')),ex=num(g(r,'expense')),am=num(g(r,'amount')),tt=g(r,'type').toLowerCase();let type,a;
  if(inc>0){type='income';a=inc}else if(ex>0){type='expense';a=ex}else if(am){a=Math.abs(am);type=tt.startsWith('inc')?'income':tt.startsWith('tra')?'transfer':tt.startsWith('exp')?'expense':am<0?'expense':'expense'}else{bad++;continue}
  if(tt.startsWith('tra'))type='transfer';
  const t=clean({type,date:pd(g(r,'date')),amount:a,category:g(r,'category'),desc:g(r,'desc'),party:g(r,'party'),account:g(r,'account')||S.cfg.accounts[0].name,to:g(r,'to'),method:g(r,'method'),notes:g(r,'notes')});
  if(!t||(type==='transfer'&&!t.to)){bad++;continue}const k=dupKey(t);if(seen.has(k)){dup++;continue}seen.add(k);ok.push(t)}
 if(!ok.length){S.imp=null;render();return toast(`Nothing imported: ${bad} invalid, ${dup} duplicates`)}
 if(!confirm(`Import ${ok.length} new transactions?\n(${dup} likely duplicates skipped, ${bad} invalid rows skipped)`))return;
 for(const t of ok){for(const[l,c]of[['inc','income'],['exp','expense']])if(t.type===c&&!S.cfg[l].includes(t.category))S.cfg[l].push(t.category);await putTx(t)}
 await saveCfg();S.tx=await rq(st('tx').getAll());S.imp=null;toast(`Imported ${ok.length}`);render()};
// ---------- Analytics ----------
let CH=[];const mkeys=n=>Array.from({length:n},(_,i)=>addM(T().slice(0,7),i-n+1));
const mkc=(id,type,data,x={})=>CH.push(new Chart($('#'+id),{type,data,options:{responsive:true,maintainAspectRatio:false,plugins:{tooltip:{callbacks:{label:c=>`${c.dataset.label||c.label}: ${inr(c.chart.options.indexAxis==='y'?c.parsed.x:c.parsed.y??c.parsed)}`}}},scales:type==='doughnut'?{}:{y:{ticks:{callback:v=>'₹'+v.toLocaleString('en-IN')}}},...x}}));
function insights(){const mk=T().slice(0,7),pk=addM(mk,-1),cur=S.tx.filter(t=>t.date.startsWith(mk)),prv=S.tx.filter(t=>t.date.startsWith(pk));
 if(!cur.length)return['No transactions recorded this month yet, so there is nothing to analyse.'];
 const i=sum(cur,'income'),e=sum(cur,'expense'),o=[],cc=byCat(cur),pc=byCat(prv),tc=ranked(cc);
 o.push(`You recorded ${inr(i)} income and ${inr(e)} expenses this month.`);
 o.push(i>0?`You saved ${inr(i-e)} (${rate(i,e)} of income); recorded expenses are ${(e/i*100).toFixed(1)}% of recorded income.`:'No income is recorded this month, so savings rate and spending share cannot be calculated.');
 if(tc[0])o.push(`${esc(tc[0][0])} costs you the most: ${inr(tc[0][1])}, ${(tc[0][1]/e*100).toFixed(0)}% of recorded expenses.`);
 const big=cur.filter(t=>t.type==='expense').sort((a,b)=>b.amount-a.amount).slice(0,5);if(big.length)o.push('Largest expenses: '+big.map(t=>`${esc(t.desc||t.party||t.category)} ${inr(t.amount)}`).join('; ')+'.');
 const dd={};cur.filter(t=>t.type==='expense').forEach(t=>dd[t.date]=(dd[t.date]||0)+t.amount);const td=ranked(dd).slice(0,3);if(td.length)o.push('Highest spending days: '+td.map(([d,v])=>`${d} (${inr(v)})`).join(', ')+'.');
 if(prv.length){const pe=sum(prv,'expense'),pi=sum(prv,'income');o.push(`Compared with last month: expenses ${e>=pe?'up':'down'} ${inr(Math.abs(e-pe))}, income ${i>=pi?'up':'down'} ${inr(Math.abs(i-pi))}.`);
  Object.keys(cc).filter(k=>pc[k]!==undefined&&cc[k]>pc[k]).forEach(k=>o.push(`You spent ${inr(cc[k]-pc[k])} more on ${esc(k)} than last month.`))}
 else o.push('No data for last month, so month-to-month comparison is not available.');
 const B=S.cfg.budget;o.push(B>0?(e>B?`Your recorded expenses are ${inr(e-B)} above your monthly budget.`:`You are within budget with ${inr(B-e)} remaining.`):'No monthly budget is set, so overspending cannot be assessed.');return o}
V.stats=()=>{const n=S.n||6;return`<h2>Analytics</h2><div class="bar">Show last <select data-c="sn">${[3,6,12].map(x=>`<option${x===n?' selected':''}>${x}</option>`).join('')}</select> months (daily &amp; budget charts use the current month)</div>
 ${S.tx.length?report()+`<div class="box"><h3>What your data says</h3><ul class="ins">${insights().map(x=>`<li>${x}</li>`).join('')}</ul></div><div class="grid" style="grid-template-columns:repeat(auto-fit,minmax(300px,1fr))">
 ${[['c1','Income vs expenses'],['c2','Spending by category'],['c3','Monthly income &amp; expense trend'],['c4','Daily expenses (this month)'],['c5','Monthly savings'],['c6','Budget vs actual (this month)'],['c7','Top 5 expense categories']].map(([i,t])=>`<div class="box"><b>${t}</b><div class="chart"><canvas id="${i}"></canvas></div></div>`).join('')}</div>`:'<p class="mut">Add some transactions to see charts and analysis. Nothing is shown until you have real data.</p>'}`};
C.sn=el=>{S.n=+el.value;render()};C.sy=el=>{S.y=+el.value;render()};
const MN=['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
function report(){const ys=[...new Set([...S.tx.map(t=>+t.date.slice(0,4)),+T().slice(0,4)])].sort((a,b)=>b-a),y=ys.includes(S.y)?S.y:ys[0],yt=S.tx.filter(t=>t.date.startsWith(y+'-')),key=i=>`${y}-${String(i+1).padStart(2,'0')}`;
 const ms=MN.map((_,i)=>{const l=yt.filter(t=>t.date.startsWith(key(i)));return{n:l.length,i:sum(l,'income'),e:sum(l,'expense'),c:ranked(byCat(l))[0],cat:byCat(l)}}),cats=ranked(byCat(yt)).map(x=>x[0]),TI=sum(yt,'income'),TE=sum(yt,'expense');
 const c=(l,v,k='')=>`<div class="card"><small>${l}</small><b class="${k}">${v}</b></div>`;
 return`<div class="box"><h3>Month-by-month report for <select data-c="sy">${ys.map(x=>`<option${x===y?' selected':''}>${x}</option>`).join('')}</select></h3>
 <div class="grid">${c('Year income',inr(TI),'inc')}${c('Year expenses',inr(TE),'exp')}${c('Year saved',inr(TI-TE),TI-TE<0?'neg':'pos')}${c('Saving rate',rate(TI,TE))}</div>
 <div class="tw"><table><tr><th>Month</th><th class="r">Income</th><th class="r">Expenses</th><th class="r">Saved</th><th class="r">Saving rate</th><th>Top category</th></tr>
 ${ms.map((m,i)=>m.n?`<tr><td>${MN[i]}</td><td class="r inc">${inr(m.i)}</td><td class="r exp">${inr(m.e)}</td><td class="r">${inr(m.i-m.e)}</td><td class="r">${rate(m.i,m.e)}</td><td>${m.c?esc(m.c[0])+' · '+inr(m.c[1]):'-'}</td></tr>`:`<tr class="mut"><td>${MN[i]}</td><td colspan="5">No data</td></tr>`).join('')}
 <tr><th>${y}</th><th class="r">${inr(TI)}</th><th class="r">${inr(TE)}</th><th class="r">${inr(TI-TE)}</th><th class="r">${rate(TI,TE)}</th><th></th></tr></table></div>
 <h3>Spending by category and month</h3><div class="tw"><table><tr><th>Category</th>${MN.map(m=>`<th class="r">${m}</th>`).join('')}<th class="r">Total</th></tr>
 ${cats.map(k=>`<tr><td>${esc(k)}</td>${ms.map(m=>`<td class="r">${m.cat[k]?inr(m.cat[k]).slice(1):''}</td>`).join('')}<th class="r">${inr(ms.reduce((x,m)=>x+(m.cat[k]||0),0))}</th></tr>`).join('')||'<tr><td class="mut">No expenses this year</td></tr>'}</table></div></div>`}
P.stats=()=>{CH.forEach(c=>c.destroy());CH=[];if(!S.tx.length)return;Chart.defaults.color=getComputedStyle(document.body).color;
 const n=S.n||6,ks=mkeys(n),inc=ks.map(k=>sum(S.tx.filter(t=>t.date.startsWith(k)),'income')),ex=ks.map(k=>sum(S.tx.filter(t=>t.date.startsWith(k)),'expense')),G='#16a34a',R='#ea580c';
 const two=[{label:'Income',data:inc,backgroundColor:G,borderColor:G},{label:'Expenses',data:ex,backgroundColor:R,borderColor:R}];
 mkc('c1','bar',{labels:ks,datasets:two});
 const rc=byCat(S.tx.filter(t=>t.date.slice(0,7)>=ks[0])),tc=ranked(rc);
 mkc('c2','doughnut',{labels:tc.map(x=>x[0]),datasets:[{data:tc.map(x=>x[1]),backgroundColor:['#ea580c','#f59e0b','#16a34a','#0ea5e9','#6366f1','#d946ef','#64748b','#84cc16','#14b8a6','#f43f5e','#a16207','#0f766e','#7c3aed']}]});
 mkc('c3','line',{labels:ks,datasets:two.map(d=>({...d,backgroundColor:d.borderColor,tension:.25}))});
 const mk=T().slice(0,7),dm=new Date(+mk.slice(0,4),+mk.slice(5),0).getDate(),days=Array.from({length:dm},(_,i)=>`${mk}-${String(i+1).padStart(2,'0')}`);
 mkc('c4','bar',{labels:days.map(d=>+d.slice(8)),datasets:[{label:'Expenses',data:days.map(d=>sum(S.tx.filter(t=>t.date===d),'expense')),backgroundColor:R}]});
 mkc('c5','line',{labels:ks,datasets:[{label:'Savings',data:ks.map((k,i)=>inc[i]-ex[i]),borderColor:G,backgroundColor:G,tension:.25}]});
 const cur=byCat(S.tx.filter(t=>t.date.startsWith(mk))),bk=Object.keys(S.cfg.cb).filter(k=>S.cfg.cb[k]>0);
 if(bk.length)mkc('c6','bar',{labels:bk,datasets:[{label:'Budget',data:bk.map(k=>S.cfg.cb[k]),backgroundColor:'#94a3b8'},{label:'Actual',data:bk.map(k=>cur[k]||0),backgroundColor:R}]});
 else $('#c6').parentElement.innerHTML='<p class="mut">Set category budgets in Budgets to compare.</p>';
 const t5=tc.slice(0,5);mkc('c7','bar',{labels:t5.map(x=>x[0]),datasets:[{label:'Spent',data:t5.map(x=>x[1]),backgroundColor:R}]},{indexAxis:'y',scales:{}})};
// ---------- Budgets & goals ----------
const bar=(u,l)=>{const p=l>0?u/l*100:0;return`<div class="prog"><i class="${p>=100?'x':p>=80?'w':''}" style="width:${Math.min(p,100)}%"></i></div>`};
V.budget=()=>{const mo=S.tx.filter(t=>t.date.startsWith(T().slice(0,7))),cc=byCat(mo),me=sum(mo,'expense'),B=S.cfg.budget;
 return`<h2>Budgets &amp; Goals</h2><div class="box"><label>Monthly expense budget (₹)<input type="number" min="0" step="1" value="${B||''}" data-c="mb"></label>${B>0?`${bar(me,B)}<p>${inr(me)} of ${inr(B)} used · remaining ${inr(B-me)}</p>${warn(me,B,'Monthly budget')}`:''}</div>
 <h3>Category budgets (this month)</h3><div class="grid">${S.cfg.exp.map(k=>{const l=S.cfg.cb[k]||0,u=cc[k]||0;return`<div class="box"><label>${esc(k)}<input type="number" min="0" step="1" value="${l||''}" data-c="cb" data-k="${esc(k)}"></label>${l>0?bar(u,l)+`<small>${inr(u)} / ${inr(l)} · left ${inr(l-u)}</small>`+warn(u,l,k):''}</div>`}).join('')}</div>
 <h3>Savings goals</h3><form data-s="goal" class="bar"><input name="n" placeholder="Goal name" required maxlength="60"><input name="t" type="number" min="1" step="1" placeholder="Target ₹" required><input name="s" type="number" min="0" step="1" placeholder="Saved so far ₹"><button class="pri">Add goal</button></form>
 <div class="grid">${S.cfg.goals.map((g,i)=>`<div class="box"><b>${esc(g.n)}</b>${bar(g.s,g.t)}<p>${inr(g.s)} of ${inr(g.t)} (${Math.min(100,g.s/g.t*100).toFixed(0)}%) · remaining ${inr(Math.max(0,g.t-g.s))}</p><div class="bar"><input id="ga${i}" type="number" min="1" placeholder="Add ₹" style="width:90px"><button data-a="gadd" data-v="${i}">Add</button><button class="del" data-a="gdel" data-v="${i}">🗑</button></div></div>`).join('')||'<p class="mut">No goals yet.</p>'}</div>`};
function rdInfo(p){const n=S.tx.filter(t=>t.pl===p.id).length;let h=`<br><small>Installments paid: <b>${n}</b>${p.tenure?` of ${p.tenure} · remaining <b>${Math.max(0,p.tenure-n)}</b>`:''}</small>`;
 if(p.tenure&&p.start){const[y,m,d]=p.start.split('-').map(Number);h+=`<br><small>Matures on: <b>${new Date(y,m-1+p.tenure,d).toLocaleDateString('sv')}</b></small>`;
  if(p.rate>=0&&p.rate!==''&&p.rate!=null){const i=p.rate/400,q=p.tenure/3,M=p.rate>0?p.amount*(Math.pow(1+i,q)-1)/(1-Math.pow(1+i,-1/3)):p.amount*p.tenure;h+=`<br><small>Expected maturity amount: <b>≈ ${inr(M)}</b> (estimate at ${p.rate}% — your bank may differ)</small>`}}
 return h}
function plansUI(){const ac=S.cfg.accounts.map(a=>a.name).filter(n=>!SP(n)),pl=S.cfg.plans||[];
 return`<h2>Recurring deposit (RD) &amp; monthly savings</h2><p class="mut">Put a fixed amount into your RD every month. Tap <b>Mark as paid</b> when you pay it. The money leaves your spendable balance and is added to the RD balance.</p>
 <div class="grid">${pl.map(p=>{const t=planPaid(p),to=S.cfg.accounts.find(a=>a.name===p.to);return`<div class="box"><b>${esc(p.name)} · ${inr(p.amount)} / month</b><br><small class="mut">${esc(p.from)} → ${esc(p.to)} · due on day ${p.day}</small><p>${t?`<span class="pos">✅ Paid on ${t.date}</span>`:'<span class="neg">⏳ Not paid this month</span>'}</p>${to?`<small>${esc(to.name)} balance so far: <b>${inr(accBal(to))}</b></small>`:''}${rdInfo(p)}<div class="bar">${t?`<button data-a="punpay" data-v="${p.id}">Undo</button>`:`<button class="pri" data-a="ppay" data-v="${p.id}">Mark as paid</button>`}<button class="del" data-a="pdel" data-v="${p.id}">🗑</button></div></div>`}).join('')||'<p class="mut">No RD yet. Add one below.</p>'}</div>
 <form data-s="plan" class="grid"><label>RD name<input name="n" value="RD" required maxlength="60"></label><label>Amount per month (₹)<input name="a" type="number" min="1" step="0.01" required placeholder="100"></label><label>Paid from<select name="from">${opt(ac)}</select></label><label>Due day of month<input name="day" type="number" min="1" max="28" value="1"></label><label>Start date<input name="start" type="date" value="${T()}"></label><label>Tenure in months (optional)<input name="tenure" type="number" min="1" max="240" placeholder="12"></label><label>Interest % per year (optional)<input name="rate" type="number" min="0" max="30" step="0.01" placeholder="6.5"></label><button class="pri">Start monthly RD</button></form>`}
F.plan=async f=>{const d=Object.fromEntries(new FormData(f)),a=Number(d.a),to=d.n.trim().slice(0,60);if(!(a>0)||!to||to===d.from)return toast('Enter a name and a positive amount');
 if(!S.cfg.accounts.some(x=>x.name===to))S.cfg.accounts.push({name:to,open:0});(S.cfg.plans=S.cfg.plans||[]).push({id:'p'+Date.now(),name:to,amount:a,from:d.from,start:/^\d{4}-\d{2}-\d{2}$/.test(d.start||'')?d.start:T(),tenure:Math.max(0,Math.min(240,Math.round(+d.tenure||0))),rate:d.rate===''||d.rate==null?'':Math.max(0,+d.rate||0),to,day:Math.min(28,Math.max(1,+d.day||1))});await saveCfg();toast('RD added');render()};
function incomeUI(){const ac=S.cfg.accounts.map(a=>a.name).filter(n=>!SP(n)),ips=S.cfg.ips||[];
 return`<h2>Fixed monthly income</h2><p class="mut">Income that comes every month (salary, freelancing, rent received). Tap <b>Received</b> when the money arrives and it is added automatically.</p>
 <div class="grid">${ips.map(p=>{const t=incGot(p);return`<div class="box"><b>${esc(p.name)} · ${inr(p.amount)} / month</b><br><small class="mut">${esc(p.category)} → ${esc(p.account)} · expected on day ${p.day}</small><p>${t?`<span class="pos">✅ Received on ${t.date}</span>`:'<span class="neg">⏳ Not received yet this month</span>'}</p><div class="bar">${t?`<button data-a="iundo" data-v="${p.id}">Undo</button>`:`<button class="pri" data-a="igot" data-v="${p.id}">Received</button>`}<button class="del" data-a="idel" data-v="${p.id}">🗑</button></div></div>`}).join('')||'<p class="mut">None yet. Add one below.</p>'}</div>
 <form data-s="ip" class="grid"><label>Name<input name="n" placeholder="Salary" required maxlength="60"></label><label>Amount per month (₹)<input name="a" type="number" min="1" step="0.01" required></label><label>Category<select name="c">${opt(S.cfg.inc)}</select></label><label>…or new category<input name="newc" maxlength="60" placeholder="e.g. Freelance work"></label><label>Money goes to<select name="acc">${opt(ac)}</select></label><label>Expected day<input name="day" type="number" min="1" max="28" value="1"></label><button class="pri">Add fixed income</button></form>`}
F.ip=async f=>{const d=Object.fromEntries(new FormData(f)),a=Number(d.a),nc=(d.newc||'').trim().slice(0,60),c=nc||d.c;if(!(a>0))return toast('Enter a positive amount');if(!S.cfg.inc.includes(c))S.cfg.inc.splice(Math.max(0,S.cfg.inc.length-1),0,c);
 (S.cfg.ips=S.cfg.ips||[]).push({id:'i'+Date.now(),name:d.n.trim().slice(0,60),amount:a,category:c,account:d.acc,day:Math.min(28,Math.max(1,+d.day||1))});await saveCfg();toast('Added');render()};
A.igot=async el=>{const p=S.cfg.ips.find(x=>x.id===el.dataset.v);if(!p||incGot(p))return;const t=clean({type:'income',date:T(),amount:p.amount,category:p.category,desc:p.name,party:p.name,account:p.account,method:'Bank transfer',ip:p.id});delete t.id;await putTx(t);S.tx=await rq(st('tx').getAll());toast(`${p.name} received ✓`);render()};
A.iundo=async el=>{const p=S.cfg.ips.find(x=>x.id===el.dataset.v),t=p&&incGot(p);if(t&&confirm('Mark as not received? The income entry will be removed.')){await delTx(t.id);S.tx=await rq(st('tx').getAll());render()}};
A.idel=async el=>{if(confirm('Delete this fixed income? Past entries stay in your records.')){S.cfg.ips=S.cfg.ips.filter(x=>x.id!==el.dataset.v);await saveCfg();render()}};
function srcUI(){const m=S.tx.filter(t=>t.date.startsWith(T().slice(0,7))),rows=S.cfg.inc.map(k=>({k,r:sum(m.filter(t=>t.category===k),'income'),s:sum(m.filter(t=>t.src===k),'expense')})).filter(x=>x.r||x.s);
 return`<h2>Money by source (this month)</h2><p class="mut">When you add an expense, choose “Paid with money from” to link it to a source such as your salary or side income.</p>${rows.length?`<div class="tw"><table><tr><th>Source</th><th class="r">Received</th><th class="r">Spent from it</th><th class="r">Left</th></tr>${rows.map(x=>`<tr><td>${esc(x.k)}</td><td class="r inc">${inr(x.r)}</td><td class="r exp">${inr(x.s)}</td><td class="r ${x.r-x.s<0?'neg':''}">${inr(x.r-x.s)}</td></tr>`).join('')}</table></div>`:'<p class="mut">No data yet.</p>'}`}
function billsUI(){const ac=S.cfg.accounts.map(a=>a.name).filter(n=>!SP(n)),bl=S.cfg.bills||[];
 return`<h2>Monthly bills</h2><p class="mut">Rent, phone, subscriptions… Tap <b>Mark as paid</b> and it is added as an expense.</p><div class="grid">${bl.map(b=>{const t=billPaid(b);return`<div class="box"><b>${esc(b.name)} · ${inr(b.amount)} / month</b><br><small class="mut">${esc(b.category)} · from ${esc(b.account)} · due on day ${b.day}</small><p>${t?`<span class="pos">✅ Paid on ${t.date}</span>`:'<span class="neg">⏳ Not paid this month</span>'}</p><div class="bar">${t?`<button data-a="bundo" data-v="${b.id}">Undo</button>`:`<button class="pri" data-a="bpay" data-v="${b.id}">Mark as paid</button>`}<button class="del" data-a="bdel" data-v="${b.id}">🗑</button></div></div>`}).join('')||'<p class="mut">None yet. Add one below.</p>'}</div>
 <form data-s="bill" class="grid"><label>Bill name<input name="n" placeholder="Rent" required maxlength="60"></label><label>Amount (₹)<input name="a" type="number" min="1" step="0.01" required></label><label>Category<select name="c">${opt(S.cfg.exp,'Bills and utilities')}</select></label><label>Paid from<select name="acc">${opt(ac)}</select></label><label>Payment method<select name="m">${opt(METHODS,'UPI')}</select></label><label>Due day<input name="day" type="number" min="1" max="28" value="1"></label><button class="pri">Add bill</button></form>`}
F.bill=async f=>{const d=Object.fromEntries(new FormData(f)),a=Number(d.a);if(!(a>0))return toast('Enter a positive amount');(S.cfg.bills=S.cfg.bills||[]).push({id:'b'+Date.now(),name:d.n.trim().slice(0,60),amount:a,category:d.c,account:d.acc,method:d.m,day:Math.min(28,Math.max(1,+d.day||1))});await saveCfg();toast('Added');render()};
A.bpay=async el=>{const b=S.cfg.bills.find(x=>x.id===el.dataset.v);if(!b||billPaid(b))return;const t=clean({type:'expense',date:T(),amount:b.amount,category:b.category,desc:b.name,party:b.name,account:b.account,method:b.method,bl:b.id});delete t.id;await putTx(t);S.tx=await rq(st('tx').getAll());toast(`${b.name} paid ✓`);render()};
A.bundo=async el=>{const b=S.cfg.bills.find(x=>x.id===el.dataset.v),t=b&&billPaid(b);if(t&&confirm('Mark as not paid? The expense will be removed.')){await delTx(t.id);S.tx=await rq(st('tx').getAll());render()}};
A.bdel=async el=>{if(confirm('Delete this bill? Past payments stay in your records.')){S.cfg.bills=S.cfg.bills.filter(x=>x.id!==el.dataset.v);await saveCfg();render()}};
V.plan=()=>incomeUI()+plansUI()+billsUI()+srcUI();
V.loan=()=>{const lo=S.cfg.loans||[],ac=S.cfg.accounts.map(a=>a.name).filter(n=>!SP(n));
 const row=l=>{const left=loanLeft(l),od=left>0&&l.due&&l.due<T();return`<div class="box"><b>${l.dir==='lent'?'Lent to':'Borrowed from'} ${esc(l.who)} · ${inr(l.amount)}</b><br><small class="mut">${l.date}${l.due?' · return by '+l.due:''}${l.note?' · '+esc(l.note):''}</small><p>${left<=0?'<span class="pos">✅ Fully returned</span>':`<span class="${od?'neg':''}">${od?'⚠ Overdue · ':''}${l.dir==='lent'?'Still to get back':'Still to pay back'}: <b>${inr(left)}</b></span>`}</p>${left>0?`<div class="bar"><input id="lr${l.id}" type="number" min="0.01" step="0.01" value="${left}" style="width:110px"><button class="pri" data-a="lret" data-v="${l.id}">${l.dir==='lent'?'Received back':'Paid back'}</button></div>`:''}<button class="del" data-a="ldel" data-v="${l.id}">🗑 Delete</button></div>`};
 return`<h2>Lent &amp; Owed</h2><p class="mut">Track money you lent or borrowed. It moves between your account and a tracking account, so it is never counted as income or expense.</p>
 <div class="grid"><div class="card"><small>To get back</small><b class="pos">${inr(owed('lent'))}</b></div><div class="card"><small>To pay back</small><b class="neg">${inr(owed('borrowed'))}</b></div></div>
 <h3>Pending</h3><div class="grid">${lo.filter(l=>loanLeft(l)>0).map(row).join('')||'<p class="mut">Nothing pending.</p>'}</div>
 <h3>Add new</h3><form data-s="loan" class="grid"><label>Type<select name="dir"><option value="lent">I lent money</option><option value="borrowed">I borrowed money</option></select></label><label>Person<input name="who" required maxlength="60"></label><label>Amount (₹)<input name="a" type="number" min="1" step="0.01" required></label><label>Date<input name="date" type="date" value="${T()}" required></label><label>Return by (optional)<input name="due" type="date"></label><label>Account<select name="acc">${opt(ac)}</select></label><label>Note<input name="note" maxlength="100"></label><button class="pri">Save</button></form>
 <h3>Returned</h3><div class="grid">${lo.filter(l=>loanLeft(l)<=0).map(row).join('')||'<p class="mut">None yet.</p>'}</div>`};
F.loan=async f=>{const d=Object.fromEntries(new FormData(f)),a=Number(d.a),ok=v=>/^\d{4}-\d{2}-\d{2}$/.test(v||'');if(!(a>0)||!ok(d.date))return toast('Check the amount and date');const lent=d.dir==='lent',pool=lent?'Money lent':'Money borrowed';
 if(!S.cfg.accounts.some(x=>x.name===pool))S.cfg.accounts.push({name:pool,open:0});const l={id:'l'+Date.now(),dir:d.dir,who:d.who.trim().slice(0,60),amount:a,date:d.date,due:ok(d.due)?d.due:'',account:d.acc,note:(d.note||'').trim().slice(0,100)};
 const t=clean({type:'transfer',date:l.date,amount:a,category:'Transfer',desc:(lent?'Lent to ':'Borrowed from ')+l.who,account:lent?d.acc:pool,to:lent?pool:d.acc,method:'Other',ln:l.id});delete t.id;await putTx(t);(S.cfg.loans=S.cfg.loans||[]).push(l);await saveCfg();S.tx=await rq(st('tx').getAll());toast('Saved ✓');render()};
A.lret=async el=>{const l=S.cfg.loans.find(x=>x.id===el.dataset.v),amt=Math.round(Number($('#lr'+l.id).value)*100)/100,left=loanLeft(l);if(!(amt>0)||amt>left+0.001)return toast(`Enter an amount up to ${inr(left)}`);const lent=l.dir==='lent',pool=lent?'Money lent':'Money borrowed';
 const t=clean({type:'transfer',date:T(),amount:amt,category:'Transfer',desc:(lent?'Received back from ':'Paid back to ')+l.who,account:lent?pool:l.account,to:lent?l.account:pool,method:'Other',ln:l.id,lr:1});delete t.id;await putTx(t);S.tx=await rq(st('tx').getAll());toast('Saved ✓');render()};
A.ldel=async el=>{if(!confirm('Delete this record and its transfers? Balances will be corrected.'))return;const id=el.dataset.v;for(const t of S.tx.filter(x=>x.ln===id))await delTx(t.id);S.cfg.loans=S.cfg.loans.filter(x=>x.id!==id);await saveCfg();S.tx=await rq(st('tx').getAll());render()};
A.ppay=async el=>{const p=S.cfg.plans.find(x=>x.id===el.dataset.v);if(!p||planPaid(p))return;const t=clean({type:'transfer',date:T(),amount:p.amount,category:'Transfer',desc:p.name+' installment',account:p.from,to:p.to,method:'Bank transfer',pl:p.id});delete t.id;await putTx(t);S.tx=await rq(st('tx').getAll());
 const a=S.cfg.accounts.find(x=>x.name===p.to);toast(`${p.name} paid ✓ · ${p.to} balance ${inr(a?accBal(a):0)}`);render()};
A.punpay=async el=>{const p=S.cfg.plans.find(x=>x.id===el.dataset.v),t=p&&planPaid(p);if(t&&confirm('Mark as not paid? The transfer will be removed.')){await delTx(t.id);S.tx=await rq(st('tx').getAll());render()}};
A.pdel=async el=>{if(confirm('Delete this monthly set-aside? Past payments stay in your records.')){S.cfg.plans=S.cfg.plans.filter(x=>x.id!==el.dataset.v);await saveCfg();render()}};
C.mb=async el=>{S.cfg.budget=Math.max(0,+el.value||0);await saveCfg();render()};C.cb=async el=>{const v=Math.max(0,+el.value||0);v?S.cfg.cb[el.dataset.k]=v:delete S.cfg.cb[el.dataset.k];await saveCfg();render()};
F.goal=async f=>{const d=Object.fromEntries(new FormData(f)),t=+d.t;if(!(t>0))return;S.cfg.goals.push({n:d.n.trim().slice(0,60),t,s:Math.max(0,+d.s||0)});await saveCfg();render()};
A.gadd=async el=>{const v=+$('#ga'+el.dataset.v).value;if(v>0){S.cfg.goals[+el.dataset.v].s+=v;await saveCfg();render()}};
A.gdel=async el=>{if(confirm('Delete this goal?')){S.cfg.goals.splice(+el.dataset.v,1);await saveCfg();render()}};
// ---------- Crypto (Web Crypto: PBKDF2 + AES-GCM, built into the browser) ----------
const b64=b=>{let s='';new Uint8Array(b).forEach(c=>s+=String.fromCharCode(c));return btoa(s)},ub=s=>Uint8Array.from(atob(s),c=>c.charCodeAt(0)),IT=600000;
const pk=async(pw,salt,it)=>crypto.subtle.importKey('raw',new TextEncoder().encode(pw),'PBKDF2',false,['deriveKey','deriveBits']);
const aes=async(pw,salt,it)=>crypto.subtle.deriveKey({name:'PBKDF2',salt,iterations:it,hash:'SHA-256'},await pk(pw),{name:'AES-GCM',length:256},false,['encrypt','decrypt']);
const hashPw=async(pw,salt,it)=>b64(await crypto.subtle.deriveBits({name:'PBKDF2',salt,iterations:it,hash:'SHA-256'},await pk(pw),256));
const needCrypto=()=>crypto?.subtle?true:(toast('Encryption needs http://localhost or https (not a plain LAN address)'),false);
// ---------- Settings & backups ----------
V.set=()=>`<h2>Settings &amp; Backups</h2>
 <div class="box"><h3>Appearance</h3><select data-c="theme">${['auto','light','dark'].map(x=>`<option${x===S.cfg.theme?' selected':''}>${x}</option>`).join('')}</select></div>
 <div class="box"><h3>Accounts &amp; opening balances</h3><div class="grid">${S.cfg.accounts.map((a,i)=>`<label>${esc(a.name)} (opening ₹)<input type="number" step="0.01" value="${a.open}" data-c="open" data-i="${i}"></label>`).join('')}</div>
 <form data-s="acc" class="bar"><input name="n" placeholder="New account (e.g. SBI Savings)" required maxlength="60"><input name="o" type="number" step="0.01" placeholder="Opening ₹"><button>Add account</button></form><small class="mut">UPI is a payment method, not an account.</small></div>
 <div class="box"><h3>Custom categories</h3><form data-s="cat" class="bar"><input name="n" placeholder="Category name" required maxlength="60"><select name="t"><option value="exp">Expense</option><option value="inc">Income</option></select><button>Add</button></form></div>
 <div class="box"><h3>Login &amp; app lock</h3><label>Your name (shown on the Dashboard)<input value="${esc(S.cfg.name||'')}" data-c="uname" maxlength="40"></label>
 ${S.locked?`<div class="bar"><button data-a="locknow">🔒 Lock now</button><label>Auto-lock after<select data-c="autolock">${[[0,'Never'],[1,'1 minute'],[5,'5 minutes'],[15,'15 minutes']].map(([v,l])=>`<option value="${v}"${(S.cfg.autolock||0)===v?' selected':''}>${l}</option>`).join('')}</select></label><button data-a="unlockoff">Remove login</button></div>`:'<form data-s="lock" class="bar"><input name="p" type="password" minlength="6" placeholder="Create a login password (6+ characters)" required autocomplete="new-password"><button>Turn on login</button></form>'}
 <p class="mut">The login asks for your password each time you open the app. It hides the app on this device; it does not encrypt data stored in the browser, so keep your phone/laptop locked too. A forgotten password cannot be recovered: you would have to clear the site data and restore a backup. Each device has its own login and data.</p></div>
 <div class="box"><h3>Backup &amp; restore</h3><div class="bar"><button data-a="bk">⬇ Plain backup (.json)</button><input id="bpw" type="password" placeholder="Backup password" autocomplete="new-password"><button class="pri" data-a="bke">🔐 Encrypted backup</button></div>
 <div class="bar"><label>Restore from file<input type="file" accept=".json" data-c="rest"></label><input id="rpw" type="password" placeholder="Password (if encrypted)"></div>
 <p class="mut">Last backup: <b>${S.cfg.lastBackup||'never'}</b>. Keep copies on a pen drive or in a folder you control, and make a new one weekly. Nothing is uploaded automatically. If you forget a backup password it cannot be recovered.</p></div>
 <div class="box"><h3>Delete everything</h3><form data-s="wipe" class="bar"><input name="c" placeholder='Type DELETE' required><button class="del">Delete all my data</button></form></div>`;
C.theme=async el=>{S.cfg.theme=el.value;document.documentElement.dataset.theme=el.value;await saveCfg()};
C.open=async el=>{S.cfg.accounts[+el.dataset.i].open=+el.value||0;await saveCfg();toast('Saved')};
F.acc=async f=>{const d=Object.fromEntries(new FormData(f)),n=d.n.trim().slice(0,60);if(S.cfg.accounts.some(a=>a.name===n))return toast('Account exists');S.cfg.accounts.push({name:n,open:+d.o||0});await saveCfg();render()};
F.cat=async f=>{const d=Object.fromEntries(new FormData(f)),n=d.n.trim().slice(0,60);if(n&&!S.cfg[d.t].includes(n)){S.cfg[d.t].push(n);await saveCfg();toast('Added')}f.reset()};
F.lock=async f=>{if(!needCrypto())return;const p=new FormData(f).get('p'),salt=crypto.getRandomValues(new Uint8Array(16));await setKV('lock',{salt:b64(salt),it:IT,h:await hashPw(p,salt,IT)});S.locked=true;toast('Lock set');render()};
C.uname=async el=>{S.cfg.name=el.value.trim().slice(0,40);await saveCfg()};C.autolock=async el=>{S.cfg.autolock=+el.value;await saveCfg()};A.locknow=()=>lockScreen();
async function lockScreen(){const L=await getKV('lock');if(!L)return;$('#lock').hidden=false;$('#lp').value='';$('#le').textContent='';$('#lock h2').textContent='🔒 '+(S.cfg.name?'Welcome, '+S.cfg.name:'Locked');
 await new Promise(res=>{$('#lf').onsubmit=async e=>{e.preventDefault();try{if(await hashPw($('#lp').value,ub(L.salt),L.it)===L.h){$('#lock').hidden=true;S.act=Date.now();res()}else $('#le').textContent='Wrong password'}catch{$('#le').textContent='Cannot verify here (needs localhost/https)'}}})}
A.unlockoff=async()=>{if(confirm('Remove the app lock?')){await rq(st('kv','readwrite').delete('lock'));S.locked=false;render()}};
const snap=()=>JSON.stringify({app:'moneysheet',v:1,date:T(),cfg:S.cfg,tx:S.tx});
A.bk=()=>{S.cfg.lastBackup=T();saveCfg();dl('money-backup-'+T()+'.json',snap(),'application/json')};
A.bke=async()=>{const pw=$('#bpw').value;if(pw.length<8)return toast('Use a password of 8+ characters');if(!needCrypto())return;S.cfg.lastBackup=T();saveCfg();const salt=crypto.getRandomValues(new Uint8Array(16)),iv=crypto.getRandomValues(new Uint8Array(12));
 const ct=await crypto.subtle.encrypt({name:'AES-GCM',iv},await aes(pw,salt,IT),new TextEncoder().encode(snap()));dl('money-backup-'+T()+'.enc.json',JSON.stringify({app:'moneysheet',enc:1,it:IT,salt:b64(salt),iv:b64(iv),data:b64(ct)}),'application/json');toast('Encrypted backup downloaded')};
C.rest=async el=>{const f=el.files[0];if(!f)return;try{let j=JSON.parse(await f.text());if(j.app!=='moneysheet')throw 0;
  if(j.enc){if(!needCrypto())return;j=JSON.parse(new TextDecoder().decode(await crypto.subtle.decrypt({name:'AES-GCM',iv:ub(j.iv)},await aes($('#rpw').value,ub(j.salt),j.it),ub(j.data))))}
  if(!Array.isArray(j.tx)||!j.cfg||!Array.isArray(j.cfg.accounts))throw 0;const tx=j.tx.map(clean);if(tx.some(t=>!t||!t.id))throw 0;
  if(!confirm(`This backup has ${tx.length} transactions. Restoring will REPLACE all current data. Continue?`))return;
  await rq(st('tx','readwrite').clear());for(const t of tx)await putTx(t);S.cfg={...structuredClone(D),...j.cfg};await saveCfg();await load();toast('Restored ✓');render()}catch{toast('Invalid file, damaged backup, or wrong password')}el.value=''};
F.wipe=async f=>{if(new FormData(f).get('c')!=='DELETE')return toast('Type DELETE exactly');if(!confirm('Permanently delete ALL data on this device? Download a backup first if unsure.'))return;
 await rq(st('tx','readwrite').clear());await rq(st('kv','readwrite').clear());await load();S.locked=false;toast('All data deleted');render()};
// ---------- calculator ----------
function calc(s){const t=s.match(/\d+\.?\d*|\.\d+|[+\-*\/()]/g)||[];let i=0;const e=()=>{let v=m();while(t[i]=='+'||t[i]=='-'){const o=t[i++],r=m();v=o=='+'?v+r:v-r}return v},m=()=>{let v=u();while(t[i]=='*'||t[i]=='/'){const o=t[i++],r=u();v=o=='*'?v*r:v/r}return v},u=()=>{if(t[i]=='-'){i++;return-u()}if(t[i]=='('){i++;const v=e();i++;return v}return parseFloat(t[i++])};const v=e();return isFinite(v)?Math.round(v*100)/100:NaN}
const ev=s=>calc(s.replace(/×/g,'*').replace(/÷/g,'/').replace(/−/g,'-'));
$('#calc').innerHTML=`<input id="cd" readonly aria-label="Calculator display"><div class="ck">${['C','(',')','⌫','7','8','9','÷','4','5','6','×','1','2','3','−','0','.','=','+'].map(k=>`<button type="button" data-k="${k}">${k}</button>`).join('')}</div><div class="bar"><button type="button" id="cuse" class="pri">Use as amount</button><button type="button" id="cx">Close</button></div>`;
$('#cbtn').onclick=()=>{$('#calc').hidden=!$('#calc').hidden};$('#cx').onclick=()=>{$('#calc').hidden=true};
$('#calc').onclick=e=>{const k=e.target.dataset.k,d=$('#cd');if(!k)return;if(d.value==='Error')d.value='';if(k==='C')d.value='';else if(k==='⌫')d.value=d.value.slice(0,-1);else if(k==='='){const v=ev(d.value);d.value=isNaN(v)?'Error':String(v)}else d.value+=k};
$('#cuse').onclick=()=>{const v=ev($('#cd').value),a=$('#app [name=amount]');if(a&&!isNaN(v)&&v>0){a.value=v;a.dispatchEvent(new Event('input',{bubbles:true}));$('#calc').hidden=true}else toast('Open Add Transaction and calculate a positive amount first')};
// ---------- router & start ----------
const NAV=[['dash','Dashboard'],['add','Add Transaction'],['sheet','My Money Sheet'],['stats','Analytics'],['budget','Budgets'],['plan','Monthly Plan'],['loan','Lent & Owed'],['set','Settings and Backups']];
function render(){const[v,arg]=(location.hash.slice(1)||'dash').split('/'),k=V[v]?v:'dash';$('#nav').innerHTML=NAV.map(([i,l])=>`<a href="#${i}" class="${i===k?'on':''}">${l}</a>`).join('');$('#app').innerHTML=V[k](arg);P[k]?.()}
const app=$('#app');
app.onclick=e=>{const el=e.target.closest('[data-a]');if(el)A[el.dataset.a](el)};
app.onchange=e=>{const el=e.target.closest('[data-c]');if(el)C[el.dataset.c](el)};
app.onsubmit=e=>{e.preventDefault();F[e.target.dataset.s](e.target)};
app.oninput=e=>{if(e.target.matches('[data-c=fb]'))C.fb()};
addEventListener('hashchange',render);
(async()=>{await openDB();await load();const L=await getKV('lock');S.locked=!!L;
 await lockScreen();
 S.act=Date.now();['click','keydown','touchstart'].forEach(ev=>addEventListener(ev,()=>{S.act=Date.now()}));setInterval(()=>{if(S.locked&&S.cfg.autolock>0&&$('#lock').hidden&&Date.now()-S.act>S.cfg.autolock*60000)lockScreen()},15000);
 render();if('serviceWorker'in navigator&&location.protocol.startsWith('http'))navigator.serviceWorker.register('sw.js').catch(()=>{})})();
