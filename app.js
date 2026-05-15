const MONTHS=['Leden','Únor','Březen','Duben','Květen','Červen','Červenec','Srpen','Září','Říjen','Listopad','Prosinec'];
const MONTHS_GEN=['ledna','února','března','dubna','května','června','července','srpna','září','října','listopadu','prosince'];
const MS=['Led','Úno','Bře','Dub','Kvě','Čer','Čvc','Srp','Zář','Říj','Lis','Pro'];
const PAL=['#d4807a','#8aaa8e','#c9a96e','#b5788a','#89b4c4','#c4a4c4','#a4c4a8','#c4b4a0','#d4a090','#90b490'];
const DEF={
  expense:['Bydlení 🏠','Jídlo 🍔','Doprava 🚗','Zábava 🎮','Zdraví 💊','Oblečení 👗','Předplatné 📱','Krása 💅','Cestování ✈️','Vzdělání 📚','Ostatní 📦'],
  income: ['Plat 💼','Brigáda 🔧','Freelance 💻','Pasivní příjem 💸','Ostatní příjmy 💰'],
  investment:['ETF 📈','Akcie 📊','Krypto 🪙','Nemovitosti 🏡','Spořicí účet 🏦','Penzijní fond 🎯','Ostatní investice 💎']
};

var S=JSON.parse(localStorage.getItem('bb8')||'null')||{cc:{expense:[],income:[],investment:[]},data:{},goals:[],plans:{},catMeta:{},recurring:[]};
let now=new Date(),cY=now.getFullYear(),cM=now.getMonth();
let txType='expense',txFilter='all',activeTab=localStorage.getItem('bb8_tab')||'overview',editGoalId=null,addGoalId=null;

const k0=`${cY}-${cM}`;
// Migrate old format
if(S.limits||S.incomePlans){
  if(!S.plans) S.plans={};
  S.plans[k0]={limits:S.limits||{},income:S.incomePlans||{}};
  delete S.limits; delete S.incomePlans;
}
if(!S.plans) S.plans={};
if(!S.recurring) S.recurring=[];
save();

let _cloudTimer=null;
function save(){
  try{
    localStorage.setItem('bb8',JSON.stringify(S));
  }catch(e){
    if(e.name==='QuotaExceededError'||e.name==='NS_ERROR_DOM_QUOTA_REACHED'){
      console.warn('[BQ] localStorage plný — data uložena jen do cloudu');
      if(typeof toast==='function') toast('Úložiště prohlížeče je plné — data jsou bezpečně v cloudu','warn');
    }
  }
  if(window.saveToCloud){
    clearTimeout(_cloudTimer);
    _cloudTimer=setTimeout(()=>window.saveToCloud(),1200);
  }
}
if(!S.catMeta)    S.catMeta={};
if(!S.ruleRatio)  S.ruleRatio={n:50,w:30,s:20};
if(!S.currency)   S.currency='CZK';
if(!S.portfolios) S.portfolios=[];
// ── STATE SANITIZER — opravuje koruptovaná/neúplná data při načtení ──
function sanitizeState(){
  // Zásada: NIKDY nesmazat platná data — jen doplnit chybějící pole
  // Top-level typy — jen přidej pokud chybí, nikdy nemaž
  if(!S.cc||typeof S.cc!=='object')S.cc={expense:[],income:[],investment:[]};
  ['expense','income','investment'].forEach(k=>{if(!Array.isArray(S.cc[k]))S.cc[k]=[];});
  if(!S.data||typeof S.data!=='object')S.data={};
  if(!Array.isArray(S.goals))S.goals=[];
  if(!S.plans||typeof S.plans!=='object')S.plans={};
  if(!S.catMeta||typeof S.catMeta!=='object')S.catMeta={};
  if(!Array.isArray(S.recurring))S.recurring=[];
  if(!Array.isArray(S.portfolios))S.portfolios=[];
  if(!S.ruleRatio||typeof S.ruleRatio!=='object')S.ruleRatio={n:50,w:30,s:20};
  if(!S.currency||!['CZK','EUR','USD','GBP','PLN'].includes(S.currency))S.currency='CZK';
  // Oprav transakce — nikdy nesmazat, jen opravit chybějící pole
  Object.keys(S.data).forEach(k=>{
    if(!Array.isArray(S.data[k])){S.data[k]=[];return;}
    S.data[k]=S.data[k].filter(tx=>{
      if(!tx||typeof tx!=='object')return false; // smaž jen absolutně nečitelné záznamy
      if(!tx.id)tx.id=Date.now()+Math.random();
      if(!tx.type||!['expense','income','investment'].includes(tx.type))tx.type='expense'; // oprav, nesmazávej
      if(typeof tx.amount!=='number'||isNaN(tx.amount))tx.amount=0;
      if(!tx.cat||typeof tx.cat!=='string')tx.cat='Ostatní 📦';
      if(!tx.name||typeof tx.name!=='string')tx.name='—';
      return true;
    });
  });
  // Oprav cíle — nesmaž, jen doplň
  S.goals=S.goals.filter(g=>{
    if(!g||typeof g!=='object')return false;
    if(!g.id)g.id=Date.now()+Math.random();
    if(!g.name)g.name='Cíl';
    if(typeof g.target!=='number'||isNaN(g.target))g.target=0;
    if(typeof g.saved!=='number'||isNaN(g.saved))g.saved=0;
    return true;
  });
  // Oprav recurring šablony — smaž jen pokud chybí id+type+startKey (nelze zobrazit)
  S.recurring=S.recurring.filter(r=>{
    if(!r||typeof r!=='object')return false;
    if(!r.id||!r.startKey)return false; // bez id nebo startKey nelze pracovat
    if(!r.type||!['expense','income','investment'].includes(r.type))r.type='expense';
    if(typeof r.amount!=='number'||isNaN(r.amount))r.amount=0;
    if(!Array.isArray(r.skippedKeys))r.skippedKeys=[];
    return true;
  });
}
sanitizeState();
// Ensure the two default emergency funds always exist (cannot be deleted)
function ensureDefaultFunds(){
  if(!S.goals) S.goals=[];
  let changed=false;
  if(!S.goals.some(g=>g.fundType==='peace')){
    S.goals.unshift({id:Date.now()-2,name:'Klid na duši',emoji:'🕊️',target:0,saved:0,isDefault:true,fundType:'peace'});
    changed=true;
  }
  if(!S.goals.some(g=>g.fundType==='reserve')){
    const pi=S.goals.findIndex(g=>g.fundType==='peace');
    S.goals.splice(pi+1,0,{id:Date.now()-1,name:'Rezerva',emoji:'🛡️',target:0,saved:0,isDefault:true,fundType:'reserve'});
    changed=true;
  }
  if(changed) save();
}
window.ensureDefaultFunds=ensureDefaultFunds;
ensureDefaultFunds();
// Default type for every expense category ('need' = nezbytný, 'want' = radost)
const DEF_META={
  'Bydlení 🏠':'need','Jídlo 🍔':'need','Doprava 🚗':'need','Zdraví 💊':'need',
  'Vzdělání 📚':'need','Předplatné 📱':'need','Ostatní 📦':'need',
  'Zábava 🎮':'want','Oblečení 👗':'want','Krása 💅':'want','Cestování ✈️':'want'
};
function catType(cat){ return S.catMeta[cat]||(DEF_META[cat]||'need'); }
function toggleCatMeta(cat){ S.catMeta[cat]=catType(cat)==='want'?'need':'want'; save(); renderCatManager(); }
// Compare two month keys "YYYY-M" numerically (strings sort incorrectly for month 10/11)
function keyLt(a,b){ const[ay,am]=a.split('-').map(Number),[by,bm]=b.split('-').map(Number); return ay!==by?ay<by:am<bm; }
function planHasData(p){ return p&&(Object.keys(p.limits||{}).length||Object.keys(p.income||{}).length); }
// Get plan for a specific month key — falls back to most recent past plan with actual data
function getPlan(key){
  if(!S.plans) S.plans={};
  if(planHasData(S.plans[key])) return S.plans[key];
  // Find most recent past plan using numeric comparison
  const best=Object.keys(S.plans)
    .filter(k=>keyLt(k,key)&&planHasData(S.plans[k]))
    .sort((a,b)=>keyLt(a,b)?-1:1);
  if(best.length) return JSON.parse(JSON.stringify(S.plans[best[best.length-1]]));
  return {limits:{},income:{}};
}
function curPlan(){ return getPlan(ck()); }
function curLimits(){ return curPlan().limits||{}; }
function curIncome(){ return curPlan().income||{}; }
function saveCurPlan(limits,income){
  if(!S.plans) S.plans={};
  S.plans[ck()]={limits,income};
}
function fd(d){ return d.toISOString().slice(0,10); }
function fmtDate(s){ if(!s)return''; const [y,m,d]=s.split('-'); return d+'.'+m+'.'+y; }
function ck(){ return `${cY}-${cM}`; }
function txs(){ return S.data[ck()]||[]; }
const CURR={
  CZK:{sym:'Kč', pre:false},
  EUR:{sym:'€',  pre:false},
  PLN:{sym:'zł', pre:false},
  USD:{sym:'$',  pre:true },
  GBP:{sym:'£',  pre:true },
};
function curSym(){ return (CURR[S.currency]||CURR.CZK).sym; }
function fmt(n){
  const c=CURR[S.currency]||CURR.CZK;
  const f=new Intl.NumberFormat('cs-CZ',{maximumFractionDigits:0}).format(n);
  return c.pre?c.sym+f:f+' '+c.sym;
}
function fmtK(n){
  const c=CURR[S.currency]||CURR.CZK;
  const f=n>=1000?(n/1000).toFixed(n%1000===0?0:1)+'k':String(n);
  return c.pre?c.sym+f:f+' '+c.sym;
}
// Czech plural helper: plur(1,'položka','položky','položek')
function plur(n,a,b,c){if(n===1)return n+' '+a;if(n>=2&&n<=4)return n+' '+b;return n+' '+c;}
// XSS ochrana — escapuje user input před vložením do innerHTML
function esc(s){return String(s==null?'':s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;');}
function allCats(t){ return [...DEF[t],...(S.cc[t]||[])]; }
function icon(cat){ return cat.split(' ').pop()||'📦'; }
function cname(cat){ return cat.split(' ').slice(0,-1).join(' ')||cat; }
function cmap(arr){ const m={}; arr.forEach(t=>{m[t.cat]=(m[t.cat]||0)+t.amount;}); return Object.entries(m).sort((a,b)=>b[1]-a[1]); }
function close2(id){ document.getElementById(id)?.classList.remove('open'); }

function toast(msg,type=''){
  const w=document.getElementById('toastWrap'),t=document.createElement('div');
  t.className='toast'+(type?' '+type:''); t.textContent=msg; w.appendChild(t);
  setTimeout(()=>{t.style.opacity='0';t.style.transition='opacity .3s';setTimeout(()=>t.remove(),300);},2200);
}

document.addEventListener('keydown',e=>{
  const tag=e.target.tagName;
  if(tag==='INPUT'||tag==='SELECT'||tag==='TEXTAREA') return;
  if(e.key==='n'||e.key==='N'){e.preventDefault();openTxModal();}
  if(e.key==='Escape') document.querySelectorAll('.overlay.open').forEach(o=>o.classList.remove('open'));
});

// Health tooltip toggle
document.addEventListener('click',e=>{
  const btn=document.getElementById('hsInfoBtn');
  const tip=document.getElementById('hsTooltip');
  if(!btn||!tip) return;
  if(btn.contains(e.target)){
    tip.classList.toggle('open');
  } else if(!tip.contains(e.target)){
    tip.classList.remove('open');
  }
});
document.querySelectorAll('.overlay').forEach(el=>{
  el.addEventListener('click',e=>{if(e.target===el)el.classList.remove('open');});
});

function setCurrency(c){
  S.currency=c; save(); render();
}
function syncCurrencyPicker(){
  const el=document.getElementById('currencyPicker');
  if(el) el.value=S.currency||'CZK';
  document.querySelectorAll('.ud-cur-btn').forEach(btn=>{
    btn.classList.toggle('active',btn.dataset.cur===(S.currency||'CZK'));
  });
}
function toggleUserMenu(){
  const btn=document.getElementById('userMenuBtn');
  const dd=document.getElementById('userDropdown');
  btn.classList.toggle('open');
  dd.classList.toggle('open');
}
function closeUserMenu(){
  document.getElementById('userMenuBtn')?.classList.remove('open');
  document.getElementById('userDropdown')?.classList.remove('open');
}
document.addEventListener('click',function(e){
  const wrap=document.getElementById('userMenuBtn')?.closest('.header-user');
  if(wrap&&!wrap.contains(e.target)) closeUserMenu();
});
// ── GDPR SOUHLAS ──
function toggleLoginBtn(){
  const check=document.getElementById('gdprCheck');
  const btn=document.getElementById('btnLogin');
  if(!check||!btn)return;
  btn.disabled=!check.checked;
  if(check.checked)localStorage.setItem('bb8_gdpr','1');
}
function showPrivacyModal(){
  document.getElementById('overlayPrivacy').classList.add('open');
}
function showTosModal(){
  document.getElementById('overlayTos').classList.add('open');
}
// Pokud uživatel již dříve souhlasil, auto-zaškrtni checkbox
(function initGdpr(){
  if(localStorage.getItem('bb8_gdpr')){
    const check=document.getElementById('gdprCheck');
    const btn=document.getElementById('btnLogin');
    if(check)check.checked=true;
    if(btn)btn.disabled=false;
  }
})();

function exportCSV(){
  const k=ck(), t=S.data[k]||[];
  if(!t.length){toast('Žádné transakce k exportu','warn');return;}
  const rows=[['Datum','Popis','Kategorie','Typ','Částka ('+curSym()+')']];
  [...t].sort((a,b)=>a.date<b.date?-1:1).forEach(x=>{
    rows.push([x.date||'',x.name,cname(x.cat),
      x.type==='income'?'Příjem':x.type==='investment'?'Investice':'Výdaj',x.amount]);
  });
  const csv=rows.map(r=>r.map(v=>'"'+String(v).replace(/"/g,'""')+'"').join(',')).join('\n');
  const blob=new Blob(['﻿'+csv],{type:'text/csv;charset=utf-8'});
  const url=URL.createObjectURL(blob);
  const a=document.createElement('a');
  a.href=url; a.download='budget-queen-'+MONTHS[cM]+'-'+cY+'.csv';
  a.click(); URL.revokeObjectURL(url);
  toast('CSV staženo ✓','success');
}
function exportJSON(){
  const filename='budget-queen-backup-'+new Date().toISOString().slice(0,10)+'.json';
  const blob=new Blob([JSON.stringify(S,null,2)],{type:'application/json'});
  const url=URL.createObjectURL(blob);
  const a=document.createElement('a');
  a.href=url; a.download=filename; a.click();
  URL.revokeObjectURL(url);
  toast('Záloha uložena: '+filename,'success');
}
function handleJsonImport(input){
  const file=input.files[0]; if(!file) return;
  input.value=''; // reset — jinak nelze znovu vybrat stejný soubor
  const reader=new FileReader();
  reader.onload=function(e){
    try{
      const imp=JSON.parse(e.target.result);
      if(!imp||typeof imp!=='object'||Array.isArray(imp)){
        toast('Neplatný soubor — není to JSON záloha Budget Queen','warn'); return;
      }
      // Shrnutí pro potvrzovací dialog
      const months=Object.keys(imp.data||{});
      const txCount=months.reduce((s,k)=>s+(Array.isArray(imp.data[k])?imp.data[k].length:0),0);
      const goalCount=(imp.goals||[]).filter(g=>!g.isDefault).length;
      const msg='Importovat zálohu?\n\n'
        +'📅 '+months.length+' měsíců dat\n'
        +'💳 '+txCount+' transakcí\n'
        +'🎯 '+goalCount+' vlastních cílů\n\n'
        +'⚠️ Toto nahradí všechna tvá aktuální data!';
      if(!confirm(msg)) return;
      // Aplikuj importovaná data — jen pole která existují
      if(imp.cc&&typeof imp.cc==='object')       S.cc=imp.cc;
      if(imp.data&&typeof imp.data==='object')   S.data=imp.data;
      if(Array.isArray(imp.goals))               S.goals=imp.goals;
      if(imp.plans&&typeof imp.plans==='object') S.plans=imp.plans;
      if(imp.catMeta&&typeof imp.catMeta==='object') S.catMeta=imp.catMeta;
      if(imp.ruleRatio&&typeof imp.ruleRatio==='object') S.ruleRatio=imp.ruleRatio;
      if(imp.currency&&['CZK','EUR','USD','GBP','PLN'].includes(imp.currency)) S.currency=imp.currency;
      if(Array.isArray(imp.portfolios))          S.portfolios=imp.portfolios;
      if(Array.isArray(imp.recurring))           S.recurring=imp.recurring;
      // Oprav a doplň případné mezery
      sanitizeState();
      ensureDefaultFunds();
      save();
      render();
      toast('Záloha importována ✓ — '+txCount+' transakcí načteno','success');
    }catch(err){
      toast('Chyba při čtení souboru: '+(err.message||err),'warn');
    }
  };
  reader.readAsText(file,'utf-8');
}
function changeMonth(d){
  cM+=d; if(cM>11){cM=0;cY++;}if(cM<0){cM=11;cY--;}
  // Auto-copy plan to new month if none exists
  if(!planHasData(S.plans[ck()])){
    const inherited=getPlan(ck());
    if(planHasData(inherited)){S.plans[ck()]=JSON.parse(JSON.stringify(inherited));save();}
  }
  render();
}

function goHome(){
  const now=new Date();
  cY=now.getFullYear();
  cM=now.getMonth();
  switchTab('overview');
}
function switchTab(t){
  activeTab=t;
  localStorage.setItem('bb8_tab',t);
  ['overview','budget','goals','invest'].forEach(id=>{
    document.getElementById('tab-'+id).style.display=id===t?'':'none';
  });
  document.querySelectorAll('.tab-btn').forEach((b,i)=>{
    b.classList.toggle('active',['overview','budget','goals','invest'][i]===t);
  });
  // Health bar + summary cards only on overview tab
  const hb=document.querySelector('.health-bar');
  const sm=document.querySelector('.summary');
  if(hb) hb.style.display=t==='overview'?'':'none';
  if(sm) sm.style.display=t==='overview'?'grid':'none';
  render();
}
function setFilter(f,el){
  txFilter=f;
  document.querySelectorAll('.filter-btn').forEach(b=>b.classList.remove('active'));
  el.classList.add('active'); renderTxList();
}


let currentKind='need', editKind='need';
function setKind(k){
  currentKind=k;
  ['need','want'].forEach(t=>{const el=document.getElementById('kind-'+t);if(el){el.classList.toggle('active',t===k);}});
}
function setEditKind(k){
  editKind=k;
  ['need','want'].forEach(t=>{const el=document.getElementById('ekind-'+t);if(el){el.classList.toggle('active',t===k);}});
}
function populateCat(){ document.getElementById('txCat').innerHTML=allCats(txType).map(c=>'<option>'+c+'</option>').join(''); }
function setTxType(t){
  txType=t;
  ['expense','income','investment','goal'].forEach(tp=>{const el=document.getElementById('tt-'+tp);if(el)el.classList.toggle('active',tp===t);});
  const isGoal=t==='goal';
  const isInvest=t==='investment';
  const hasPF=(S.portfolios||[]).length>0;
  const usePF=isInvest&&hasPF;
  document.getElementById('goalPickRow').style.display=isGoal?'':'none';
  document.getElementById('portfolioPickRow').style.display=usePF?'':'none';
  document.getElementById('catFg').style.display=(isGoal||usePF)?'none':'';
  document.getElementById('kindFg').style.display=t==='expense'?'':'none';
  // Hide "Spravovat kategorie" when portfolio picker is active (not relevant)
  const cmf=document.getElementById('catMgrFg');
  if(cmf) cmf.style.display=(isGoal||usePF)?'none':'';
  // Show recurring for all types incl. goal (recurring goal deposits supported)
  const rFg=document.getElementById('recurringFg');
  if(rFg) rFg.style.display='';
  if(isGoal){
    const pick=document.getElementById('txGoalPick');
    pick.innerHTML=S.goals.length?S.goals.map(g=>'<option value="'+g.id+'">'+esc(g.emoji)+' '+esc(g.name)+'</option>').join(''):'<option value="">Nejprve přidej cíl</option>';
  } else if(usePF){
    const pick=document.getElementById('txPortfolioPick');
    pick.innerHTML=(S.portfolios||[]).map(p=>'<option value="'+p.id+'">'+esc(p.emoji)+' '+esc(p.name)+'</option>').join('');
  } else {
    populateCat();
  }
}
function openTxModal(){
  document.getElementById('txDate').value=fd(new Date());
  document.getElementById('txName').value='';
  document.getElementById('txAmount').value='';
  document.getElementById('txRecurring').checked=false;
  document.getElementById('goalPickRow').style.display='none';
  document.getElementById('catFg').style.display='';
  const lbl=document.getElementById('txAmountLabel');
  if(lbl) lbl.textContent='Částka ('+curSym()+')';
  setKind('need');
  setTxType('expense');
  document.getElementById('overlayTx').classList.add('open');
  setTimeout(()=>document.getElementById('txName').focus(),80);
}
function addTransaction(){
  const name=document.getElementById('txName').value.trim();
  const amount=parseFloat(document.getElementById('txAmount').value);
  const date=document.getElementById('txDate').value;
  if(!name||!amount||amount<=0){toast('Vyplň popis a částku 💡','warn');return;}
  const k=ck(); if(!S.data[k])S.data[k]=[];
  if(txType==='goal'){
    const goalId=parseInt(document.getElementById('txGoalPick').value);
    const g=S.goals.find(g=>g.id===goalId);
    if(!g){toast('Nejprve přidej cíl 🎯','warn');return;}
    if(!g.target){toast('Nejprve nastav cílovou částku cíle ✏️','warn');return;}
    S.data[k].push({id:Date.now(),type:'investment',name,amount,cat:g.name+' '+g.emoji,goalId,date});
    g.saved=Math.min(g.target,g.saved+amount);
    toast(fmt(amount)+' → '+g.emoji+' '+g.name,'success');
  } else if(txType==='investment'&&document.getElementById('portfolioPickRow').style.display!=='none'){
    // Investment linked to a portfolio
    const pfId=parseInt(document.getElementById('txPortfolioPick').value);
    const pf=(S.portfolios||[]).find(p=>p.id===pfId);
    const cat=pf?pf.name+' '+pf.emoji:'Investice 📈';
    S.data[k].push({id:Date.now(),type:'investment',name,amount,cat,portfolioId:pfId||null,date});
    if(pf) pf.invested=(pf.invested||0)+amount;  // propagate to portfolio cost basis
    toast(name+' — '+fmt(amount)+' → '+(pf?pf.emoji+' '+pf.name:'investice'),'success');
  } else {
    const cat=document.getElementById('txCat').value;
    const tx={id:Date.now(),type:txType,name,amount,cat,date};
    if(txType==='expense') tx.kind=currentKind;
    S.data[k].push(tx);
    toast(name+' — '+fmt(amount)+(txType==='income'?' ✓':''),'success');
  }
  // Handle recurring
  if(document.getElementById('txRecurring')?.checked){
    const newTx=S.data[k][S.data[k].length-1];
    const recId='rec_'+Date.now();
    newTx.recurringId=recId;
    if(!S.recurring) S.recurring=[];
    S.recurring.push({id:recId,name:newTx.name,amount:newTx.amount,cat:newTx.cat,type:newTx.type,
      kind:newTx.kind||null,goalId:newTx.goalId||null,portfolioId:newTx.portfolioId||null,
      startKey:k,endKey:null,skippedKeys:[]});
    toast(newTx.name+' — opakuje se každý měsíc 🔁','success');
  }
  save(); close2('overlayTx'); render();
}
function deleteTx(id){
  const k=ck(),tx=(S.data[k]||[]).find(x=>x.id===id);
  if(tx&&tx.recurringId){showRecurringDeleteChoice(id);return;}
  _doDeleteSingleTx(id);
}
function addCarryoverIncome(){
  // Compute previous month's net balance
  let pm=cM-1,py=cY; if(pm<0){pm=11;py--;}
  const prevKey=`${py}-${pm}`;
  const pt=S.data[prevKey]||[];
  const prevNet=pt.filter(x=>x.type==='income').reduce((a,x)=>a+x.amount,0)
               -pt.filter(x=>x.type==='expense').reduce((a,x)=>a+x.amount,0)
               -pt.filter(x=>x.type==='investment').reduce((a,x)=>a+x.amount,0);
  if(prevNet<=0){toast('Minulý měsíc neměl kladný přebytek','warn');return;}
  const k=ck(); if(!S.data[k])S.data[k]=[];
  const alreadyAdded=(S.data[k]).some(x=>x.type==='income'&&x.cat==='Přenesený zůstatek 💰');
  if(alreadyAdded){toast('Zůstatek z minulého měsíce byl již přidán','warn');return;}
  S.data[k].push({id:Date.now(),type:'income',name:'Zůstatek z '+MONTHS[pm],amount:Math.round(prevNet),cat:'Přenesený zůstatek 💰',date:fd(new Date(cY,cM,1))});
  save(); toast('Přidáno '+fmt(prevNet)+' jako příjem ✓','success'); render();
}

function calcGoalMonthly(target,saved,deadline){
  if(!deadline||!target) return null;
  const dl=new Date(deadline);
  const now2=new Date();
  const months=Math.max(1,(dl.getFullYear()-now2.getFullYear())*12+(dl.getMonth()-now2.getMonth())+(dl.getDate()>=now2.getDate()?0:-1));
  const remaining=Math.max(0,target-(saved||0));
  return remaining>0?Math.ceil(remaining/months):0;
}
function updateGoalMonthlyHint(){
  const target=parseFloat(document.getElementById('goalTarget').value)||0;
  const saved=parseFloat(document.getElementById('goalSaved').value)||0;
  const deadline=document.getElementById('goalDeadline').value;
  const hintEl=document.getElementById('goalMonthlyHint');
  if(!hintEl)return;
  const monthly=calcGoalMonthly(target,saved,deadline);
  if(monthly!==null&&monthly>0){
    hintEl.style.display='';
    hintEl.textContent='📅 Měsíčně potřeba odkládat: '+fmt(monthly);
  } else if(monthly===0&&target&&saved>=target){
    hintEl.style.display='';
    hintEl.textContent='🎉 Cíl je již splněn!';
  } else {
    hintEl.style.display='none';
  }
}
function openGoalModal(){
  editGoalId=null;
  document.getElementById('goalModalTitle').innerHTML='Nový <em>cíl</em>';
  ['goalName','goalEmoji','goalTarget','goalSaved','goalDeadline'].forEach(id=>document.getElementById(id).value=id==='goalEmoji'?'🎯':id==='goalSaved'?'0':'');
  document.getElementById('goalFundHint').style.display='none';
  document.getElementById('goalMonthlyHint').style.display='none';
  document.getElementById('goalNameFg').style.display='';
  document.getElementById('goalEmojiFg').style.display='';
  document.getElementById('goalDeadlineFg').style.display='';
  document.getElementById('overlayGoal').classList.add('open');
  setTimeout(()=>document.getElementById('goalName').focus(),80);
}
function openEditGoalModal(id){
  const g=S.goals.find(g=>g.id===id); if(!g)return;
  editGoalId=id;
  const isDF=g.isDefault;
  document.getElementById('goalModalTitle').innerHTML=isDF?'Upravit <em>fond</em>':'Upravit <em>cíl</em>';
  document.getElementById('goalName').value=g.name;
  document.getElementById('goalEmoji').value=g.emoji;
  document.getElementById('goalTarget').value=g.target||'';
  document.getElementById('goalSaved').value=g.saved||'';
  document.getElementById('goalDeadline').value=g.deadline||'';
  document.getElementById('goalNameFg').style.display=isDF?'none':'';
  document.getElementById('goalEmojiFg').style.display=isDF?'none':'';
  document.getElementById('goalDeadlineFg').style.display=isDF?'none':'';
  const hint=document.getElementById('goalFundHint');
  if(isDF&&hint){
    hint.style.display='';
    if(g.fundType==='peace') hint.innerHTML='🕊️ <strong>Klid na duši</strong> — nastav cíl na výši jednoho měsíčního příjmu. Slouží na nečekané výdaje (opravy, zdraví). Lze z něj čerpat.';
    else hint.innerHTML='🛡️ <strong>Rezerva</strong> — nastav cíl na 3–6× měsíčních výdajů. Na tento fond se nesahá. Chrání tě při ztrátě příjmu.';
  } else if(hint){ hint.style.display='none'; }
  document.getElementById('goalMonthlyHint').style.display='none';
  updateGoalMonthlyHint();
  document.getElementById('overlayGoal').classList.add('open');
}
function saveGoal(){
  const name=document.getElementById('goalName').value.trim();
  const target=parseFloat(document.getElementById('goalTarget').value);
  const saved=parseFloat(document.getElementById('goalSaved').value)||0;
  const emoji=document.getElementById('goalEmoji').value||'🎯';
  const deadline=document.getElementById('goalDeadline').value||'';
  const g=editGoalId?S.goals.find(g=>g.id===editGoalId):null;
  const isDF=g&&g.isDefault;
  if(!isDF&&(!name||!target)){toast('Vyplň název a cíl','warn');return;}
  if(isDF&&!target){toast('Zadej cílovou částku','warn');return;}
  if(editGoalId){
    if(g){
      if(!isDF){g.name=name;g.emoji=emoji;g.deadline=deadline;}
      g.target=target; g.saved=target>0?Math.min(saved,target):saved;
    }
    toast(isDF?g.emoji+' '+g.name+' upraven ✓':'Cíl upraven ✓','success');
  } else {
    S.goals.push({id:Date.now(),name,emoji,target,saved,deadline});
    toast(emoji+' '+name+' přidán!','success');
  }
  save(); close2('overlayGoal'); render();
}
function openAddGoalModal(id){
  addGoalId=id; const g=S.goals.find(g=>g.id===id); if(!g)return;
  const tgtTxt=g.target>0?'z '+fmt(g.target):'cíl není nastaven — nastav ho tlačítkem Upravit';
  document.getElementById('addGoalInfo').innerHTML='<strong>'+esc(g.emoji)+' '+esc(g.name)+'</strong><br>Naspořeno: '+fmt(g.saved||0)+' '+tgtTxt;
  document.getElementById('addGoalAmt').value='';
  document.getElementById('overlayAddGoal').classList.add('open');
  setTimeout(()=>document.getElementById('addGoalAmt').focus(),80);
}
function confirmAddGoal(){
  const amt=parseFloat(document.getElementById('addGoalAmt').value);
  if(!amt||amt<=0){toast('Zadej částku','warn');return;}
  const g=S.goals.find(g=>g.id===addGoalId);
  if(!g){toast('Cíl nenalezen','warn');return;}
  if(!g.target){toast('Nejprve nastav cílovou částku ✏️','warn');return;}
  g.saved=Math.min(g.target,g.saved+amt);
  toast(fmt(amt)+' přidáno do '+g.emoji+' '+g.name+' ✓','success');
  save(); close2('overlayAddGoal'); render();
}
function deleteGoal(id){
  const g=S.goals.find(g=>g.id===id);
  if(g&&g.isDefault){toast('Záchranné fondy nelze smazat 🔒','warn');return;}
  if(!confirm('Opravdu smazat tento cíl?'))return;
  // Odstraň i recurring šablony navázané na tento cíl
  S.recurring=(S.recurring||[]).filter(r=>r.goalId!==id);
  S.goals=S.goals.filter(g=>g.id!==id);
  save(); toast('Cíl smazán'); render();
}

function openPlanModal(){
  const plan=curPlan();
  const lim=plan.limits||{}, inc=plan.income||{};
  const allInc=[...new Set([...allCats('income'),...Object.keys(inc)])];
  const allExp=[...new Set([...allCats('expense'),...Object.keys(lim)])];
  function row(cat,obj,dt){ return '<div class="plan-row"><span class="plan-icon">'+esc(icon(cat))+'</span><span class="plan-name">'+esc(cname(cat))+'</span><input class="plan-input" type="number" min="0" placeholder="—" data-pt="'+dt+'" data-pc="'+cat+'" value="'+(obj[cat]||'')+'"></div>'; }
  const isInherited=!S.plans[ck()];
  document.getElementById('planRows').innerHTML=
    (isInherited?'<div style="font-size:.71rem;color:var(--gold);background:var(--gold-light);border-radius:9px;padding:7px 11px;margin-bottom:10px">📋 Předvyplněno z posledního plánu. Ulož pro uložení tohoto měsíce.</div>':'')+
    '<div class="plan-sep sage">🌿 Plánované příjmy</div>'+
    '<div style="font-size:.68rem;color:var(--muted);margin-bottom:7px">Kolik plánuješ vydělat?</div>'+
    allInc.map(c=>row(c,inc,'income')).join('')+
    '<div class="plan-sep rose" style="margin-top:4px">🌸 Limity výdajů</div>'+
    '<div style="font-size:.68rem;color:var(--muted);margin-bottom:7px">Maximální měsíční útrata.</div>'+
    allExp.map(c=>row(c,lim,'expense')).join('');
  document.getElementById('overlayPlan').classList.add('open');
}
function savePlan(){
  const newLimits={}, newIncome={};
  document.querySelectorAll('#planRows input[data-pt]').forEach(inp=>{
    const type=inp.getAttribute('data-pt'),cat=inp.getAttribute('data-pc'),val=parseFloat(inp.value);
    if(type==='income'){ if(val>0) newIncome[cat]=val; }
    else               { if(val>0) newLimits[cat]=val; }
  });
  saveCurPlan(newLimits,newIncome);
  save(); close2('overlayPlan'); toast('Plán pro '+MONTHS[cM]+' uložen ✓','success'); render();
}
function copyPrevPlan(){
  // Find the most recent past month that has plan data
  const [ky,km]=ck().split('-').map(Number);
  const past=Object.keys(S.plans||{})
    .map(k=>{const[y,m]=k.split('-').map(Number);return{k,y,m};})
    .filter(({y,m,k})=>planHasData(S.plans[k])&&(y<ky||(y===ky&&m<km)))
    .sort((a,b)=>a.y!==b.y?a.y-b.y:a.m-b.m);
  if(!past.length){toast('Žádný předchozí plán nenalezen','warn');return;}
  const prev=S.plans[past[past.length-1].k];
  const lim=prev.limits||{}, inc=prev.income||{};
  document.querySelectorAll('#planRows input[data-pt]').forEach(inp=>{
    const type=inp.getAttribute('data-pt'),cat=inp.getAttribute('data-pc');
    const val=type==='income'?inc[cat]:lim[cat];
    inp.value=val||'';
  });
  toast('Hodnoty zkopírovány ✓','success');
}
function clearMonthData(){
  const inputs=document.querySelectorAll('#planRows input[data-pt]');
  if(!inputs.length){toast('Žádné položky k vymazání','warn');return;}
  const hasAny=[...inputs].some(i=>i.value&&parseFloat(i.value)>0);
  if(!hasAny){toast('Plán je již prázdný','warn');return;}
  if(!confirm(`Opravdu vymazat celý plán pro ${MONTHS[cM]} ${cY}?`))return;
  inputs.forEach(inp=>{ inp.value=''; });
  toast('Všechny hodnoty vymazány — klikni Uložit plán pro potvrzení','success');
}

let cmTabType='expense';
function openCatManager(){
  const safe=(txType==='goal'||txType==='investment')?'investment':txType==='income'?'income':'expense';
  cmTabType=safe; document.getElementById('overlayCatMgr').classList.add('open');
  setTimeout(()=>switchCmTab(safe),10);
}
function switchCmTab(type){
  cmTabType=type;
  ['expense','income','investment'].forEach(t=>{const el=document.getElementById('cmTab-'+t);if(el)el.classList.toggle('active',t===type);});
  renderCatManager();
}
function renderCatManager(){
  if(!['expense','income','investment'].includes(cmTabType)) cmTabType='expense';
  const def=DEF[cmTabType]||[],cust=S.cc[cmTabType]||[];
  let h='';
  if(def.length){
    h+='<div class="cat-section-label">Výchozí kategorie</div>';
    h+=def.map(cat=>'<div class="cat-row-item"><span style="font-size:.95rem;width:26px;text-align:center">'+esc(icon(cat))+'</span><span style="flex:1;font-size:.8rem;color:var(--muted)">'+esc(cname(cat))+'</span><span style="font-size:.62rem;color:var(--border2)">výchozí</span></div>').join('');
  }
  if(cust.length){
    h+='<div class="cat-section-label">Vlastní kategorie</div>';
    h+=cust.map((cat,i)=>{const pts=cat.split(' '),em=pts[pts.length-1]||'📦',nm=pts.slice(0,-1).join(' ')||cat;
      return '<div class="cat-row-item"><input class="cat-emoji-inp" type="text" maxlength="2" value="'+esc(em)+'" id="ce-'+i+'" oninput="liveSaveCat('+i+')"><input class="cat-name-inp" type="text" value="'+esc(nm)+'" id="cn-'+i+'" oninput="liveSaveCat('+i+')"><button class="cat-del-btn" onclick="deleteCat('+i+')" title="Smazat">×</button></div>';
    }).join('');
  }
  if(!def.length&&!cust.length) h='<div class="empty">Žádné kategorie</div>';
  document.getElementById('catManagerList').innerHTML=h;
}
function liveSaveCat(i){
  const em=document.getElementById('ce-'+i),nm=document.getElementById('cn-'+i);
  if(!em||!nm)return;
  S.cc[cmTabType][i]=(nm.value.trim()||'Bez názvu')+' '+(em.value.trim()||'📦');
  save(); if(txType===cmTabType)populateCat();
}
function deleteCat(i){ S.cc[cmTabType].splice(i,1); save(); renderCatManager(); if(txType===cmTabType)populateCat(); toast('Kategorie smazána'); }
function addCatFromMgr(){
  const em=document.getElementById('newCatEmoji').value.trim()||'📦',nm=document.getElementById('newCatNameMgr').value.trim();
  if(!nm){toast('Zadej název','warn');return;}
  const nc=nm+' '+em;
  if(!S.cc[cmTabType].includes(nc))S.cc[cmTabType].push(nc);
  save(); document.getElementById('newCatEmoji').value=''; document.getElementById('newCatNameMgr').value='';
  renderCatManager(); if(txType===cmTabType)populateCat(); toast('Kategorie přidána ✓','success');
}

let editTxId=null;
function openEditTx(id){
  const k=ck(),tx=(S.data[k]||[]).find(x=>x.id===id); if(!tx)return;
  if(tx.recurringId){showRecurringEditChoice(id);return;}
  _doOpenEditTx(id);
}
function _doOpenEditTx(id){
  const k=ck(),tx=(S.data[k]||[]).find(x=>x.id===id); if(!tx)return;
  editTxId=id;
  const ne=document.getElementById('editTxName'),ae=document.getElementById('editTxAmount'),de=document.getElementById('editTxDate'),ce=document.getElementById('editTxCat');
  if(!ne||!ae||!de||!ce)return;
  ne.value=tx.name; ae.value=tx.amount; de.value=tx.date||'';
  if(tx.goalId){
    ce.innerHTML=S.goals.map(g=>'<option value="'+g.id+'"'+(g.id===tx.goalId?' selected':'')+'>'+esc(g.name)+' '+esc(g.emoji)+'</option>').join('');
    ce.setAttribute('data-mode','goal');
  } else if(tx.portfolioId&&(S.portfolios||[]).length){
    ce.innerHTML=(S.portfolios||[]).map(p=>'<option value="'+p.id+'"'+(p.id===tx.portfolioId?' selected':'')+'>'+esc(p.emoji)+' '+esc(p.name)+'</option>').join('');
    ce.setAttribute('data-mode','portfolio');
  } else {
    ce.innerHTML=allCats(tx.type).map(c=>'<option'+(c===tx.cat?' selected':'')+'>'+esc(c)+'</option>').join('');
    ce.setAttribute('data-mode','normal');
  }
  const ekf=document.getElementById('editKindFg');
  if(ekf) ekf.style.display=tx.type==='expense'?'':'none';
  setEditKind(tx.kind||'need');
  document.getElementById('overlayEditTx').classList.add('open');
  setTimeout(()=>ne.focus(),80);
}
function saveEditTx(){
  const k=ck(),tx=(S.data[k]||[]).find(x=>x.id===editTxId); if(!tx)return;
  const oldAmt=tx.amount;
  tx.name=document.getElementById('editTxName').value.trim()||tx.name;
  tx.amount=parseFloat(document.getElementById('editTxAmount').value)||tx.amount;
  tx.date=document.getElementById('editTxDate').value;
  const ce=document.getElementById('editTxCat');
  if(ce.getAttribute('data-mode')==='goal'){
    const nid=parseInt(ce.value);
    if(tx.goalId){const og=S.goals.find(g=>g.id===tx.goalId);if(og)og.saved=Math.max(0,og.saved-oldAmt);}
    const ng=S.goals.find(g=>g.id===nid);
    if(ng){ng.saved=Math.min(ng.target,ng.saved+tx.amount);tx.goalId=nid;tx.cat=ng.name+' '+ng.emoji;}
  } else if(ce.getAttribute('data-mode')==='portfolio'){
    const nid=parseInt(ce.value);
    // Subtract old amount from previous portfolio
    if(tx.portfolioId){
      const oldPf=(S.portfolios||[]).find(p=>p.id===tx.portfolioId);
      if(oldPf) oldPf.invested=Math.max(0,(oldPf.invested||0)-oldAmt);
    }
    // Add new amount to selected portfolio
    const pf=(S.portfolios||[]).find(p=>p.id===nid);
    if(pf){pf.invested=(pf.invested||0)+tx.amount;tx.portfolioId=nid;tx.cat=pf.name+' '+pf.emoji;}
  } else {
    tx.cat=ce.value;
  }
  if(tx.type==='expense') tx.kind=editKind;
  // Sync recurring template + delete stale future instances
  if(recurringEditMode==='this_future'&&tx.recurringId){
    const tmpl=(S.recurring||[]).find(r=>r.id===tx.recurringId);
    if(tmpl){tmpl.name=tx.name;tmpl.amount=tx.amount;tmpl.cat=tx.cat;tmpl.type=tx.type;tmpl.kind=tx.kind||null;}
    _deleteFutureInstances(tx.recurringId,keyToNum(ck())+1);
  }
  recurringEditMode=null;
  save(); close2('overlayEditTx'); toast('Upraveno ✓','success'); render();
}

// ── PORTFOLIOS ──
let editPortfolioId=null, addSnapshotPortfolioId=null;

function latestSnapshot(p){
  if(!p.snapshots||!p.snapshots.length) return null;
  const sorted=[...p.snapshots].sort((a,b)=>a.date<b.date?-1:1);
  return sorted[sorted.length-1];
}

function drawSparkline(snapshots,w,h){
  // w=0 → responsive full-width (width="100%" with viewBox)
  const responsive=!w; const vbW=responsive?300:(w||110); h=h||36;
  const sorted=[...snapshots].sort((a,b)=>a.date<b.date?-1:1);
  if(sorted.length<2) return '';
  const vals=sorted.map(s=>s.value);
  const mn=Math.min(...vals),mx=Math.max(...vals),rng=mx-mn||1;
  const xStep=vbW/(vals.length-1);
  const pts=vals.map((v,i)=>{const x=i*xStep,y=h-((v-mn)/rng)*(h-6)-3;return x.toFixed(1)+','+y.toFixed(1);}).join(' ');
  const trend=vals[vals.length-1]>=vals[0];
  const col=trend?'var(--sage)':'var(--rose)';
  const lx=((vals.length-1)*xStep).toFixed(1);
  const ly=(h-((vals[vals.length-1]-mn)/rng)*(h-6)-3).toFixed(1);
  const fillCol=trend?'rgba(138,170,142,.18)':'rgba(212,128,122,.12)';
  const areapts='0,'+(h+2)+' '+pts+' '+lx+','+(h+2);
  return '<svg width="'+(responsive?'100%':vbW)+'" height="'+h+'" viewBox="0 0 '+vbW+' '+h+'" preserveAspectRatio="none" style="overflow:visible;display:block">'+
    '<polygon points="'+areapts+'" fill="'+fillCol+'"/>'+
    '<polyline points="'+pts+'" fill="none" stroke="'+col+'" stroke-width="'+(responsive?1.4:1.8)+'" stroke-linejoin="round" stroke-linecap="round"/>'+
    '<circle cx="'+lx+'" cy="'+ly+'" r="'+(responsive?3:2.5)+'" fill="'+col+'"/>'+
    '</svg>';
}

function openPortfolioModal(id){
  editPortfolioId=id||null;
  const p=id?(S.portfolios||[]).find(p=>p.id===id):null;
  document.getElementById('pfModalTitle').innerHTML=p?'Upravit <em>portfolio</em>':'Nové <em>portfolio</em>';
  document.getElementById('pfName').value=p?p.name:'';
  document.getElementById('pfEmoji').value=p?(p.emoji||'📈'):'📈';
  document.getElementById('pfInvested').value=p?(p.invested||0):'';
  document.getElementById('pfNote').value=p&&p.note?p.note:'';
  document.getElementById('overlayPortfolio').classList.add('open');
  setTimeout(()=>document.getElementById('pfName').focus(),80);
}
function savePortfolio(){
  const name=document.getElementById('pfName').value.trim();
  const emoji=document.getElementById('pfEmoji').value.trim()||'📈';
  const invested=parseFloat(document.getElementById('pfInvested').value)||0;
  const note=document.getElementById('pfNote').value.trim();
  if(!name){toast('Zadej název portfolia','warn');return;}
  if(!S.portfolios) S.portfolios=[];
  if(editPortfolioId){
    const p=S.portfolios.find(p=>p.id===editPortfolioId);
    if(p){p.name=name;p.emoji=emoji;p.invested=invested;p.note=note;}
    toast('Portfolio upraveno ✓','success');
  } else {
    S.portfolios.push({id:Date.now(),name,emoji,invested,note,snapshots:[]});
    toast(emoji+' '+name+' přidáno!','success');
  }
  save(); close2('overlayPortfolio'); render();
}
function deletePortfolio(id){
  const p=(S.portfolios||[]).find(p=>p.id===id);
  if(!p)return;
  if(!confirm('Opravdu smazat portfolio '+p.name+'? Všechny snímky hodnot budou ztraceny.'))return;
  // Unlink investment transactions that referenced this portfolio
  Object.values(S.data||{}).forEach(txs=>(txs||[]).forEach(tx=>{
    if(tx.portfolioId===id){tx.portfolioId=null;tx.cat='Investice 📈';}
  }));
  // Odstraň i recurring šablony navázané na toto portfolio
  S.recurring=(S.recurring||[]).filter(r=>r.portfolioId!==id);
  S.portfolios=S.portfolios.filter(p=>p.id!==id);
  save(); toast('Portfolio '+p.emoji+' '+p.name+' smazáno'); render();
}

function openSnapshotModal(id){
  addSnapshotPortfolioId=id;
  const p=(S.portfolios||[]).find(p=>p.id===id);
  if(!p)return;
  document.getElementById('snapPortfolioName').textContent=p.emoji+' '+p.name;
  const ls=latestSnapshot(p);
  document.getElementById('snapValue').value=ls?ls.value:'';
  document.getElementById('snapDate').value=fd(new Date());
  document.getElementById('snapNote').value='';
  document.getElementById('overlaySnapshot').classList.add('open');
  setTimeout(()=>document.getElementById('snapValue').focus(),80);
}
function saveSnapshot(){
  const value=parseFloat(document.getElementById('snapValue').value);
  const date=document.getElementById('snapDate').value||fd(new Date());
  const note=document.getElementById('snapNote').value.trim();
  if(!value||value<=0){toast('Zadej aktuální hodnotu portfolia','warn');return;}
  const p=(S.portfolios||[]).find(p=>p.id===addSnapshotPortfolioId);
  if(!p)return;
  if(!p.snapshots) p.snapshots=[];
  const existing=p.snapshots.findIndex(s=>s.date===date);
  if(existing>=0) p.snapshots[existing]={date,value,note};
  else p.snapshots.push({date,value,note});
  p.snapshots.sort((a,b)=>a.date<b.date?-1:1);
  save(); close2('overlaySnapshot'); toast('Hodnota uložena ✓','success'); render();
}

function renderInvestTab(t){
  renderInvestSummaryBar(t);
  renderPortfolioCards();
}

function renderInvestSummaryBar(t){
  const portfolios=S.portfolios||[];
  const totalInvested=portfolios.reduce((s,p)=>s+(p.invested||0),0);
  const totalValue=portfolios.reduce((s,p)=>{const ls=latestSnapshot(p);return s+(ls?ls.value:0);},0);
  const gain=totalValue-totalInvested;
  const gainPctRaw=totalInvested>0?(gain/totalInvested)*100:0;
  const gainPct=gainPctRaw; // kept as number; formatted below
  // "Tento měsíc" = only real investment transactions (not goal/savings deposits)
  const monthInvTxs=t.filter(x=>x.type==='investment'&&!x.goalId);
  const monthInv=monthInvTxs.reduce((s,x)=>s+x.amount,0);
  const monthInvN=monthInvTxs.length;
  const valuePct=totalInvested>0?Math.min(150,Math.round((totalValue/totalInvested)*100)):0;
  const g=id=>document.getElementById(id);
  if(!g('ivInvested'))return;
  g('ivInvested').textContent=totalInvested>0?fmt(totalInvested):(portfolios.length?'Nastav vloženo':'—');
  g('ivInvested').style.color=totalInvested>0?'var(--gold)':'var(--muted)';
  g('ivInvestedSub').textContent=portfolios.length?portfolios.length+' portfoli'+(portfolios.length===1?'o':'í'):'Přidej portfolio';
  g('ivValue').textContent=totalValue>0?fmt(totalValue):'—';
  g('ivValue').style.color=totalValue>0?(gain>=0?'var(--sage)':'var(--rose)'):'var(--muted)';
  g('ivValueSub').textContent=totalValue>0&&totalInvested>0?valuePct+' % investované částky':'';
  g('ivFill').style.width=Math.min(100,valuePct)+'%';
  g('ivFill').style.background=gain>=0?'var(--sage)':'var(--rose)';
  g('ivGain').textContent=totalInvested>0&&totalValue>0?(gain>=0?'+':'')+fmt(gain):'—';
  g('ivGain').style.color=gain>=0?'var(--sage)':'var(--rose)';
  g('ivGainSub').textContent=totalInvested>0&&totalValue>0?(gainPct>=0?'+':'')+gainPct.toFixed(2).replace('.',',')+' % celkem':'';
  g('ivMonth').textContent=monthInv>0?fmt(monthInv):'—';
  g('ivMonth').style.color=monthInv>0?'var(--gold)':'var(--muted)';
  g('ivMonthSub').textContent=monthInvN>0?plur(monthInvN,'transakce','transakce','transakcí')+' · '+MONTHS[cM]:'žádné tento měsíc';
}

function renderPortfolioCards(){
  const el=document.getElementById('portfolioGrid');
  if(!el)return;
  const portfolios=S.portfolios||[];
  if(!portfolios.length){
    el.innerHTML='<div class="empty" style="grid-column:span 2;padding:26px 0"><strong>📈</strong>Zatím žádné portfolio.<br>Přidej první kliknutím výše.</div>';
    return;
  }
  el.innerHTML=portfolios.map(p=>portfolioCard(p)).join('');
}

function portfolioCard(p){
  const snapshots=(p.snapshots||[]).slice().sort((a,b)=>a.date<b.date?-1:1);
  const ls=snapshots.length?snapshots[snapshots.length-1]:null;
  const val=ls?ls.value:0;
  const invested=p.invested||0;
  const gain=ls?val-invested:0;
  // Gain % with 2 decimal places
  const gainPctRaw=invested>0?(gain/invested)*100:0;
  const gainPctStr=ls&&invested?(gainPctRaw>=0?'+':'')+gainPctRaw.toFixed(2).replace('.',',')+' %':'—';
  const gainCol=gain>=0?'var(--sage)':'var(--rose)';
  const valPct=invested>0?Math.min(100,Math.round((val/invested)*100)):0;
  // Dates: last snapshot for "Aktualizováno", first snapshot for "Založeno"
  const updDate=ls?new Date(ls.date+' 12:00'):null;
  const updStr=updDate?updDate.getDate()+'. '+MONTHS_GEN[updDate.getMonth()]+' '+updDate.getFullYear():'';
  const firstDate=snapshots.length>1?new Date(snapshots[0].date+' 12:00'):null;
  const foundedStr=firstDate?MONTHS[firstDate.getMonth()]+' '+firstDate.getFullYear():'';
  const dateStr=updStr
    ?(foundedStr?'Založeno: '+foundedStr+' · Aktualizováno: '+updStr:'Aktualizováno: '+updStr)
    :'';
  // Full-width sparkline (w=0 → responsive)
  const spark=snapshots.length>=2?drawSparkline(snapshots,0,52):'';
  return '<div class="pf-card">'+
    // Header: name + note only
    '<div class="pf-header" style="margin-bottom:'+(spark?'10px':'11px')+'">'+
      '<div class="pf-name">'+esc(p.emoji)+' '+esc(p.name)+
        (p.note?'<div style="font-size:.63rem;font-weight:400;font-family:Jost,sans-serif;color:var(--muted);margin-top:2px">'+esc(p.note)+'</div>':'')+
      '</div>'+
    '</div>'+
    // Full-width sparkline row
    (spark?'<div style="margin:0 0 12px;border-radius:8px;overflow:hidden;background:var(--bg2);padding:6px 0 2px">'+spark+'</div>':'')+
    '<div class="pf-metrics">'+
      '<div class="pf-metric"><div class="pf-m-lbl">Vloženo</div><div class="pf-m-val">'+( invested?fmt(invested):'—')+'</div></div>'+
      '<div class="pf-metric"><div class="pf-m-lbl">Hodnota</div><div class="pf-m-val" style="color:'+(val?gainCol:'var(--muted)')+'">'+( val?fmt(val):'—')+'</div></div>'+
      '<div class="pf-metric"><div class="pf-m-lbl">Výnos</div><div class="pf-m-val" style="color:'+(ls&&invested?gainCol:'var(--muted)')+'">'+gainPctStr+'</div></div>'+
    '</div>'+
    (ls&&invested
      ?'<div class="pf-prog"><div class="pf-prog-fill" style="width:'+valPct+'%;background:'+gainCol+'"></div></div>'
      :'<div style="height:4px;margin-bottom:7px"></div>')+
    '<div class="pf-date">'+(dateStr?'📅 '+dateStr:'<span style="color:var(--gold)">⚡ Přidej hodnotu pro sledování vývoje</span>')+'</div>'+
    '<div class="pf-acts">'+
      '<button class="gbtn" onclick="openSnapshotModal('+p.id+')">📊 Přidat hodnotu</button>'+
      '<button class="gbtn" onclick="openPortfolioModal('+p.id+')">✏️ Upravit</button>'+
      '<button class="gbtn del" onclick="deletePortfolio('+p.id+')">× Smazat</button>'+
    '</div></div>';
}

// ── RECURRING ──
function keyToNum(k){const[y,m]=k.split('-').map(Number);return y*12+m;}

function ensureRecurringInstances(){
  if(!(S.recurring||[]).length) return;
  const key=ck(), kn=keyToNum(key);
  let changed=false;
  S.recurring.forEach((tmpl,i)=>{
    if(kn<keyToNum(tmpl.startKey)) return;
    if(tmpl.endKey&&kn>keyToNum(tmpl.endKey)) return;
    if((tmpl.skippedKeys||[]).includes(key)) return;
    if((S.data[key]||[]).some(tx=>tx.recurringId===tmpl.id)) return;
    // Přeskoč vklad na cíl, který je už splněn
    if(tmpl.goalId){const g=S.goals.find(g=>g.id===tmpl.goalId);if(g&&(g.saved||0)>=g.target)return;}
    if(!S.data[key]) S.data[key]=[];
    const inst={id:Date.now()+i,recurringId:tmpl.id,name:tmpl.name,amount:tmpl.amount,
      cat:tmpl.cat,type:tmpl.type,date:fd(new Date(cY,cM,1))};
    if(tmpl.kind) inst.kind=tmpl.kind;
    if(tmpl.goalId) inst.goalId=tmpl.goalId;
    if(tmpl.portfolioId) inst.portfolioId=tmpl.portfolioId;
    S.data[key].push(inst);
    if(tmpl.goalId){const g=S.goals.find(g=>g.id===tmpl.goalId);if(g)g.saved=Math.min(g.target,(g.saved||0)+tmpl.amount);}
    if(tmpl.portfolioId){const pf=(S.portfolios||[]).find(p=>p.id===tmpl.portfolioId);if(pf)pf.invested=(pf.invested||0)+tmpl.amount;}
    changed=true;
  });
  if(changed) save();
}

function _doDeleteSingleTx(id){
  const k=ck(),tx=(S.data[k]||[]).find(x=>x.id===id); if(!tx) return;
  if(tx.portfolioId){const pf=(S.portfolios||[]).find(p=>p.id===tx.portfolioId);if(pf)pf.invested=Math.max(0,(pf.invested||0)-tx.amount);}
  if(tx.goalId){const g=S.goals.find(g=>g.id===tx.goalId);if(g)g.saved=Math.max(0,(g.saved||0)-tx.amount);}
  S.data[k]=(S.data[k]||[]).filter(t=>t.id!==id);
  save(); toast('Smazáno'); render();
}

function _deleteFutureInstances(recId,fromKn){
  Object.keys(S.data).forEach(mk=>{
    if(keyToNum(mk)<fromKn) return;
    S.data[mk]=(S.data[mk]||[]).filter(tx=>{
      if(tx.recurringId!==recId) return true;
      if(tx.goalId){const g=S.goals.find(g=>g.id===tx.goalId);if(g)g.saved=Math.max(0,(g.saved||0)-tx.amount);}
      if(tx.portfolioId){const pf=(S.portfolios||[]).find(p=>p.id===tx.portfolioId);if(pf)pf.invested=Math.max(0,(pf.invested||0)-tx.amount);}
      return false;
    });
  });
}

function showRecurringDeleteChoice(txId){
  document.getElementById('recurringChoiceTitle').innerHTML='Smazat opakující se <em>transakci</em>';
  document.getElementById('recurringChoiceBody').innerHTML=
    '<p style="font-size:.78rem;color:var(--text2);margin:0 0 16px;line-height:1.6">Tato transakce se opakuje každý měsíc.<br>Co chceš smazat?</p>'+
    '<div style="display:flex;flex-direction:column;gap:8px">'+
      '<button class="mbtn-ok" onclick="doDeleteRecurring('+txId+',\'this\')">Jen tuto</button>'+
      '<button class="mbtn-ok" style="background:var(--mauve)" onclick="doDeleteRecurring('+txId+',\'this_future\')">Tuto a všechny budoucí</button>'+
      '<button class="mbtn-cancel" style="color:var(--mauve);border-color:var(--mauve)" onclick="doDeleteRecurring('+txId+',\'future_only\')">Jen budoucí (tuto nechat)</button>'+
      '<button class="mbtn-cancel" onclick="close2(\'overlayRecurring\')">Zrušit</button>'+
    '</div>';
  document.getElementById('overlayRecurring').classList.add('open');
}

function doDeleteRecurring(txId,mode){
  close2('overlayRecurring');
  const k=ck(), kn=keyToNum(k);
  const tx=(S.data[k]||[]).find(x=>x.id===txId); if(!tx) return;
  const recId=tx.recurringId;
  const tmpl=(S.recurring||[]).find(r=>r.id===recId);
  if(mode==='this'){
    if(tmpl){if(!tmpl.skippedKeys)tmpl.skippedKeys=[];tmpl.skippedKeys.push(k);}
    _doDeleteSingleTx(txId);
  } else if(mode==='this_future'){
    if(tmpl){let pm=cM-1,py=cY;if(pm<0){pm=11;py--;}tmpl.endKey=`${py}-${pm}`;}
    _deleteFutureInstances(recId,kn+1); // jen budoucí měsíce; aktuální smaže _doDeleteSingleTx
    _doDeleteSingleTx(txId);
  } else if(mode==='future_only'){
    if(tmpl) tmpl.endKey=k;
    _deleteFutureInstances(recId,kn+1);
    save(); toast('Budoucí opakování zastaveno 🔁','success'); render();
  }
}

let recurringEditMode=null;
function showRecurringEditChoice(txId){
  document.getElementById('recurringChoiceTitle').innerHTML='Upravit opakující se <em>transakci</em>';
  document.getElementById('recurringChoiceBody').innerHTML=
    '<p style="font-size:.78rem;color:var(--text2);margin:0 0 16px;line-height:1.6">Tato transakce se opakuje každý měsíc.<br>Co chceš upravit?</p>'+
    '<div style="display:flex;flex-direction:column;gap:8px">'+
      '<button class="mbtn-ok" onclick="doEditRecurring('+txId+',\'this\')">Jen tuto</button>'+
      '<button class="mbtn-ok" style="background:var(--mauve)" onclick="doEditRecurring('+txId+',\'this_future\')">Tuto a všechny budoucí</button>'+
      '<button class="mbtn-cancel" onclick="close2(\'overlayRecurring\')">Zrušit</button>'+
    '</div>';
  document.getElementById('overlayRecurring').classList.add('open');
}

function doEditRecurring(txId,mode){
  close2('overlayRecurring');
  const k=ck(),tx=(S.data[k]||[]).find(x=>x.id===txId); if(!tx) return;
  if(mode==='this'){
    const tmpl=(S.recurring||[]).find(r=>r.id===tx.recurringId);
    if(tmpl){if(!tmpl.skippedKeys)tmpl.skippedKeys=[];tmpl.skippedKeys.push(k);}
    delete tx.recurringId;
    save();
  } else {
    recurringEditMode='this_future';
  }
  _doOpenEditTx(txId);
}

// ── ONBOARDING ──
function renderOnboarding(){
  const el=document.getElementById('onboardingArea');
  if(!el)return;
  if(activeTab!=='overview'||localStorage.getItem('bb8_welcomed')){el.innerHTML='';document.body.classList.remove('onboarding-active');return;}
  // Zajetý uživatel: data ve více měsících → automaticky přeskočit
  const monthsWithData=Object.keys(S.data).filter(k=>(S.data[k]||[]).length>0).length;
  if(monthsWithData>1){localStorage.setItem('bb8_welcomed','1');el.innerHTML='';document.body.classList.remove('onboarding-active');return;}
  const t=txs();
  const hasIncome =t.some(x=>x.type==='income');
  const hasExpense=t.some(x=>x.type==='expense');
  // Cíl = vlastní goal NEBO investiční transakce (kdo investuje, šetří)
  const hasGoal=(S.goals||[]).some(g=>!g.isDefault&&g.target>0)||t.some(x=>x.type==='investment');
  // Auto-dismiss when all 3 done
  if(hasIncome&&hasExpense&&hasGoal){localStorage.setItem('bb8_welcomed','1');el.innerHTML='';document.body.classList.remove('onboarding-active');return;}
  document.body.classList.add('onboarding-active');
  const done=[hasIncome,hasExpense,hasGoal].filter(Boolean).length;
  function step(ok,num,title,desc,action,btnLabel){
    return '<div style="display:flex;align-items:flex-start;gap:12px;padding:10px 0;border-bottom:1px solid rgba(180,100,80,.12)">'+
      '<div style="width:28px;height:28px;border-radius:50%;flex-shrink:0;display:flex;align-items:center;justify-content:center;font-size:.78rem;font-weight:700;margin-top:1px;'+(ok?'background:var(--sage);color:#fff':'background:var(--rose-light);color:var(--rose);border:1.5px solid var(--rose-mid)')+'">'+
        (ok?'✓':num)+
      '</div>'+
      '<div style="flex:1">'+
        '<div style="font-size:.83rem;font-weight:600;color:var(--text);'+(ok?'opacity:.45;text-decoration:line-through':'')+'">'+title+'</div>'+
        (!ok?'<div style="font-size:.71rem;color:var(--text2);margin-top:2px;line-height:1.5">'+desc+'</div>'+
          '<button onclick="'+action+'" style="margin-top:7px;padding:4px 13px;background:var(--rose);border:none;border-radius:20px;color:#fff;font-family:\'Jost\',sans-serif;font-size:.71rem;font-weight:500;cursor:pointer;transition:opacity .2s" onmouseenter="this.style.opacity=\'.8\'" onmouseleave="this.style.opacity=\'1\'">'+btnLabel+'</button>':'')+
      '</div>'+
    '</div>';
  }
  el.innerHTML=
    '<div style="background:linear-gradient(135deg,#fef5f3 0%,#f6edf5 100%);border:1px solid var(--rose-mid);border-radius:var(--r);padding:20px 22px;margin-bottom:18px;box-shadow:var(--shadow)">'+
      '<div style="display:flex;align-items:flex-start;justify-content:space-between;margin-bottom:12px">'+
        '<div>'+
          '<div style="font-family:\'Cormorant Garamond\',serif;font-size:1.18rem;font-weight:600;color:var(--text)">👑 Vítej v Budget Queen!</div>'+
          '<div style="font-size:.67rem;color:var(--muted);margin-top:3px;letter-spacing:.3px">'+done+' ze 3 kroků hotovo — pojďme na to</div>'+
        '</div>'+
        '<button onclick="dismissOnboarding()" title="Přeskočit průvodce" style="background:none;border:none;color:var(--muted);cursor:pointer;font-size:.72rem;padding:4px 8px;border-radius:8px;white-space:nowrap;transition:color .2s" onmouseenter="this.style.color=\'var(--rose)\'" onmouseleave="this.style.color=\'var(--muted)\'">přeskočit ×</button>'+
      '</div>'+
      '<div style="height:4px;background:rgba(180,100,80,.12);border-radius:4px;margin-bottom:14px;overflow:hidden">'+
        '<div style="height:100%;width:'+Math.round(done/3*100)+'%;background:linear-gradient(90deg,var(--rose-mid),var(--mauve));border-radius:4px;transition:width .8s cubic-bezier(.4,0,.2,1)"></div>'+
      '</div>'+
      step(hasIncome,'1','Přidej příjem','Zaznamenej, kolik jsi tento měsíc vydělala — základ pro všechny výpočty.',"openTxModal();setTimeout(function(){setTxType('income')},60)",'+ Přidat příjem')+
      step(hasExpense,'2','Přidej výdaj','Co jsi tento měsíc utratila? Přidej alespoň jeden výdaj.',"openTxModal()",'+ Přidat výdaj')+
      step(hasGoal,'3','Nastav si cíl','Na co šetříš? Dovolená, auto, nebo jen finanční polštář.',"switchTab('goals')",'🎯 Jít na cíle')+
    '</div>';
}
function dismissOnboarding(){
  localStorage.setItem('bb8_welcomed','1');
  document.body.classList.remove('onboarding-active');
  const el=document.getElementById('onboardingArea');
  if(el) el.innerHTML='';
}

// ── RENDER ──
// ── ERROR BOUNDARY HELPERS ──
function showAppError(e){
  let el=document.getElementById('bq-app-error');
  if(!el){
    el=document.createElement('div');el.id='bq-app-error';
    el.style.cssText='position:fixed;top:0;left:0;right:0;z-index:9999;background:#d4807a;color:#fff;padding:12px 20px;font-family:Jost,sans-serif;font-size:.85rem;display:flex;align-items:center;gap:12px;box-shadow:0 4px 16px rgba(0,0,0,.2)';
    document.body.appendChild(el);
  }
  el.innerHTML='<span>⚠️ Chyba při vykreslení — tvá data jsou v pořádku.</span>'
    +'<button onclick="location.reload()" style="background:#fff;color:#d4807a;border:none;border-radius:50px;padding:5px 14px;font-size:.8rem;font-weight:600;cursor:pointer;margin-left:auto;flex-shrink:0">Obnovit stránku</button>'
    +'<button onclick="document.getElementById(\'bq-app-error\').remove()" style="background:rgba(255,255,255,.2);border:none;color:#fff;border-radius:50%;width:24px;height:24px;cursor:pointer;font-size:1.1rem;line-height:1;flex-shrink:0">×</button>';
  console.error('[BQ] render() crash:',e);
}
function safeRenderError(containerId,e){
  console.error('[BQ] render error in #'+containerId+':',e);
  const el=document.getElementById(containerId);
  if(el) el.innerHTML='<div style="padding:16px;text-align:center;color:var(--muted);font-size:.8rem">⚠️ Chyba při načítání — <button onclick="render()" style="background:none;border:none;color:var(--rose);cursor:pointer;text-decoration:underline;font-size:.8rem">zkusit znovu</button></div>';
}

function render(){
  try{
  ensureRecurringInstances();
  syncCurrencyPicker();
  document.getElementById('monthLabel').textContent=MONTHS[cM]+' '+cY;
  const t=txs();
  const income =t.filter(x=>x.type==='income').    reduce((s,x)=>s+x.amount,0);
  const expense=t.filter(x=>x.type==='expense').   reduce((s,x)=>s+x.amount,0);
  const invest =t.filter(x=>x.type==='investment').reduce((s,x)=>s+x.amount,0);
  const monthNet=income-expense-invest;
  const rate=income>0?Math.round((invest/income)*100):0;

  document.getElementById('sIncome').textContent=fmt(income);
  document.getElementById('sExpense').textContent=fmt(expense);
  document.getElementById('sInvest').textContent=fmt(invest);
  document.getElementById('sBalance').textContent=fmt(monthNet);
  document.getElementById('sIncomeC').textContent=plur(t.filter(x=>x.type==='income').length,'položka','položky','položek');
  document.getElementById('sExpenseC').textContent=plur(t.filter(x=>x.type==='expense').length,'položka','položky','položek');
  document.getElementById('sInvestC').textContent=plur(t.filter(x=>x.type==='investment').length,'položka','položky','položek');
  document.getElementById('sBalanceSub').textContent=income>0?(monthNet>=0?'✓ v plusu tento měsíc':'↓ deficit tento měsíc'):'Přidej příjmy a výdaje';
  document.getElementById('pExpense').style.width=(income>0?Math.min(100,(expense/income)*100):0)+'%';
  document.getElementById('pInvest').style.width=(income>0?Math.min(100,(invest/income)*100):0)+'%';
  document.getElementById('pBalance').style.width=(income>0?Math.max(0,Math.min(100,(monthNet/income)*100)):0)+'%';
  // Carry button: show if previous month had a positive net and it hasn't been added yet
  const carryBtn=document.getElementById('sCarryBtn');
  if(carryBtn){
    let pm=cM-1,py=cY; if(pm<0){pm=11;py--;}
    const pKey=`${py}-${pm}`, pt=S.data[pKey]||[];
    const prevNet=pt.filter(x=>x.type==='income').reduce((a,x)=>a+x.amount,0)
                 -pt.filter(x=>x.type==='expense').reduce((a,x)=>a+x.amount,0)
                 -pt.filter(x=>x.type==='investment').reduce((a,x)=>a+x.amount,0);
    const alreadyAdded=(S.data[ck()]||[]).some(x=>x.type==='income'&&x.cat==='Přenesený zůstatek 💰');
    if(prevNet>0&&!alreadyAdded){carryBtn.style.display='';carryBtn.textContent='📥 Přidat '+fmt(prevNet)+' z '+MS[pm];}
    else{carryBtn.style.display='none';}
  }

  // Health score
  let h=0;
  if(income>0)h+=20; if(expense<income)h+=20;
  if(rate>=20)h+=25; else if(rate>=10)h+=12;
  if((S.goals||[]).some(g=>!g.isDefault&&g.target>0))h+=15; if(Object.keys(curLimits()).length>0)h+=10; if(monthNet>0)h+=10;
  h=Math.min(100,h);
  const hc=h>=70?'var(--sage)':h>=40?'var(--gold)':'var(--rose)';
  const hm=h>=80?'💚 Výborné finanční zdraví!':h>=60?'🌿 Dobré — ještě trochu zapracovat':h>=40?'⚠️ Průměrné — nastav si plán':'🌸 Začni přidáním příjmů a cílů';
  const hsFill=document.getElementById('hsFill'),hsPct=document.getElementById('hsPct'),hsMsg=document.getElementById('hsMsg');
  if(hsFill) hsFill.style.cssText='width:'+h+'%;background:'+hc;
  if(hsPct)  hsPct.textContent=h+'%';
  if(hsMsg){ hsMsg.textContent=hm; hsMsg.style.color=hc; }
  // Savings ring
  const circ=144.5,offset=circ-(Math.min(rate,100)/100)*circ;
  const srCircle=document.getElementById('srCircle'),srNum=document.getElementById('srNum'),srGoalText=document.getElementById('srGoalText');
  if(srCircle) srCircle.style.strokeDashoffset=Math.max(0,offset);
  if(srNum)    srNum.textContent=rate+'%';
  if(srGoalText){ srGoalText.textContent=rate>=20?'✓ Cíl 20 % splněn!':'Cíl: min. 20 % (ještě '+(20-rate)+' %)'; srGoalText.style.color=rate>=20?'var(--sage)':'var(--muted)'; }
  // Savings target: how much 20% of this month's income is
  const srTargetEl=document.getElementById('srTarget');
  if(srTargetEl){
    if(income>0){
      const target20=Math.round(income*0.2);
      const actual=invest;
      if(rate>=20){
        srTargetEl.textContent='✓ Spoříte '+fmt(actual)+' z '+fmt(income);
        srTargetEl.style.color='var(--sage)';
      } else {
        srTargetEl.textContent='20 % = '+fmt(target20)+' · chybí '+fmt(Math.max(0,target20-actual));
        srTargetEl.style.color='var(--mauve)';
      }
    } else {
      srTargetEl.textContent='';
    }
  }

  renderOnboarding();
  if(activeTab==='overview'){
    try{renderTxList();}catch(e){safeRenderError('txList',e);}
    try{renderGoalsMini();}catch(e){safeRenderError('goalsMini',e);}
    try{renderInsights(t,income,expense,invest,rate);}catch(e){safeRenderError('insightArea',e);}
    try{renderSavingsTrend();}catch(e){safeRenderError('savingsTrend',e);}
    try{renderDonut('donutSvg2','donutLegend2',expense,t.filter(x=>x.type==='expense'));}catch(e){console.error('[BQ] donut',e);}
  }
  if(activeTab==='budget')   {try{renderBudget(t);}catch(e){safeRenderError('budgetList',e);}}
  if(activeTab==='goals')    {try{renderSavingsBar();renderDefaultFunds();renderGoalsList(t);renderGoalsInsights();}catch(e){safeRenderError('goalsList',e);}}
  if(activeTab==='invest')   {try{renderInvestTab(t);}catch(e){safeRenderError('portfolioGrid',e);}}
  }catch(e){showAppError(e);}
}

function renderTxList(){
  const t=txs(), filtered=txFilter==='all'?t:t.filter(x=>x.type===txFilter);
  const el=document.getElementById('txList');
  if(!filtered.length){el.innerHTML='<div class="empty"><strong>'+(txFilter==='all'?'🌸':'')+'</strong>'+(txFilter==='all'?'Zatím žádné transakce.<br>Klikni + Přidat nebo stiskni N.':'Žádné transakce v této kategorii.')+'</div>';return;}
  el.innerHTML=[...filtered].reverse().map(x=>{
    const bg=x.type==='income'?'#e8f5ec':x.type==='investment'?'#faf2e0':'#fdf0ee';
    const cls=x.type==='income'?'pos':x.type==='investment'?'inv':'neg';
    const pfx=x.type==='income'?'+':x.type==='investment'?'▲':'-';
    return '<div class="tx-item">'+
      '<div class="tx-icon" style="background:'+bg+'">'+icon(x.cat)+'</div>'+
      '<div class="tx-info"><div class="tx-name">'+esc(x.name)+'</div>'+
      '<div class="tx-meta"><span>'+esc(cname(x.cat))+'</span>'+(x.date?'<span>'+fmtDate(x.date)+'</span>':'')+(x.kind==='want'?'<span style="color:var(--mauve)">🎉</span>':x.kind==='need'?'<span style="color:var(--sage)">🏠</span>':'')+(x.recurringId?'<span title="Opakující se každý měsíc" style="color:var(--rose-mid);font-size:.65rem">🔁</span>':'')+'</div></div>'+
      '<div class="tx-amount '+cls+'">'+pfx+fmt(x.amount)+'</div>'+
      '<div class="tx-actions">'+
        '<button class="tx-act-btn edit-btn" onclick="openEditTx('+x.id+')" title="Upravit">✏</button>'+
        '<button class="tx-act-btn" onclick="deleteTx('+x.id+')" title="Smazat">×</button>'+
      '</div></div>';
  }).join('');
}


function renderInsights(t,income,expense,invest,rate){
  const el=document.getElementById('insightArea');
  const hints=[];
  if(income===0) hints.push({type:'info',icon:'💡',msg:'Přidej příjmy za '+MONTHS[cM]+', aby dashboard fungoval naplno.'});
  const expA={};
  t.filter(x=>x.type==='expense').forEach(x=>{expA[x.cat]=(expA[x.cat]||0)+x.amount;});
  const limI=curLimits();
  const over=Object.keys(limI).filter(c=>expA[c]>limI[c]);
  if(over.length) hints.push({type:'warn',icon:'⚠️',msg:'Překročen limit: '+over.map(c=>cname(c)).join(', ')+'.'});
  el.innerHTML=hints.slice(0,2).map(h=>'<div class="insight '+h.type+'"><span class="insight-icon">'+h.icon+'</span>'+h.msg+'<button class="insight-close" onclick="this.closest(\'.insight\').remove()" title="Zavřít">×</button></div>').join('');
}

function renderSavingsTrend(){
  const months=[];
  for(let i=4;i>=0;i--){let m=cM-i,y=cY;if(m<0){m+=12;y--;}const k=`${y}-${m}`,t=S.data[k]||[];const inc=t.filter(x=>x.type==='income').reduce((s,x)=>s+x.amount,0);const inv=t.filter(x=>x.type==='investment').reduce((s,x)=>s+x.amount,0);months.push({label:MS[m],rate:inc>0?Math.round((inv/inc)*100):null});}
  const el=document.getElementById('savingsTrend');
  const max=Math.max(...months.filter(m=>m.rate!==null).map(m=>m.rate),20);
  el.innerHTML=months.map(m=>{
    if(m.rate===null) return '<div class="bc-row"><div class="bc-label" style="color:var(--border2)">'+m.label+'</div><div class="bc-bars"><div class="bc-bar-wrap"><div class="bc-bar" style="width:100%;background:var(--border)"></div></div></div><div class="bc-val" style="color:var(--border2)">—</div></div>';
    const col=m.rate>=20?'var(--sage)':m.rate>=10?'var(--gold)':'var(--rose)';
    return '<div class="bc-row"><div class="bc-label">'+m.label+'</div><div class="bc-bars"><div class="bc-bar-wrap"><div class="bc-bar" style="width:'+Math.round((m.rate/max)*100)+'%;background:'+col+'"></div></div></div><div class="bc-val">'+m.rate+'%</div></div>';
  }).join('');
}

function renderGoalsMini(){
  const el=document.getElementById('goalsMini');
  const withTarget=S.goals.filter(g=>g.target>0);
  if(!withTarget.length){el.innerHTML='<div class="empty"><strong>🎯</strong>Žádné aktivní cíle.<br>Nastav cílovou částku v záložce Úspory.</div>';return;}
  const cards=withTarget.map(g=>{
    const pct=Math.min(100,Math.round(((g.saved||0)/g.target)*100));
    const bc=pct>=100?'var(--sage)':pct>=75?'var(--gold)':'var(--rose-mid)';
    return '<div class="goal-mini" onclick="openAddGoalModal('+g.id+')">'+
      '<div style="font-size:1.15rem">'+esc(g.emoji)+'</div>'+
      '<div class="goal-mini-info">'+
        '<div class="goal-mini-name">'+esc(g.name)+'<span class="g-badge'+(pct>=100?' done':' active')+'">'+(pct>=100?'✓':pct+'%')+'</span></div>'+
        '<div class="goal-mini-nums">'+fmt(g.saved)+' / '+fmt(g.target)+'</div>'+
        '<div class="goal-mini-bar"><div class="goal-mini-fill" style="width:'+pct+'%;background:'+bc+'"></div></div>'+
      '</div></div>';
  }).join('');
  el.innerHTML='<div class="goal-mini-list">'+cards+'</div>';
}

function goalCard(g){
  const pct=g.target?Math.min(100,Math.round(((g.saved||0)/g.target)*100)):0;
  const bc=pct>=100?'background:var(--sage)':pct>=75?'background:var(--gold)':'';
  const monthly=calcGoalMonthly(g.target,g.saved,g.deadline);
  const dlDate=g.deadline?new Date(g.deadline):null;
  const dlStr=dlDate?dlDate.getDate()+'. '+MONTHS[dlDate.getMonth()]+' '+dlDate.getFullYear():'';
  const deadlineLine=g.deadline&&pct<100
    ?'<div style="font-size:.67rem;color:var(--mauve);margin-bottom:7px;display:flex;gap:8px;flex-wrap:wrap">'+
      '<span>📅 Do: '+dlStr+'</span>'+
      (monthly>0?'<span>· '+fmt(monthly)+' / měs.</span>':'<span>· Cíl splněn ✓</span>')+
    '</div>':'';
  return '<div class="goal-card">'+
    '<div class="goal-top"><span class="goal-emoji">'+esc(g.emoji)+'</span><span class="goal-gname">'+esc(g.name)+'</span>'+
    '<span class="goal-badge'+(pct>=100?' done':'')+'">'+(pct>=100?'✓ Splněno':pct+'%')+'</span></div>'+
    '<div class="goal-nums"><span>'+fmt(g.saved||0)+' naspořeno</span><span>cíl: '+fmt(g.target)+'</span></div>'+
    '<div class="goal-bar-wrap"><div class="goal-bar-fill" style="width:'+pct+'%;'+bc+'"></div></div>'+
    deadlineLine+
    '<div class="goal-acts">'+
      '<button class="gbtn" onclick="openAddGoalModal('+g.id+')">💸 Přidat</button>'+
      '<button class="gbtn" onclick="openEditGoalModal('+g.id+')">✏️ Upravit</button>'+
      '<button class="gbtn del" onclick="deleteGoal('+g.id+')">× Smazat</button>'+
    '</div></div>';
}
function renderGoalsList(t){
  const el=document.getElementById('goalsList');
  const custom=(S.goals||[]).filter(g=>!g.isDefault);
  if(!custom.length){el.innerHTML='<div class="empty"><strong>🎯</strong>Zatím žádné vlastní cíle.<br>Klikni + Přidat cíl!</div>';return;}
  el.innerHTML=custom.map(g=>{
    const linked=(t||[]).filter(x=>x.goalId===g.id);
    const lh=linked.length?'<div style="margin-top:7px;display:flex;flex-direction:column;gap:4px">'+
      linked.map(x=>'<div style="display:flex;align-items:center;gap:8px;font-size:.69rem;color:var(--text2);background:var(--bg);border-radius:8px;padding:5px 9px">'+
        (x.date?'<span style="color:var(--muted)">'+fmtDate(x.date)+'</span>':'')+'<span style="flex:1">'+esc(x.name)+'</span>'+
        '<span style="color:var(--mauve);font-weight:600">+'+fmt(x.amount)+'</span></div>').join('')+'</div>':'';
    return goalCard(g)+lh;
  }).join('');
}


function renderDonut(svgId,legId,total,arr){
  const svg=document.getElementById(svgId),leg=document.getElementById(legId),cats=cmap(arr);
  const ctrVal=document.getElementById('donutCenterVal'),ctrLbl=document.getElementById('donutCenterLbl');
  // Default center state
  function resetCenter(){
    if(!ctrVal||!ctrLbl)return;
    ctrVal.textContent=fmt(total);
    ctrVal.style.fontSize='1.1rem';
    ctrLbl.textContent='celkem výdaje';
    ctrVal.style.color='var(--text)';
  }
  if(!cats.length||!total){
    svg.innerHTML='<text x="110" y="115" text-anchor="middle" font-family="Cormorant Garamond,serif" font-size="15" fill="#b08c84">žádná data</text>';
    if(leg)leg.innerHTML='';
    if(ctrVal)ctrVal.textContent='';
    if(ctrLbl)ctrLbl.textContent='';
    return;
  }
  // Larger donut for the 220×220 viewBox
  const cx=110,cy=110,r=88,ri=56;
  let angle=-Math.PI/2,paths='';
  if(cats.length===1){
    const [cat,val]=cats[0],col=PAL[0];
    paths='<circle cx="'+cx+'" cy="'+cy+'" r="'+((r+ri)/2)+'" fill="none" stroke="'+col+'" stroke-width="'+(r-ri)+'" opacity=".88" style="cursor:pointer" data-name="'+cname(cat)+'" data-val="'+fmt(val)+'" data-pct="100" data-col="'+col+'">'+
      '<title>'+cname(cat)+': '+fmt(val)+' (100%)</title></circle>';
  } else {
    cats.forEach(([cat,val],i)=>{
      const sl=(val/total)*2*Math.PI;
      const x1=cx+r*Math.cos(angle),y1=cy+r*Math.sin(angle);
      const x2=cx+r*Math.cos(angle+sl),y2=cy+r*Math.sin(angle+sl);
      const xi1=cx+ri*Math.cos(angle),yi1=cy+ri*Math.sin(angle);
      const xi2=cx+ri*Math.cos(angle+sl),yi2=cy+ri*Math.sin(angle+sl);
      const lg=sl>Math.PI?1:0,col=PAL[i%PAL.length];
      const pct=Math.round((val/total)*100);
      paths+='<path d="M'+xi1+','+yi1+' L'+x1+','+y1+' A'+r+','+r+' 0 '+lg+',1 '+x2+','+y2+' L'+xi2+','+yi2+' A'+ri+','+ri+' 0 '+lg+',0 '+xi1+','+yi1+'"'+
        ' fill="'+col+'" opacity=".88" style="cursor:pointer;transition:opacity .15s"'+
        ' data-name="'+cname(cat)+'" data-val="'+fmt(val)+'" data-pct="'+pct+'" data-col="'+col+'">'+
        '<title>'+cname(cat)+': '+fmt(val)+' ('+pct+'%)</title></path>';
      angle+=sl;
    });
  }
  svg.innerHTML=paths;
  resetCenter();
  // Hover interactions
  svg.querySelectorAll('[data-name]').forEach(p=>{
    p.addEventListener('mouseenter',()=>{
      if(!ctrVal||!ctrLbl)return;
      ctrVal.textContent=p.getAttribute('data-val');
      ctrLbl.innerHTML=p.getAttribute('data-name')+'<br><span style="font-size:.8rem;opacity:.8">'+p.getAttribute('data-pct')+'%</span>';
      ctrVal.style.fontSize='1.1rem';
      ctrVal.style.color=p.getAttribute('data-col');
      // Dim others
      svg.querySelectorAll('path').forEach(o=>o.style.opacity=o===p?'1':'.35');
    });
    p.addEventListener('mouseleave',()=>{
      resetCenter();
      if(ctrVal)ctrVal.style.fontSize='1.6rem';
      svg.querySelectorAll('path').forEach(o=>o.style.opacity='.88');
    });
  });
  if(leg) leg.innerHTML=cats.slice(0,8).map(([cat,val],i)=>
    '<div class="legend-item"><div class="legend-dot" style="background:'+PAL[i%PAL.length]+'"></div>'+
    '<div class="legend-name">'+cname(cat)+'</div>'+
    '<div class="legend-val">'+Math.round((val/total)*100)+'%</div></div>').join('');
}

function renderPlanBar(t){
  const inc=curIncome(), lim=curLimits();
  const totalIncPlan=Object.values(inc).reduce((s,v)=>s+v,0);
  const totalExpPlan=Object.values(lim).reduce((s,v)=>s+v,0);
  const actualInc=t.filter(x=>x.type==='income').reduce((s,x)=>s+x.amount,0);
  const actualExp=t.filter(x=>x.type==='expense').reduce((s,x)=>s+x.amount,0);
  const actualInv=t.filter(x=>x.type==='investment').reduce((s,x)=>s+x.amount,0);
  const planSavings=totalIncPlan-totalExpPlan;
  const actualNet=actualInc-actualExp-actualInv;
  // Burn rate: is spending pace ahead of the month progress?
  const today=new Date();
  const isCurMon=(cY===today.getFullYear()&&cM===today.getMonth());
  const monthPct=isCurMon?today.getDate()/new Date(cY,cM+1,0).getDate():1;

  // ── Column 1: Plánovaný příjem ──
  const incPct=totalIncPlan>0?Math.min(120,Math.round(actualInc/totalIncPlan*100)):0;
  document.getElementById('pbIncVal').textContent=totalIncPlan>0?fmt(totalIncPlan):'Nenastaveno';
  document.getElementById('pbIncVal').style.color=totalIncPlan>0?'var(--sage)':'var(--muted)';
  document.getElementById('pbIncSub').textContent=totalIncPlan>0?'Skutečně: '+fmt(actualInc)+' · '+incPct+' % plánu':'Nastav příjmový plán výše';
  const incFill=document.getElementById('pbIncFill');
  incFill.style.width=Math.min(100,incPct)+'%';
  incFill.style.background=incPct>=100?'var(--sage)':incPct>=70?'var(--gold)':'var(--sage)';
  const incNote=document.getElementById('pbIncNote');
  if(totalIncPlan>0){
    if(incPct>=100){incNote.textContent='✓ Příjmový plán splněn';incNote.style.color='var(--sage)';}
    else{incNote.textContent=fmt(totalIncPlan-actualInc)+' zbývá do plánu';incNote.style.color='var(--muted)';}
  } else { incNote.textContent=''; }

  // ── Column 2: Plánované výdaje ──
  const expPct=totalExpPlan>0?Math.min(120,Math.round(actualExp/totalExpPlan*100)):0;
  const burnRate=isCurMon&&totalExpPlan>0&&monthPct>0.03?actualExp/totalExpPlan/monthPct:0;
  document.getElementById('pbExpVal').textContent=totalExpPlan>0?fmt(totalExpPlan):'Nenastaveno';
  document.getElementById('pbExpVal').style.color=totalExpPlan>0?'var(--rose)':'var(--muted)';
  document.getElementById('pbExpSub').textContent=totalExpPlan>0?'Skutečně: '+fmt(actualExp)+' · '+expPct+' % limitů':'Nastav limity výdajů výše';
  const expFill=document.getElementById('pbExpFill');
  expFill.style.width=Math.min(100,expPct)+'%';
  expFill.style.background=expPct>100?'var(--rose)':expPct>80?'var(--gold)':'var(--sage)';
  const expNote=document.getElementById('pbExpNote');
  if(totalExpPlan>0){
    if(expPct>100){expNote.textContent='⚠️ Překročeny limity výdajů';expNote.style.color='var(--rose)';}
    else if(burnRate>1.4&&isCurMon){expNote.textContent='⚡ Výdaje jdou rychleji než měsíc';expNote.style.color='var(--gold)';}
    else if(expPct>=80){expNote.textContent='⚠️ Blízko maxima limitů';expNote.style.color='var(--gold)';}
    else{expNote.textContent=fmt(totalExpPlan-actualExp)+' zbývá z limitů';expNote.style.color='var(--muted)';}
  } else { expNote.textContent=''; }

  // ── Column 3: Zbývá k rozdělení ──
  // = plánovaný příjem − součet výdajových limitů (co ještě nemá v plánu přiřazenou kategorii)
  const allocPct=totalIncPlan>0?Math.min(120,Math.round(totalExpPlan/totalIncPlan*100)):0;
  const savVal=document.getElementById('pbSavVal');
  const savFill=document.getElementById('pbSavFill');
  const savNote=document.getElementById('pbSavNote');
  if(!totalIncPlan){
    savVal.textContent='—'; savVal.style.color='var(--muted)';
    document.getElementById('pbSavSub').textContent='Nastav příjmový plán výše';
    savFill.style.cssText='width:0%';
    savNote.textContent='';
  } else if(planSavings<0){
    // Výdajové limity přesahují příjmový plán
    savVal.textContent='−'+fmt(Math.abs(planSavings)); savVal.style.color='var(--rose)';
    document.getElementById('pbSavSub').textContent='Limity výdajů o '+fmt(Math.abs(planSavings))+' nad příjmem';
    savFill.style.cssText='width:100%;background:var(--rose)';
    savNote.textContent='⚠️ Zkraťte limity nebo navyšte příjmový plán'; savNote.style.color='var(--rose)';
  } else if(planSavings===0){
    savVal.textContent=fmt(0); savVal.style.color='var(--muted)';
    document.getElementById('pbSavSub').textContent='Vše alokováno do výdajových kategorií';
    savFill.style.cssText='width:100%;background:var(--sage)';
    savNote.textContent='✓ Plán plně rozdělený — bez rezervy'; savNote.style.color='var(--muted)';
  } else {
    savVal.textContent=fmt(planSavings); savVal.style.color='var(--mauve)';
    document.getElementById('pbSavSub').textContent='Alokováno: '+allocPct+' % příjmového plánu';
    savFill.style.cssText='width:'+allocPct+'%;background:var(--sage)';
    const suggestion=planSavings>totalIncPlan*0.3?'💡 Přidej investice nebo cíle do výdajového plánu':planSavings>totalIncPlan*0.1?'💡 Zvaž přidat investice nebo spoření':'✓ Dobře rozdělený plán';
    const suggCol=planSavings>totalIncPlan*0.1?'var(--muted)':'var(--sage)';
    savNote.textContent=suggestion; savNote.style.color=suggCol;
  }

  const pi=document.getElementById('pbInherited');
  if(pi) pi.style.display=(!S.plans[ck()]&&(totalIncPlan||totalExpPlan))?'flex':'none';
}

function applyRulePreset(n,w,s){
  S.ruleRatio={n,w,s}; save();
  if(activeTab==='budget') render();
}
function saveCustomRule(){
  const n=parseInt(document.getElementById('ruleN').value)||0;
  const w=parseInt(document.getElementById('ruleW').value)||0;
  const s=parseInt(document.getElementById('ruleS').value)||0;
  if(n+w+s!==100){toast('Součet musí být přesně 100 %','warn');return;}
  if(n<0||w<0||s<0){toast('Hodnoty musí být kladné','warn');return;}
  S.ruleRatio={n,w,s}; save(); render(); toast('Vlastní poměr uložen ✓','success');
}
function toggleCustomRule(){
  const row=document.getElementById('customRuleRow');
  if(row) row.style.display=row.style.display==='none'?'flex':'none';
}

function renderBudget(t){
  const expTxs=t.filter(x=>x.type==='expense');
  const expA={},incA={};
  expTxs.forEach(x=>{expA[x.cat]=(expA[x.cat]||0)+x.amount;});
  t.filter(x=>x.type==='income').forEach(x=>{incA[x.cat]=(incA[x.cat]||0)+x.amount;});
  const invA=t.filter(x=>x.type==='investment').reduce((s,x)=>s+x.amount,0);
  const lim=curLimits(), inc=curIncome();
  const allInc=[...new Set([...Object.keys(inc),...Object.keys(incA)])];
  const allExp=[...new Set([...Object.keys(lim),...Object.keys(expA)])];
  const le=document.getElementById('budgetList');

  renderPlanBar(t);

  if(!allInc.length&&!allExp.length){
    le.innerHTML='<div class="empty"><strong>🗓</strong>Nastav plán tlačítkem výše.</div>';
    render5030(inc,lim,incA,expTxs,invA); return;
  }

  /* ── category progress list ── */
  function pr(cat,actual,plan,isInc){
    const act=actual||0,lmt=plan||0,pct=lmt>0?Math.min(120,Math.round((act/lmt)*100)):0;
    const bc=isInc?'var(--sage)':(pct>100?'var(--rose)':pct>80?'var(--gold)':'var(--sage)');
    const rem=lmt-act;let rc='ok',rt='';
    if(lmt>0){if(isInc){if(act>=lmt){rc='ok';rt='✓ Plán splněn';}else if(pct>=80){rc='warn';rt='Zbývá '+fmt(Math.abs(rem))+' do plánu';}else{rc='ok';rt=pct+'% splněno';}}else{if(rem<0){rc='over';rt='Přečerpáno o '+fmt(Math.abs(rem));}else if(pct>=80){rc='warn';rt='Zbývá jen '+fmt(rem);}else{rc='ok';rt='Zbývá '+fmt(rem);}}}
    return '<div class="budget-row"><div class="budget-top"><span class="bcat-icon">'+esc(icon(cat))+'</span><span class="bcat-name">'+esc(cname(cat))+'</span><span class="bcat-actual '+(isInc?'pos':'neg')+'">'+fmt(act)+'</span>'+(lmt?'<span style="font-size:.7rem;color:var(--muted)">/ '+fmt(lmt)+'</span>':'')+
    '</div>'+(lmt?'<div class="bprog-wrap"><div class="bprog-bar"><div class="bprog-fill" style="width:'+Math.min(100,pct)+'%;background:'+bc+'"></div></div><span class="bprog-pct">'+pct+'%</span></div><div class="b-remain '+rc+'">'+rt+'</div>':'<div style="font-size:.67rem;color:var(--muted);margin-top:2px">Bez plánu</div>')+'</div>';
  }
  let h='';
  if(allInc.length) h+='<div class="psec sage">🌿 Příjmy</div>'+allInc.map(c=>pr(c,incA[c],inc[c],true)).join('');
  if(allExp.length) h+='<div class="psec rose" style="margin-top:13px">🌸 Výdaje</div>'+allExp.map(c=>pr(c,expA[c],lim[c],false)).join('');
  le.innerHTML=h;

  render5030(inc,lim,incA,expTxs,invA);
}

function render5030(inc,lim,incA,expTxs,invA){
  const el=document.getElementById('panel5030');
  if(!el) return;
  const totalIncPlan=Object.values(inc).reduce((s,v)=>s+v,0);
  const totalIncAct=Object.values(incA).reduce((s,v)=>s+v,0);
  const base=totalIncAct||totalIncPlan;
  const rr=S.ruleRatio||{n:50,w:30,s:20};
  const pN=rr.n,pW=rr.w,pS=rr.s;

  if(!base){
    el.innerHTML='<div class="ptitle">Pravidlo '+pN+'/'+pW+'/'+pS+'</div><div class="empty" style="margin:0">Nastav příjem v plánu nebo přidej příjmovou transakci.</div>';
    return;
  }
  const tN=Math.round(base*pN/100),tW=Math.round(base*pW/100),tS=Math.round(base*pS/100);
  let needsExp=0,wantsExp=0;
  (expTxs||[]).forEach(tx=>{ if(tx.kind==='want') wantsExp+=tx.amount; else needsExp+=tx.amount; });
  const inv=invA||0;

  // Which preset is active?
  const presets=[[50,30,20],[60,20,20],[70,20,10]];
  const isCustom=!presets.some(([n,w,s])=>n===pN&&w===pW&&s===pS);
  function pBtn(n,w,s){ const a=(n===pN&&w===pW&&s===pS&&!isCustom)?'active':''; return '<button class="rule-preset '+a+'" onclick="applyRulePreset('+n+','+w+','+s+')">'+n+'/'+w+'/'+s+'</button>'; }

  function bucket(pct,emoji,name,desc,col,target,actual){
    const p=target>0?Math.min(100,Math.round(actual/target*100)):0;
    const over=actual>target&&actual>0;
    return '<div class="rule-bucket">'+
      '<div class="rb-left">'+
        '<div class="rb-pct" style="color:'+col+'">'+pct+'%</div>'+
        '<div><div class="rb-name">'+emoji+' '+name+'</div><div class="rb-desc">'+desc+'</div></div>'+
      '</div>'+
      '<div class="rb-right">'+
        '<div class="rb-amounts">'+
          '<span class="rb-target" style="color:'+col+'">max '+fmt(target)+'</span>'+
          '<span class="rb-actual">skut. <strong>'+(actual>0?fmt(actual):'—')+'</strong></span>'+
        '</div>'+
        '<div class="rb-bw"><div class="rb-bf" style="width:'+p+'%;background:'+(over?'var(--rose)':col)+'"></div></div>'+
        '<div class="rb-used">'+(actual>0?(over?'⚠️ Přečerpáno o <strong>'+fmt(actual-target)+'</strong>':p+'% využito'):'Zatím žádné výdaje')+'</div>'+
      '</div>'+
    '</div>';
  }

  // Daily budget limit (current month only)
  const today=new Date();
  const isCurMon=(cY===today.getFullYear()&&cM===today.getMonth());
  let dailyHtml='';
  if(isCurMon){
    const totalExpPlanHere=Object.values(lim).reduce((s,v)=>s+v,0);
    const actualExpHere=(expTxs||[]).reduce((s,x)=>s+x.amount,0);
    const daysInMonth=new Date(cY,cM+1,0).getDate();
    const dayNum=today.getDate();
    const daysLeft=daysInMonth-dayNum; // days after today
    const remaining=totalExpPlanHere-actualExpHere;
    const daysPct=Math.round(dayNum/daysInMonth*100);
    if(totalExpPlanHere>0){
      const dailyLim=daysLeft>0?Math.round(remaining/daysLeft):0;
      const limCol=dailyLim>0?'var(--sage)':'var(--rose)';
      const barCol=daysPct>80?'var(--rose)':daysPct>50?'var(--gold)':'var(--mauve)';
      dailyHtml='<div style="margin-top:16px;padding-top:14px;border-top:1px solid var(--border)">'+
        '<div style="font-size:.68rem;font-weight:600;color:var(--text2);margin-bottom:9px">📅 Denní limit výdajů</div>'+
        '<div style="display:flex;align-items:baseline;justify-content:space-between;margin-bottom:7px">'+
          '<span style="font-family:\'Cormorant Garamond\',serif;font-size:1.5rem;font-weight:600;color:'+limCol+'">'+
            (dailyLim>0?fmt(dailyLim):'Přečerpáno')+'</span>'+
          '<span style="font-size:.66rem;color:var(--muted)">zbývá '+daysLeft+' dní</span>'+
        '</div>'+
        '<div style="height:5px;background:var(--border);border-radius:5px;overflow:hidden;margin-bottom:5px">'+
          '<div style="width:'+daysPct+'%;height:100%;background:'+barCol+';border-radius:5px;transition:width .8s"></div>'+
        '</div>'+
        '<div style="font-size:.63rem;color:var(--muted)">'+daysPct+' % měsíce uplynulo · '+
          (remaining>0?fmt(remaining)+' zbývá v limitech':'⚠️ Limity překročeny o '+fmt(Math.abs(remaining)))+
        '</div>'+
      '</div>';
    }
  }

  el.innerHTML=
    '<div class="ptitle">Pravidlo '+pN+'/'+pW+'/'+pS+
      ' <span style="font-size:.68rem;font-family:Jost,sans-serif;font-weight:400;color:var(--muted)">— rozdělení příjmu</span></div>'+
    '<div class="rule-presets">'+
      '<span style="font-size:.62rem;color:var(--muted);flex-shrink:0">Poměr:</span>'+
      pBtn(50,30,20)+pBtn(60,20,20)+pBtn(70,20,10)+
      '<button class="rule-preset'+(isCustom?' active':'')+'" onclick="toggleCustomRule()">✏️ Vlastní</button>'+
    '</div>'+
    '<div class="rule-custom-row" id="customRuleRow" style="display:'+(isCustom?'flex':'none')+'">'+
      '<label>Potřeby</label><input class="rule-num-inp" id="ruleN" type="number" min="0" max="100" value="'+pN+'"><label>%</label>'+
      '<label style="margin-left:6px">Přání</label><input class="rule-num-inp" id="ruleW" type="number" min="0" max="100" value="'+pW+'"><label>%</label>'+
      '<label style="margin-left:6px">Spoření</label><input class="rule-num-inp" id="ruleS" type="number" min="0" max="100" value="'+pS+'"><label>%</label>'+
      '<button class="cat-save-btn" onclick="saveCustomRule()" style="margin-left:4px">✓ Uložit</button>'+
    '</div>'+
    '<p style="font-size:.7rem;color:var(--muted);line-height:1.55;margin-bottom:10px">Základ: <strong>'+fmt(base)+'</strong>'+(totalIncAct?' (skutečný příjem)':' (plánovaný příjem)')+
      ' · Při přidání výdaje zvol <strong>🏠 Nezbytný</strong> nebo <strong>🎉 Radost</strong></p>'+
    '<div class="rule-buckets">'+
      bucket(pN,'🏠','Potřeby','Bydlení, jídlo, energie, zdraví…','var(--sage)',tN,needsExp)+
      bucket(pW,'🎉','Přání','Zábava, koníčky, oblečení, krása…','var(--mauve)',tW,wantsExp)+
      bucket(pS,'💎','Spoření','Investice, rezervy, finanční cíle…','var(--gold)',tS,inv)+
    '</div>'+
    dailyHtml;
}




function renderSavingsBar(){
  const all=S.goals||[];
  const totalSaved=all.reduce((s,g)=>s+(g.saved||0),0);
  const totalTarget=all.reduce((s,g)=>s+(g.target||0),0);
  const pct=totalTarget?Math.min(100,Math.round(totalSaved/totalTarget*100)):0;
  const withTarget=all.filter(g=>g.target>0);
  const avgPct=withTarget.length?Math.round(withTarget.reduce((s,g)=>s+Math.min(100,g.saved/g.target*100),0)/withTarget.length):0;
  const done=all.filter(g=>g.target>0&&g.saved>=g.target).length;
  const active=all.filter(g=>g.target>0&&g.saved<g.target).length;
  const now2=new Date();
  const daysInMonth=new Date(now2.getFullYear(),now2.getMonth()+1,0).getDate();
  const monthsLeft=Math.max(0.5,(11-now2.getMonth())+(1-now2.getDate()/daysInMonth));
  const totalRemaining=all.reduce((s,g)=>s+Math.max(0,(g.target||0)-(g.saved||0)),0);
  const monthlyNeeded=totalRemaining>0?Math.round(totalRemaining/monthsLeft):0;
  document.getElementById('svTotal').textContent=fmt(totalSaved);
  document.getElementById('svTotalSub').textContent=totalTarget?'z '+fmt(totalTarget)+' celkem':'nastav cíle';
  document.getElementById('svFill').style.width=pct+'%';
  document.getElementById('svAvg').textContent=withTarget.length?avgPct+'%':'—';
  document.getElementById('svAvgSub').textContent=withTarget.length?'průměr přes '+withTarget.length+' cílů':'';
  document.getElementById('svCount').textContent=active+' / '+done;
  document.getElementById('svCountSub').textContent=(active?active+' aktivní':'')+(done?' · '+done+' splněno 🎉':'');
  document.getElementById('svMonthly').textContent=totalRemaining>0?fmt(monthlyNeeded):'🎉 Splněno!';
  document.getElementById('svMonthlySub').textContent='do konce roku ('+Math.round(monthsLeft*10)/10+' měs.)';
}

function renderDefaultFunds(){
  const el=document.getElementById('defaultFunds');
  if(!el)return;
  const peace=S.goals.find(g=>g.fundType==='peace');
  const reserve=S.goals.find(g=>g.fundType==='reserve');
  const t=txs();
  const income=t.filter(x=>x.type==='income').reduce((s,x)=>s+x.amount,0);
  const planInc=Object.values(curIncome()).reduce((s,v)=>s+v,0);
  // Průměr přes všechny měsíce s daty — stabilnější než aktuální měsíc
  const allKeys=Object.keys(S.data||{});
  const incVals=[];
  allKeys.forEach(k=>{
    const rows=S.data[k]||[];
    const inc=rows.filter(x=>x.type==='income').reduce((s,x)=>s+x.amount,0);
    if(inc>0)incVals.push(inc);
  });
  const avgIncome=incVals.length?Math.round(incVals.reduce((s,v)=>s+v,0)/incVals.length):0;
  const refIncome=avgIncome||planInc||income;
  const incLabel=incVals.length>1?'průměr '+incVals.length+' měs.':'1 měs. dat';
  function fCard(g,col,desc,hint){
    if(!g)return '';
    const pct=g.target?Math.min(100,Math.round((g.saved||0)/g.target*100)):0;
    const done=g.target&&(g.saved||0)>=g.target;
    const noTarget=!g.target;
    return '<div class="fund-card">'+
      '<div class="fund-deco" style="background:'+col+'"></div>'+
      '<div class="fund-title">'+esc(g.emoji)+' '+esc(g.name)+
        (done?'<span style="font-size:.63rem;background:var(--sage-light);color:var(--sage);padding:2px 8px;border-radius:20px;font-family:Jost,sans-serif;font-weight:600">✓ Splněno</span>':'')+
      '</div>'+
      '<div class="fund-desc">'+desc+'</div>'+
      (hint?'<div class="fund-hint" style="color:'+col+'">💡 '+hint+'</div>':'')+
      (noTarget?'<div style="font-size:.76rem;color:var(--muted);margin-bottom:12px;font-style:italic">Cíl není nastaven — klikni Upravit</div>':
        '<div class="fund-nums"><span class="fund-saved" style="color:'+col+'">'+(fmt(g.saved||0))+'</span><span class="fund-tgt">cíl: '+fmt(g.target)+'</span></div>'+
        '<div class="fund-bar"><div class="fund-fill" style="width:'+pct+'%;background:'+col+'"></div></div>')+
      '<div style="display:flex;gap:6px">'+
        '<button class="gbtn" onclick="openAddGoalModal('+g.id+')">💸 Přidat</button>'+
        '<button class="gbtn" onclick="openEditGoalModal('+g.id+')">✏️ Upravit cíl</button>'+
      '</div>'+
      '<div class="fund-lock">🔒 Záchranný fond · nelze smazat</div>'+
    '</div>';
  }
  const peaceHint=refIncome
    ?'Doporučeno: '+fmt(refIncome)+(incVals.length?' ('+incLabel+')':'')+' = 1× měsíční příjem'
    :'Nastav = 1× tvůj měsíční příjem';
  const reserveHint=refIncome
    ?'Doporučeno: '+fmt(refIncome*3)+' – '+fmt(refIncome*6)+(incVals.length?' ('+incLabel+')':'')+' = 3–6× měsíční příjem'
    :'Nastav = 3–6× tvůj měsíční příjem';
  el.innerHTML=
    fCard(peace,'var(--sage)','Okamžitá záloha — rozbité spotřebiče, neplánované výdaje. Tento fond je k čerpání.',peaceHint)+
    fCard(reserve,'var(--mauve)','Pevná rezerva — přežití 3–6 měsíců bez příjmu. Nesahat, pokud to není opravdu nutné.',reserveHint);
}

function tip(col,icon,title,body){
  const bg=col==='info'?'var(--rose-light)':col==='good'?'var(--sage-light)':col==='warn'?'#fffbeb':'var(--mauve-light)';
  const bd=col==='info'?'var(--rose-mid)':col==='good'?'#b8d4bb':col==='warn'?'#f0d89a':'#d4a0b8';
  const tc=col==='info'?'#7a3838':col==='good'?'#3a6a3e':col==='warn'?'#7a5e18':'#6a3050';
  return '<div style="background:'+bg+';border:1px solid '+bd+';border-radius:12px;padding:11px 13px;margin-bottom:8px">'+
    '<div style="font-size:.62rem;font-weight:600;color:'+tc+';text-transform:uppercase;letter-spacing:.8px;margin-bottom:5px">'+icon+' '+title+'</div>'+
    '<div style="font-size:.78rem;color:var(--text);line-height:1.55">'+body+'</div>'+
  '</div>';
}
function renderGoalsInsights(){
  const el=document.getElementById('goalsInsights');
  if(!el)return;
  let h='<div class="ptitle">Tipy & přehled</div>';
  const peace=S.goals.find(g=>g.fundType==='peace');
  const reserve=S.goals.find(g=>g.fundType==='reserve');
  const custom=(S.goals||[]).filter(g=>!g.isDefault&&g.target>0);
  const peaceDone=peace&&peace.target>0&&(peace.saved||0)>=peace.target;
  const reserveDone=reserve&&reserve.target>0&&(reserve.saved||0)>=reserve.target;
  // Priority advice
  if(!peace||!peace.target){
    h+=tip('info','🕊️','Priorita','Nastav cíl pro <strong>Klid na duši</strong> — rovná se 1× tvůj měsíční příjem. Je to první krok.');
  } else if(!peaceDone){
    const need=peace.target-(peace.saved||0);
    h+=tip('info','🕊️','Priorita','Naplň <strong>Klid na duši</strong>.<br>Chybí <strong>'+fmt(need)+'</strong>. Pak Rezerva, pak investice.');
  } else if(!reserve||!reserve.target){
    h+=tip('good','✅','Klid na duši splněn!','Nastav teď cíl pro <strong>Rezervu</strong> — doporučeno 3–6× měsíční příjem.');
  } else if(!reserveDone){
    const need=reserve.target-(reserve.saved||0);
    h+=tip('info','🛡️','Buduj Rezervu','Klid na duši je splněn.<br>Na Rezervě chybí <strong>'+fmt(need)+'</strong>.');
  } else {
    h+=tip('good','🚀','Záchranné fondy OK!','Oba fondy jsou naplněny. Teď je ten správný čas <strong>pravidelně investovat</strong>.');
  }
  // Custom goal insights
  if(custom.length){
    const now2=new Date();
    const daysInMonth=new Date(now2.getFullYear(),now2.getMonth()+1,0).getDate();
    // Fallback: měsíce do konce roku (pro cíle bez vlastního termínu)
    const eoyMonths=Math.max(0.5,(11-now2.getMonth())+(1-now2.getDate()/daysInMonth));
    // Per-goal výpočet: každý cíl použije svůj vlastní termín, nebo EOY pokud žádný nemá
    let totalMonthly=0, anyRemaining=false;
    const goalLines=[];
    custom.forEach(g=>{
      const rem=Math.max(0,g.target-(g.saved||0));
      if(rem<=0)return;
      anyRemaining=true;
      let months=eoyMonths, termLabel='do konce roku';
      if(g.deadline){
        const dl=new Date(g.deadline);
        const diffMonths=(dl.getFullYear()-now2.getFullYear())*12+(dl.getMonth()-now2.getMonth())+(dl.getDate()>=now2.getDate()?0:-1);
        months=Math.max(0.5,diffMonths);
        termLabel='do '+dl.getDate()+'. '+MONTHS_GEN[dl.getMonth()];
      }
      const monthly=Math.round(rem/months);
      totalMonthly+=monthly;
      goalLines.push(esc(g.emoji||'🎯')+' <strong>'+esc(g.name)+'</strong> — '+fmt(monthly)+'/měs. <span style="color:var(--muted);font-size:.75em">('+termLabel+')</span>');
    });
    if(anyRemaining){
      const body=goalLines.join('<br>')+(goalLines.length>1?'<div style="margin-top:6px;padding-top:6px;border-top:1px solid var(--border)">Celkem: <strong>'+fmt(totalMonthly)+'/měs.</strong></div>':'');
      h+=tip('warn','📅','Vlastní cíle',body);
    }
    const closest=custom.filter(g=>(g.saved||0)<g.target).sort((a,b)=>((b.saved||0)/b.target)-((a.saved||0)/a.target))[0];
    if(closest){
      const pct=Math.round((closest.saved||0)/closest.target*100);
      h+=tip('warn','🎯','Nejblíže splnění',esc(closest.emoji)+' <strong>'+esc(closest.name)+'</strong><br>'+pct+' % · chybí '+fmt(closest.target-(closest.saved||0)));
    }
    const doneCust=custom.filter(g=>(g.saved||0)>=g.target);
    if(doneCust.length) h+=tip('good','🎉','Splněno!',doneCust.map(g=>esc(g.emoji)+' <strong>'+esc(g.name)+'</strong>').join('<br>')+' — '+( doneCust.length===1?'cíl splněn':'cíle splněny')+'!');
  } else {
    h+=tip('info','💡','Vlastní cíle','Přidej cíle jako dovolená nebo nové auto. Uvidíš, kolik měsíčně potřebuješ odkládat.');
  }
  el.innerHTML=h;
}

// ── GLOBAL ERROR CAPTURE ──
window.onerror=function(msg,src,line,col,err){
  console.error('[BQ] Uncaught:',msg,'@'+(src||'?')+':'+line);
  if(src&&(src.includes('BudgetQueen')||src.includes('index.html'))){
    if(typeof showAppError==='function') showAppError(err||new Error(msg));
  }
  return false;
};
window.addEventListener('unhandledrejection',e=>{
  console.error('[BQ] Unhandled promise rejection:',e.reason);
});

// Apply saved tab on first load (sets DOM visibility + active states + calls render)
switchTab(activeTab);

// Generate app icon for iOS home screen & Android PWA
(function(){
  try{
    const s=512,c=document.createElement('canvas');c.width=c.height=s;
    const x=c.getContext('2d');
    // Rounded-rect background
    const r=s*0.18;
    function rr(x2,y2,w,h,rad){
      x.beginPath();x.moveTo(x2+rad,y2);x.lineTo(x2+w-rad,y2);
      x.arcTo(x2+w,y2,x2+w,y2+rad,rad);x.lineTo(x2+w,y2+h-rad);
      x.arcTo(x2+w,y2+h,x2+w-rad,y2+h,rad);x.lineTo(x2+rad,y2+h);
      x.arcTo(x2,y2+h,x2,y2+h-rad,rad);x.lineTo(x2,y2+rad);
      x.arcTo(x2,y2,x2+rad,y2,rad);x.closePath();
    }
    // Warm cream background
    const g=x.createLinearGradient(0,0,s,s);
    g.addColorStop(0,'#fdf8f5');g.addColorStop(1,'#f0e4da');
    x.fillStyle=g;rr(0,0,s,s,r);x.fill();
    // Subtle rose glow top-right
    const gl=x.createRadialGradient(s*.78,s*.22,0,s*.78,s*.22,s*.5);
    gl.addColorStop(0,'rgba(212,128,122,0.22)');gl.addColorStop(1,'rgba(212,128,122,0)');
    x.fillStyle=gl;rr(0,0,s,s,r);x.fill();
    // Decorative dots (mini crown)
    [[s*.38,s*.2,'#d4807a'],[s*.5,s*.14,'#b5788a'],[s*.62,s*.2,'#8aaa8e']].forEach(([cx,cy,col])=>{
      x.fillStyle=col;x.beginPath();x.arc(cx,cy,s*.035,0,Math.PI*2);x.fill();
    });
    // Crown point lines
    x.strokeStyle='rgba(212,128,122,0.5)';x.lineWidth=s*.022;x.lineCap='round';
    [[s*.38,s*.2,s*.38,s*.32],[s*.5,s*.14,s*.5,s*.32],[s*.62,s*.2,s*.62,s*.32]].forEach(([x1,y1,x2,y2])=>{
      x.beginPath();x.moveTo(x1,y1);x.lineTo(x2,y2);x.stroke();
    });
    // Crown base bar
    x.fillStyle='rgba(212,128,122,0.35)';
    x.beginPath();x.rect(s*.3,s*.3,s*.4,s*.055);x.fill();
    // Italic Q
    x.fillStyle='#d4807a';
    x.font='italic 700 '+(s*.52)+'px Georgia,serif';
    x.textAlign='center';x.textBaseline='middle';
    x.fillText('Q',s*.5,s*.62);
    // Set apple-touch-icon
    const al=document.createElement('link');
    al.rel='apple-touch-icon';al.sizes='512x512';al.href=c.toDataURL('image/png');
    document.head.appendChild(al);
  }catch(e){}
})();

// ── DATE WATCHDOG — auto-advance when date rolls over midnight / month-end ──
// Catches the edge case where the app stays open overnight or across a month boundary.
// Every 60s: if the real calendar date changed AND the user was viewing "today's month",
// silently advance cY/cM and re-render. If they were browsing history, do nothing.
(function(){
  let watchY=new Date().getFullYear(), watchM=new Date().getMonth();
  setInterval(()=>{
    const t=new Date(), rY=t.getFullYear(), rM=t.getMonth();
    if(rY===watchY && rM===watchM) return;       // no change — do nothing
    const wasOnToday=(cY===watchY && cM===watchM); // were we viewing "today"?
    watchY=rY; watchM=rM;                         // update tracker regardless
    if(wasOnToday){ cY=rY; cM=rM; render(); toast('Nový den, nový začátek 📅','info'); }
  }, 60000);
})();

// ── SERVICE WORKER ──
if('serviceWorker' in navigator){
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/BudgetQueen/sw.js', {scope:'/BudgetQueen/'})
      .then(reg => {
        // Pokud je dostupná nová verze SW, aktivuj ji při příští návštěvě
        reg.addEventListener('updatefound', () => {
          const newWorker = reg.installing;
          newWorker?.addEventListener('statechange', () => {
            if(newWorker.state === 'installed' && navigator.serviceWorker.controller){
              window.toast('Nová verze aplikace je připravena — refresh pro aktualizaci 🔄','info');
            }
          });
        });
      })
      .catch(err => console.warn('[BQ] SW registration failed:', err));
  });
}
