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
 budget:0,cb:{},goals:[],theme:'auto'};
const METHODS=['Cash','UPI','Debit card','Credit card','Bank transfer','Other'];
const S={tx:[],cfg:{}},V={},P={},A={},C={},F={};
// ---------- storage (IndexedDB, stays on this device) ----------
let db;
const openDB=()=>new Promise((res,rej)=>{const r=indexedDB.open('moneydb',1);r.onupgradeneeded=()=>{r.result.createObjectStore('tx',{keyPath:'id',autoIncrement:true});r.result.createObjectStore('kv')};r.onsuccess=()=>{db=r.result;res()};r.onerror=()=>rej(r.error)});
const rq=r=>new Promise((res,rej)=>{r.onsuccess=()=>res(r.result);r.onerror=()=>rej(r.error)});
const st=(n,m='readonly')=>db.transaction(n,m).objectStore(n);
const getKV=k=>rq(st('kv').get(k)),setKV=(k,v)=>rq(st('kv','readwrite').put(v,k));
const putTx=t=>rq(st('tx','readwrite').put(t)),delTx=id=>rq(st('tx','readwrite').delete(id));
async function load(){S.tx=await rq(st('tx').getAll());S.cfg={...structuredClone(D),...(await getKV('cfg')||{})};document.documentElement.dataset.theme=S.cfg.theme}
const saveCfg=()=>setKV('cfg',S.cfg);
// ---------- validation ----------
function clean(o){const s=(v,n=200)=>String(v??'').replace(/[\u0000-\u001f]/g,' ').trim().slice(0,n);const a=Number(o.amount);
 if(!['income','expense','transfer'].includes(o.type)||!/^\d{4}-\d{2}-\d{2}$/.test(o.date||'')||isNaN(new Date(o.date))||!(a>0)||a>1e10)return null;
 return{...(o.id?{id:+o.id}:{}),type:o.type,date:o.date,amount:Math.round(a*100)/100,category:s(o.category,60)||'Other',sub:s(o.sub,60),desc:s(o.desc),party:s(o.party),account:s(o.account,60),to:s(o.to,60),method:s(o.method,30),notes:s(o.notes,500)}}
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
 return`<h2>Dashboard</h2>${warn(me,B,'Monthly budget')}${Object.entries(S.cfg.cb).map(([k,v])=>warn(byCat(mo)[k]||0,v,k)).join('')}
 <div class="grid">${c('Current balance',inr(balance()),balance()<0?'neg':'')}${c("Today's income",inr(ti),'inc')}${c("Today's expenses",inr(te),'exp')}${c("Today's net cash flow",inr(ti-te),ti-te<0?'neg':'pos')}
 ${c('Income this month',inr(mi),'inc')}${c('Expenses this month',inr(me),'exp')}${c('Net savings this month',inr(mi-me),mi-me<0?'neg':'pos')}${c('Savings rate',rate(mi,me))}
 ${c('Highest spending category',bc?esc(bc[0])+' · '+inr(bc[1]):'No expenses yet')}${c('Remaining monthly budget',B>0?inr(B-me):'Set in Budgets',B>0&&B-me<0?'neg':'')}</div>
 <h3>Period summary</h3><div class="chips">${ps.map(x=>`<button data-a="p" data-v="${x}" class="${x===p?'on':''}">${x}</button>`).join('')}
 ${p==='custom'?`<input type="date" id="cf" value="${f}" data-c="cr"><input type="date" id="ct" value="${t}" data-c="cr">`:''}</div>
 <div class="grid">${c('Income',inr(sum(pr,'income')),'inc')}${c('Expenses',inr(sum(pr,'expense')),'exp')}${c('Net',inr(sum(pr,'income')-sum(pr,'expense')))}${c('Transactions',pr.length)}</div>
 <h3>Accounts</h3><div class="grid">${S.cfg.accounts.map(a=>c(esc(a.name),inr(accBal(a)))).join('')}</div>
 ${S.tx.length?'':'<p class="mut">No transactions yet. Use “Add Transaction” to start. Your opening balances are in Settings.</p>'}`};
A.p=el=>{S.p=el.dataset.v;render()};C.cr=()=>{S.p='custom';S.cr=[$('#cf').value,$('#ct').value];render()};
// ---------- Add / edit ----------
V.add=id=>{const t=id?S.tx.find(x=>x.id==id):null,ty=t?.type||S.ft||'expense',cats=ty==='income'?S.cfg.inc:S.cfg.exp,ac=S.cfg.accounts.map(a=>a.name),v=k=>esc(t?.[k]??'');
 const L=(n,h)=>`<label>${n}${h}</label>`;
 return`<h2>${t?'Edit':'Add'} transaction</h2><div class="seg">${['expense','income','transfer'].map(x=>`<button type="button" data-a="ft" data-v="${x}" class="${x===ty?'on':''}" ${t?'disabled':''}>${x}</button>`).join('')}</div>
 <form data-s="save" class="grid"><input type="hidden" name="id" value="${t?.id||''}"><input type="hidden" name="type" value="${ty}">
 ${L('Date',`<input type="date" name="date" required value="${t?.date||T()}">`)}${L('Amount (₹)',`<input type="number" name="amount" required min="0.01" step="0.01" inputmode="decimal" value="${t?.amount||''}" ${t?'':'autofocus'}>`)}
 ${ty==='transfer'?L('From account',`<select name="account">${opt(ac,t?.account)}</select>`)+L('To account',`<select name="to">${opt(ac,t?.to||ac[1])}</select>`):
 L('Category',`<select name="category">${opt(cats,t?.category)}</select>`)+L('Or new category',`<input name="newcat" maxlength="60">`)+L(ty==='income'?'Income source':'Merchant / recipient',`<input name="party" maxlength="200" value="${v('party')}">`)+(ty==='expense'?L('Subcategory',`<input name="sub" maxlength="60" value="${v('sub')}">`):'')+L('Account',`<select name="account">${opt(ac,t?.account)}</select>`)+L('Payment method',`<select name="method">${opt(METHODS,t?.method||'UPI')}</select>`)}
 ${L('Description',`<input name="desc" maxlength="200" value="${v('desc')}">`)}${L('Notes (optional)',`<input name="notes" maxlength="500" value="${v('notes')}">`)}
 <button class="pri">${t?'Save changes':'Add'}</button></form><p class="mut">Never enter bank passwords, UPI PINs, CVVs or OTPs here.</p>`};
A.ft=el=>{S.ft=el.dataset.v;render()};
F.save=async f=>{const d=Object.fromEntries(new FormData(f));const nc=(d.newcat||'').trim().slice(0,60);
 if(d.type==='transfer'){d.category='Transfer';if(d.account===d.to)return toast('Choose two different accounts')}
 else if(nc){d.category=nc;const l=S.cfg[d.type==='income'?'inc':'exp'];if(!l.includes(nc)){l.push(nc);await saveCfg()}}
 const t=clean(d);if(!t)return toast('Please check the date and amount');
 if(!t.id)delete t.id;await putTx(t);S.tx=await rq(st('tx').getAll());toast('Saved ✓');
 if(d.id)location.hash='#sheet';else render()};
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
 ${rows.map(t=>`<tr class="${t.type==='transfer'?'mut':''}"><td>${t.date}</td><td>${t.type}</td><td>${esc(t.category)}</td><td>${esc(t.type==='transfer'?`${t.account} → ${t.to}`:t.desc||t.party)}</td><td class="r inc">${t.type==='income'?inr(t.amount):''}</td><td class="r exp">${t.type==='expense'?inr(t.amount):''}</td><td>${esc(t.account)}</td><td>${esc(t.method)}</td><td class="r">${inr(bal[t.id])}</td>
 <td class="noprint"><a href="#add/${t.id}">✏️</a> <button class="del" data-a="del" data-v="${t.id}">🗑</button></td></tr>`).join('')||'<tr><td colspan="10" class="mut">No transactions match.</td></tr>'}</table></div>
 <h3>Totals by <select data-c="sg" class="noprint">${['day','week','month'].map(x=>`<option${x===g?' selected':''}>${x}</option>`).join('')}</select></h3>
 <div class="tw"><table><tr><th>${g}</th><th class="r">Income</th><th class="r">Expense</th><th class="r">Net</th></tr>${Object.entries(gm).sort().reverse().map(([k,x])=>`<tr><td>${k}</td><td class="r inc">${inr(x.i)}</td><td class="r exp">${inr(x.e)}</td><td class="r">${inr(x.i-x.e)}</td></tr>`).join('')}</table></div>
 <div class="bar noprint"><button data-a="exp">⬇ Export CSV (all)</button><button data-a="expm">⬇ Export this month</button><button data-a="print">🖨 Print monthly report</button><label>Import CSV<input type="file" accept=".csv,text/csv" data-c="csvf"></label></div>${S.imp?impUI():''}`};
A.sort=el=>{const k=el.dataset.v;S.sd=S.sk===k?-(S.sd||-1):1;S.sk=k;render()};
A.mn=el=>{S.m=addM(S.m||T().slice(0,7),+el.dataset.v);render()};
C.sm=el=>{if(el.value){S.m=el.value;render()}};C.sq=el=>{S.q=el.value;render()};C.sty=el=>{S.sty=el.value;render()};C.sct=el=>{S.sct=el.value;render()};C.sg=el=>{S.g=el.value;render()};
A.print=()=>print();A.exp=()=>dl('money-all-'+T()+'.csv',toCSV(S.tx));A.expm=()=>dl('money-'+(S.m||T().slice(0,7))+'.csv',toCSV(S.tx.filter(t=>t.date.startsWith(S.m||T().slice(0,7)))));
A.del=async el=>{if(!confirm('Delete this transaction? This cannot be undone.'))return;await delTx(+el.dataset.v);S.tx=await rq(st('tx').getAll());toast('Deleted');render()};
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
 ${S.tx.length?`<div class="box"><h3>What your data says</h3><ul class="ins">${insights().map(x=>`<li>${x}</li>`).join('')}</ul></div><div class="grid" style="grid-template-columns:repeat(auto-fit,minmax(300px,1fr))">
 ${[['c1','Income vs expenses'],['c2','Spending by category'],['c3','Monthly income &amp; expense trend'],['c4','Daily expenses (this month)'],['c5','Monthly savings'],['c6','Budget vs actual (this month)'],['c7','Top 5 expense categories']].map(([i,t])=>`<div class="box"><b>${t}</b><div class="chart"><canvas id="${i}"></canvas></div></div>`).join('')}</div>`:'<p class="mut">Add some transactions to see charts and analysis. Nothing is shown until you have real data.</p>'}`};
C.sn=el=>{S.n=+el.value;render()};
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
 <div class="box"><h3>App lock (optional)</h3>${S.locked?'<button data-a="unlockoff">Remove lock</button>':'<form data-s="lock" class="bar"><input name="p" type="password" minlength="6" placeholder="New password (6+ chars)" required autocomplete="new-password"><button>Set lock</button></form>'}
 <p class="mut">This lock only hides the app screen. Data in the browser is not encrypted by it, so also use a Windows password and BitLocker/device encryption. Forgetting the password means wiping browser data (restore from a backup).</p></div>
 <div class="box"><h3>Backup &amp; restore</h3><div class="bar"><button data-a="bk">⬇ Plain backup (.json)</button><input id="bpw" type="password" placeholder="Backup password" autocomplete="new-password"><button class="pri" data-a="bke">🔐 Encrypted backup</button></div>
 <div class="bar"><label>Restore from file<input type="file" accept=".json" data-c="rest"></label><input id="rpw" type="password" placeholder="Password (if encrypted)"></div>
 <p class="mut">Keep copies on a pen drive or in a folder you control, and make a new one weekly. Nothing is uploaded automatically. If you forget a backup password it cannot be recovered.</p></div>
 <div class="box"><h3>Delete everything</h3><form data-s="wipe" class="bar"><input name="c" placeholder='Type DELETE' required><button class="del">Delete all my data</button></form></div>`;
C.theme=async el=>{S.cfg.theme=el.value;document.documentElement.dataset.theme=el.value;await saveCfg()};
C.open=async el=>{S.cfg.accounts[+el.dataset.i].open=+el.value||0;await saveCfg();toast('Saved')};
F.acc=async f=>{const d=Object.fromEntries(new FormData(f)),n=d.n.trim().slice(0,60);if(S.cfg.accounts.some(a=>a.name===n))return toast('Account exists');S.cfg.accounts.push({name:n,open:+d.o||0});await saveCfg();render()};
F.cat=async f=>{const d=Object.fromEntries(new FormData(f)),n=d.n.trim().slice(0,60);if(n&&!S.cfg[d.t].includes(n)){S.cfg[d.t].push(n);await saveCfg();toast('Added')}f.reset()};
F.lock=async f=>{if(!needCrypto())return;const p=new FormData(f).get('p'),salt=crypto.getRandomValues(new Uint8Array(16));await setKV('lock',{salt:b64(salt),it:IT,h:await hashPw(p,salt,IT)});S.locked=true;toast('Lock set');render()};
A.unlockoff=async()=>{if(confirm('Remove the app lock?')){await rq(st('kv','readwrite').delete('lock'));S.locked=false;render()}};
const snap=()=>JSON.stringify({app:'moneysheet',v:1,date:T(),cfg:S.cfg,tx:S.tx});
A.bk=()=>dl('money-backup-'+T()+'.json',snap(),'application/json');
A.bke=async()=>{const pw=$('#bpw').value;if(pw.length<8)return toast('Use a password of 8+ characters');if(!needCrypto())return;const salt=crypto.getRandomValues(new Uint8Array(16)),iv=crypto.getRandomValues(new Uint8Array(12));
 const ct=await crypto.subtle.encrypt({name:'AES-GCM',iv},await aes(pw,salt,IT),new TextEncoder().encode(snap()));dl('money-backup-'+T()+'.enc.json',JSON.stringify({app:'moneysheet',enc:1,it:IT,salt:b64(salt),iv:b64(iv),data:b64(ct)}),'application/json');toast('Encrypted backup downloaded')};
C.rest=async el=>{const f=el.files[0];if(!f)return;try{let j=JSON.parse(await f.text());if(j.app!=='moneysheet')throw 0;
  if(j.enc){if(!needCrypto())return;j=JSON.parse(new TextDecoder().decode(await crypto.subtle.decrypt({name:'AES-GCM',iv:ub(j.iv)},await aes($('#rpw').value,ub(j.salt),j.it),ub(j.data))))}
  if(!Array.isArray(j.tx)||!j.cfg||!Array.isArray(j.cfg.accounts))throw 0;const tx=j.tx.map(clean);if(tx.some(t=>!t||!t.id))throw 0;
  if(!confirm(`This backup has ${tx.length} transactions. Restoring will REPLACE all current data. Continue?`))return;
  await rq(st('tx','readwrite').clear());for(const t of tx)await putTx(t);S.cfg={...structuredClone(D),...j.cfg};await saveCfg();await load();toast('Restored ✓');render()}catch{toast('Invalid file, damaged backup, or wrong password')}el.value=''};
F.wipe=async f=>{if(new FormData(f).get('c')!=='DELETE')return toast('Type DELETE exactly');if(!confirm('Permanently delete ALL data on this device? Download a backup first if unsure.'))return;
 await rq(st('tx','readwrite').clear());await rq(st('kv','readwrite').clear());await load();S.locked=false;toast('All data deleted');render()};
// ---------- router & start ----------
const NAV=[['dash','Dashboard'],['add','Add Transaction'],['sheet','My Money Sheet'],['stats','Analytics'],['budget','Budgets'],['set','Settings and Backups']];
function render(){const[v,arg]=(location.hash.slice(1)||'dash').split('/'),k=V[v]?v:'dash';$('#nav').innerHTML=NAV.map(([i,l])=>`<a href="#${i}" class="${i===k?'on':''}">${l}</a>`).join('');$('#app').innerHTML=V[k](arg);P[k]?.()}
const app=$('#app');
app.onclick=e=>{const el=e.target.closest('[data-a]');if(el)A[el.dataset.a](el)};
app.onchange=e=>{const el=e.target.closest('[data-c]');if(el)C[el.dataset.c](el)};
app.onsubmit=e=>{e.preventDefault();F[e.target.dataset.s](e.target)};
addEventListener('hashchange',render);
(async()=>{await openDB();await load();const L=await getKV('lock');S.locked=!!L;
 if(L){$('#lock').hidden=false;await new Promise(res=>{$('#lf').onsubmit=async e=>{e.preventDefault();try{if(await hashPw($('#lp').value,ub(L.salt),L.it)===L.h){$('#lock').hidden=true;res()}else $('#le').textContent='Wrong password'}catch{$('#le').textContent='Cannot verify here (needs localhost/https)'}}})}
 render();if('serviceWorker'in navigator&&location.protocol.startsWith('http'))navigator.serviceWorker.register('sw.js').catch(()=>{})})();
