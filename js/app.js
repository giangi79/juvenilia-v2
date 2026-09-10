import { db } from './supabase.js';
import { toast, formatDate } from './ui.js';

let payload=null;
let countdownInterval=null;
function readPublicRoute(){
  const params=new URLSearchParams(location.search);
  return {
    slug:params.get('gara')||params.get('event')||null,
    direct:params.get('diretta')==='1'||params.get('direct')==='1'
  };
}
let publicRoute=readPublicRoute();
let selectedSlug=publicRoute.slug;
let directEventMode=publicRoute.direct;
let registrationSort='name';
const CATEGORY_ORDER=['GIOVANISSIMI','ESORDIENTI','R12','RAGAZZI','ALLIEVI','JUNIOR','SENIOR'];
const categoryOrderValue=cat=>{const i=CATEGORY_ORDER.indexOf(String(cat||'').toUpperCase());return i<0?999:i};
function sanitizePublicHtml(html){
  const tpl=document.createElement('template');tpl.innerHTML=String(html||'');
  const allowed=new Set(['B','STRONG','I','EM','U','BR','P','DIV','UL','OL','LI','A','SPAN']);
  const walk=node=>{
    [...node.childNodes].forEach(child=>{
      if(child.nodeType===Node.ELEMENT_NODE){
        if(!allowed.has(child.tagName)){child.replaceWith(...child.childNodes);return}
        [...child.attributes].forEach(attr=>{
          const n=attr.name.toLowerCase();
          if(n==='href'&&child.tagName==='A'){
            try{const u=new URL(attr.value,location.href);if(!['http:','https:','mailto:'].includes(u.protocol))child.removeAttribute(attr.name)}
            catch{child.removeAttribute(attr.name)}
          }else if(n==='style'){
            const keep=[];
            attr.value.split(';').forEach(part=>{const [prop,val]=part.split(':').map(x=>x?.trim());if(['color','background-color'].includes((prop||'').toLowerCase())&&/^#[0-9a-f]{3,8}$/i.test(val||''))keep.push(`${prop}:${val}`)});
            if(keep.length)child.setAttribute('style',keep.join(';'));else child.removeAttribute('style');
          }else if(!(child.tagName==='A'&&['href','target','rel'].includes(n)))child.removeAttribute(attr.name);
        });
        if(child.tagName==='A'){child.setAttribute('target','_blank');child.setAttribute('rel','noopener noreferrer')}
        walk(child);
      }else if(child.nodeType!==Node.TEXT_NODE)child.remove();
    });
  };
  walk(tpl.content);return tpl.innerHTML;
}


async function init(){
  initVisualControls();
  if(selectedSlug){
    await loadEvent(selectedSlug);
  }else{
    await loadEvents();
  }
}

async function loadEvents(){
  const {data,error}=await db.rpc('v2_list_public_events');
  if(error){showFatal(error.message);return}
  renderEventList(data||[]);
}

function renderEventList(events){
  const list=document.getElementById('eventsList');
  const view=document.getElementById('eventView');
  list.replaceChildren();
  view.classList.add('hidden');
  list.classList.remove('hidden');

  document.getElementById('eventTitle').textContent='Gare Juvenilia';
  document.getElementById('eventDescription').textContent='Seleziona una gara per visualizzare le iscrizioni.';
  stopHeroCountdown();

  if(!events.length){
    const box=document.createElement('section');
    box.className='card';
    box.textContent='Al momento non ci sono gare pubblicate.';
    list.append(box);
    return;
  }

  events.forEach(e=>{
    const card=document.createElement('article');
    card.className='event-card';

    const h=document.createElement('h2');
    h.textContent=e.title;
    card.append(h);

    if(e.description){
      const p=document.createElement('p');
      p.textContent=e.description;
      card.append(p);
    }

    const meta=document.createElement('div');
    meta.className='event-meta';
    meta.textContent=e.registration_deadline
      ? `Scadenza iscrizioni: ${formatDate(e.registration_deadline)}`
      : 'Nessuna scadenza generale';
    card.append(meta);

    const b=document.createElement('button');
    b.textContent='Apri gara';
    b.onclick=()=>{
      history.pushState({},'',`?gara=${encodeURIComponent(e.slug)}`);
      selectedSlug=e.slug;
      loadEvent(e.slug);
    };
    card.append(b);
    list.append(card);
  });
}

async function loadEvent(slug){
  const {data,error}=await db.rpc('v2_get_public_event',{p_slug:slug});
  if(error){showFatal(error.message);return}
  if(!data){
    showFatal('Gara non disponibile.');
    return;
  }
  payload=data;
  renderEvent();
}

function showFatal(msg){
  const e=document.getElementById('message');
  e.textContent=msg;
  e.classList.remove('hidden');
}

function renderEvent(){
  const e=payload.event,cfg=payload.config||{},regs=payload.registrations||[];
  document.getElementById('message').classList.add('hidden');
  document.getElementById('eventsList').classList.add('hidden');
  document.getElementById('eventView').classList.remove('hidden');

  document.title=`${e.title} - Juvenilia`;
  document.getElementById('eventTitle').textContent=e.title;
  document.getElementById('eventDescription').textContent=e.description||cfg.subtitle||'';

  let back=document.getElementById('backEventsBtn');
  if(directEventMode){
    back?.remove();
  }else if(!back){
    back=document.createElement('button');
    back.id='backEventsBtn';
    back.className='back-events';
    back.textContent='← Tutte le gare';
    back.onclick=()=>{
      history.pushState({},'',location.pathname);
      selectedSlug=null;
      directEventMode=false;
      payload=null;
      loadEvents();
    };
    document.getElementById('eventView').prepend(back);
  }

  const info=document.getElementById('infoBox');
  if(cfg.info_box&&cfg.show_info_box!==false){info.innerHTML=sanitizePublicHtml(cfg.info_box);info.classList.remove('hidden')}else{info.replaceChildren();info.classList.add('hidden')};

  renderEventOverview(e,cfg,regs);
  startHeroCountdown(e.registration_deadline);
  renderRaceDays(cfg);
  renderCategoryDeadlines(payload.timers||[]);
  renderFilters(regs);
  renderStats(regs);
  renderRegistrations(regs,cfg);
  renderConfirmed(regs,cfg);
  renderPayment(cfg.payment_info);
  renderDocs(cfg);
}


function renderEventOverview(e,cfg,regs){
  const meta=document.getElementById('eventQuickMeta');
  const progress=document.getElementById('eventProgress');
  if(!meta||!progress)return;
  meta.replaceChildren();
  progress.replaceChildren();

  const days=(cfg.event_days||[]).filter(Boolean);
  const yes=regs.filter(r=>r.status==='yes').length;
  const no=regs.filter(r=>r.status==='no').length;
  const pending=regs.filter(r=>r.status==='pending').length;
  const total=regs.length;
  const answered=yes+no;
  const pct=total?Math.round((answered/total)*100):0;

  const chips=[];
  if(e.registration_deadline){
    chips.push(['⏱',`Scadenza iscrizioni: ${formatDate(e.registration_deadline)}`]);
  }
  chips.push(['👥',`${total} atleti`]);

  chips.forEach(([icon,text])=>{
    const d=document.createElement('div');
    d.className='quick-meta-chip';
    const i=document.createElement('span'); i.className='quick-meta-icon'; i.textContent=icon;
    const v=document.createElement('span'); v.textContent=text;
    d.append(i,v); meta.append(d);
  });

  const top=document.createElement('div'); top.className='progress-topline';
  const label=document.createElement('strong'); label.textContent='Risposte ricevute';
  const value=document.createElement('span'); value.textContent=`${answered}/${total} • ${pct}%`;
  top.append(label,value);

  const track=document.createElement('div'); track.className='progress-track';
  const fill=document.createElement('div'); fill.className='progress-fill'; fill.style.width=`${pct}%`;
  track.append(fill);

  const legend=document.createElement('div'); legend.className='progress-legend';
  [['Partecipa',yes,'yes-dot'],['Non partecipa',no,'no-dot'],['Da definire',pending,'pending-dot']].forEach(([lab,n,cls])=>{
    const item=document.createElement('span');
    const dot=document.createElement('i'); dot.className=cls;
    const txt=document.createTextNode(`${lab}: ${n}`);
    item.append(dot,txt); legend.append(item);
  });

  progress.append(top,track,legend);
}

function renderCategoryDeadlines(timers){
  const box=document.getElementById('categoryDeadlinesBox');
  if(!box)return;
  box.replaceChildren();

  const valid=(timers||[]).filter(t=>t.deadline);
  if(!valid.length){box.classList.add('hidden');return}

  box.classList.remove('hidden');
  const h=document.createElement('h2');
  h.textContent='Scadenze per categoria';
  box.append(h);

  valid
    .slice()
    .sort((a,b)=>new Date(a.deadline)-new Date(b.deadline))
    .forEach(t=>{
      const row=document.createElement('div');
      row.className='public-deadline-row';

      const info=document.createElement('div');
      const cats=(t.categories||[]).length?[...t.categories].sort((a,b)=>categoryOrderValue(a)-categoryOrderValue(b)||a.localeCompare(b,'it')).join(', '):'Tutte le categorie';
      const expired=new Date(t.deadline)<new Date();

      const strong=document.createElement('strong');
      strong.textContent=t.label||'Scadenza';
      const meta=document.createElement('div');
      meta.className='muted';
      meta.textContent=cats;
      const date=document.createElement('div');
      date.className=expired?'deadline expired':'deadline';
      date.textContent=(expired?'Scaduta il ':'Entro il ')+formatDate(t.deadline);

      info.append(strong,meta,date);
      row.append(info);
      box.append(row);
    });
}

function renderRaceDays(cfg){
  const days=(cfg.event_days||[]).filter(Boolean),box=document.getElementById('raceDaysBox');
  box.replaceChildren();
  if(!days.length){box.classList.add('hidden');return}
  box.classList.remove('hidden');
  const strong=document.createElement('strong');strong.textContent='Giornate gara: ';box.append(strong);
  const wrap=document.createElement('div');wrap.className='race-days';
  days.forEach((d,i)=>{const s=document.createElement('span');s.className='pill';s.textContent=`${String.fromCharCode(65+i)} — ${d}`;wrap.append(s)});
  box.append(wrap);
}

function renderFilters(regs){
  const sel=document.getElementById('categoryFilter'),old=sel.value;
  const cats=[...new Set(regs.map(r=>r.category).filter(Boolean))].sort((a,b)=>categoryOrderValue(a)-categoryOrderValue(b)||a.localeCompare(b,'it'));
  sel.innerHTML='<option value="">Tutte le categorie</option>';
  cats.forEach(c=>{const o=document.createElement('option');o.value=c;o.textContent=c;sel.append(o)});
  sel.value=cats.includes(old)?old:'';
}

function renderStats(regs){
  const yes=regs.filter(r=>r.status==='yes').length;
  const no=regs.filter(r=>r.status==='no').length;
  const p=regs.filter(r=>r.status==='pending').length;
  const box=document.getElementById('stats');
  box.replaceChildren();

  [
    ['✓','Partecipa',yes,'stat-yes'],
    ['×','Non partecipa',no,'stat-no'],
    ['…','Da definire',p,'stat-pending']
  ].forEach(([icon,label,value,cls])=>{
    const card=document.createElement('div');
    card.className=`stat ${cls}`;
    const badge=document.createElement('span');badge.className='stat-icon';badge.textContent=icon;
    const copy=document.createElement('div');
    const strong=document.createElement('strong');strong.textContent=value;
    const text=document.createElement('span');text.textContent=label;
    copy.append(strong,text);card.append(badge,copy);box.append(card);
  });
}

function visible(r){
  const q=document.getElementById('search').value.trim().toLowerCase(),c=document.getElementById('categoryFilter').value;
  return (!q||`${r.full_name} ${r.category}`.toLowerCase().includes(q))&&(!c||r.category===c);
}

function quotaFor(r,cfg){
  const costs=cfg.category_costs||{};
  const n=Number(costs[r.category]??0);
  return Number.isFinite(n)?n:0;
}

function renderRegistrations(regs,cfg){
  const box=document.getElementById('registrations');
  box.replaceChildren();

  const ordered=regs.filter(visible).slice().sort((a,b)=>{
    const nameCmp=String(a.full_name||'').localeCompare(String(b.full_name||''),'it',{sensitivity:'base'});
    if(registrationSort==='category'){
      const catCmp=categoryOrderValue(a.category)-categoryOrderValue(b.category);
      if(catCmp!==0)return catCmp;
      const catTextCmp=String(a.category||'').localeCompare(String(b.category||''),'it',{sensitivity:'base'});
      return catTextCmp||nameCmp;
    }
    return nameCmp;
  });

  ordered.forEach(r=>{
    const row=document.createElement('article');
    row.className=`athlete athlete-${r.status} ${categoryClass(r.category)}`;
    const expired=r.effective_deadline && new Date(r.effective_deadline)<new Date();

    // Colonna atleta
    const athleteCell=document.createElement('div');
    athleteCell.className='athlete-cell athlete-name-cell';

    const nameLine=document.createElement('div');
    nameLine.className='athlete-name-line';

    const name=document.createElement('h3');
    name.textContent=r.full_name;

    const gender=document.createElement('span');
    gender.className=`gender-badge gender-${String(r.gender||'').toLowerCase()}`;
    gender.textContent=r.gender||'–';
    gender.title=r.gender==='F'?'Femminile':r.gender==='M'?'Maschile':'Sesso non indicato';

    nameLine.append(name,gender);
    athleteCell.append(nameLine);

    const sub=document.createElement('div');
    sub.className='athlete-subline';

    const state=document.createElement('span');
    state.className=`athlete-state state-${r.status}`;
    state.textContent=r.status==='yes'?'CONFERMATO':r.status==='no'?'NON PARTECIPA':'DA DEFINIRE';
    sub.append(state);

    if(r.race_day){
      const day=document.createElement('span');
      day.className='race-day-mini';
      day.textContent=r.race_day;
      sub.append(day);
    }
    athleteCell.append(sub);

    // Colonna categoria
    const categoryCell=document.createElement('div');
    categoryCell.className='athlete-cell athlete-category-cell-public';
    const catBadge=document.createElement('span');
    catBadge.className=`category-badge ${categoryClass(r.category)}`;
    catBadge.textContent=r.category||'Categoria';
    categoryCell.append(catBadge);

    const q=quotaFor(r,cfg);
    if(cfg.show_category_costs!==false && q>0){
      const qb=document.createElement('span');
      qb.className='quote-badge';
      qb.textContent=`${q.toFixed(2)} €`;
      categoryCell.append(qb);
    }

    // Pulsanti partecipazione
    const yesCell=document.createElement('div');
    yesCell.className='athlete-cell choice-cell';
    const yes=document.createElement('button');
    yes.className=`registration-choice yes${r.status==='yes'?' active':''}`;
    {const i=document.createElement('i');i.className='fas fa-check';const sp=document.createElement('span');sp.textContent='PARTECIPA';yes.append(i,sp);}
    yes.disabled=expired;
    yes.onclick=()=>setStatus(r,'yes');
    yesCell.append(yes);

    const noCell=document.createElement('div');
    noCell.className='athlete-cell choice-cell';
    const no=document.createElement('button');
    no.className=`registration-choice no${r.status==='no'?' active':''}`;
    {const i=document.createElement('i');i.className='fas fa-xmark';const sp=document.createElement('span');sp.textContent='NON PARTECIPA';no.append(i,sp);}
    no.disabled=expired;
    no.onclick=()=>setStatus(r,'no');
    noCell.append(no);

    row.append(athleteCell,categoryCell,yesCell,noCell);

    // Riga secondaria: accompagnatore + scadenza
    const detail=document.createElement('div');
    detail.className='athlete-row-detail';

    if(cfg.show_companion!==false && r.status==='yes'){
      const companion=document.createElement('div');
      companion.className='companion';
      const input=document.createElement('input');
      input.placeholder='Nome accompagnatore';
      input.value=r.companion_name||'';
      input.disabled=expired;
      const save=document.createElement('button');
      save.textContent='Salva accompagnatore';
      save.disabled=expired;
      save.onclick=()=>setCompanion(r,input.value);
      companion.append(input,save);
      detail.append(companion);
    }

    const deadline=document.createElement('div');
    deadline.className='deadline'+(expired?' expired':'');
    deadline.textContent=expired
      ? 'Scadenza terminata'
      : `Modificabile fino al ${formatDate(r.effective_deadline)}`;
    detail.append(deadline);

    row.append(detail);
    box.append(row);
  });
}

async function notifyTelegramStatusNow(r,status){
  try{
    const {error}=await db.functions.invoke('telegram-dispatch',{
      body:{
        action:'status_now',
        event_slug:selectedSlug,
        athlete_id:r.athlete_id,
        status
      }
    });
    if(error)console.warn('Notifica Telegram immediata non inviata:',error.message||error);
  }catch(err){
    console.warn('Notifica Telegram immediata non inviata:',err);
  }
}

async function setStatus(r,status){
  if(!confirm(`Confermi la scelta per ${r.full_name}?`))return;
  const {error}=await db.rpc('v2_set_registration_status',{p_event_slug:selectedSlug,p_athlete_id:r.athlete_id,p_status:status});
  if(error){toast(friendlyError(error.message));return}
  toast('Scelta salvata');
  void notifyTelegramStatusNow(r,status);
  if(status==='yes') showCelebration();
  await loadEvent(selectedSlug);
}

async function setCompanion(r,name){
  const clean=name.trim().toUpperCase();
  const {error}=await db.rpc('v2_set_companion',{p_event_slug:selectedSlug,p_athlete_id:r.athlete_id,p_companion_name:clean});
  if(error){toast(friendlyError(error.message));return}
  toast('Accompagnatore salvato');
  await loadEvent(selectedSlug);
}

function friendlyError(m){
  if(m.includes('REGISTRATION_DEADLINE_EXPIRED'))return 'La scadenza per questa iscrizione è terminata.';
  if(m.includes('REGISTRATION_LOCKED'))return 'Questa iscrizione è stata bloccata dall’amministratore.';
  if(m.includes('EVENT_NOT_AVAILABLE'))return 'La gara non è disponibile.';
  return m;
}

function renderConfirmed(regs,cfg){
  const yes=regs.filter(r=>r.status==='yes'),sec=document.getElementById('confirmedSection'),box=document.getElementById('confirmed');
  if(!yes.length){sec.classList.add('hidden');return}
  sec.classList.remove('hidden');box.replaceChildren();

  const groups=yes.reduce((a,r)=>((a[r.category]??=[]).push(r),a),{});
  Object.entries(groups).sort().forEach(([cat,list])=>{
    const g=document.createElement('div');g.className='confirmed-group';
    const h=document.createElement('strong');h.textContent=cat;g.append(h,document.createElement('br'));
    list.sort((a,b)=>a.full_name.localeCompare(b.full_name)).forEach(r=>{
      const s=document.createElement('span');s.className='pill';
      s.textContent=r.race_day?`${r.full_name} — ${r.race_day}`:r.full_name;
      g.append(s);
    });
    box.append(g);
  });
}

function renderPayment(pay){
  const box=document.getElementById('paymentBox');box.replaceChildren();
  if(!pay){box.classList.add('hidden');return}
  box.classList.remove('hidden');
  const h=document.createElement('h2');h.textContent='Dati pagamento';box.append(h);

  if(typeof pay==='string'){
    const p=document.createElement('p');p.textContent=pay;box.append(p);return;
  }

  const entries=[['Intestatario',pay.holder],['IBAN',pay.iban],['Causale',pay.reason],['Email distinta',pay.email]].filter(([,v])=>v);
  const grid=document.createElement('div');grid.className='payment-grid';
  entries.forEach(([k,v])=>{
    const d=document.createElement('div');d.className='payment-item';
    const s=document.createElement('strong');s.textContent=k;
    const p=document.createElement('div');p.textContent=v;
    d.append(s,p);grid.append(d);
  });
  if(entries.length)box.append(grid);else box.classList.add('hidden');
}

function renderDocs(cfg){
  const docs=[cfg.document_1,cfg.document_2].filter(Boolean),box=document.getElementById('documentsBox');
  box.replaceChildren();
  if(!docs.some(d=>d?.url)){box.classList.add('hidden');return}
  box.classList.remove('hidden');
  const h=document.createElement('h2');h.textContent='Documenti';box.append(h);
  docs.forEach(d=>{
    if(d?.url){
      const a=document.createElement('a');a.href=d.url;a.target='_blank';a.rel='noopener noreferrer';
      a.textContent=d.text||'Apri documento';a.className='pill';box.append(a);
    }
  });
}

document.getElementById('search').addEventListener('input',()=>payload&&renderRegistrations(payload.registrations||[],payload.config||{}));
document.getElementById('categoryFilter').addEventListener('change',()=>payload&&renderRegistrations(payload.registrations||[],payload.config||{}));

function setRegistrationSort(mode){
  registrationSort=mode==='category'?'category':'name';
  const nameBtn=document.getElementById('sortByName');
  const catBtn=document.getElementById('sortByCategory');
  const active=registrationSort==='name'?nameBtn:catBtn;
  const inactive=registrationSort==='name'?catBtn:nameBtn;

  [nameBtn,catBtn].forEach(btn=>{
    if(!btn)return;
    const isActive=btn===active;
    btn.classList.toggle('active',isActive);
    btn.setAttribute('aria-pressed',String(isActive));
  });

  const nameIcon=nameBtn?.querySelector('.sort-indicator');
  const catIcon=catBtn?.querySelector('.sort-indicator');
  if(nameIcon)nameIcon.className=`fas ${registrationSort==='name'?'fa-arrow-down-a-z':'fa-sort'} sort-indicator`;
  if(catIcon)catIcon.className=`fas ${registrationSort==='category'?'fa-arrow-down-short-wide':'fa-sort'} sort-indicator`;

  if(payload)renderRegistrations(payload.registrations||[],payload.config||{});
}
document.getElementById('sortByName')?.addEventListener('click',()=>setRegistrationSort('name'));
document.getElementById('sortByCategory')?.addEventListener('click',()=>setRegistrationSort('category'));

window.addEventListener('popstate',()=>{
  publicRoute=readPublicRoute();
  selectedSlug=publicRoute.slug;
  directEventMode=publicRoute.direct;
  selectedSlug?loadEvent(selectedSlug):loadEvents();
});


function categoryClass(category){
  const c=(category||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase();
  if(c.includes('senior'))return 'cat-senior';
  if(c.includes('junior'))return 'cat-junior';
  if(c.includes('alliev'))return 'cat-allievi';
  if(c.includes('ragazzi 12')||c.includes('r12'))return 'cat-r12';
  if(c.includes('ragazz'))return 'cat-ragazzi';
  if(c.includes('esord'))return 'cat-esordienti';
  if(c.includes('giovan'))return 'cat-giovanissimi';
  return 'cat-default';
}

function startHeroCountdown(deadline){
  stopHeroCountdown();
  const box=document.getElementById('heroCountdown');
  if(!box)return;
  if(!deadline){box.classList.add('hidden');return}

  const update=()=>{
    const diff=new Date(deadline).getTime()-Date.now();
    box.replaceChildren();

    const icon=document.createElement('i');
    icon.className='fas fa-stopwatch';

    const copy=document.createElement('div');
    const label=document.createElement('span');
    label.className='countdown-label';
    label.textContent=diff>0?'TEMPO ALLA SCADENZA':'ISCRIZIONI CHIUSE';

    const value=document.createElement('strong');
    if(diff<=0){
      value.textContent='SCADUTO';
      box.classList.add('countdown-expired');
    }else{
      box.classList.remove('countdown-expired');
      const total=Math.floor(diff/1000);
      const days=Math.floor(total/86400);
      const hours=Math.floor((total%86400)/3600);
      const mins=Math.floor((total%3600)/60);
      const secs=total%60;
      value.textContent=`${days}g ${String(hours).padStart(2,'0')}h ${String(mins).padStart(2,'0')}m ${String(secs).padStart(2,'0')}s`;
    }
    copy.append(label,value);
    box.append(icon,copy);
    box.classList.remove('hidden');
  };
  update();
  countdownInterval=setInterval(update,1000);
}

function stopHeroCountdown(){
  if(countdownInterval){clearInterval(countdownInterval);countdownInterval=null}
  const box=document.getElementById('heroCountdown');
  if(box)box.classList.add('hidden');
}

function showCelebration(){
  const overlay=document.getElementById('celebrationEffect');
  if(!overlay)return;
  overlay.classList.remove('hidden');
  overlay.setAttribute('aria-hidden','false');

  const burst=document.createElement('div');
  burst.className='celebration-particles';
  const symbols=['🛼','★','●','◆'];
  for(let i=0;i<28;i++){
    const s=document.createElement('span');
    s.textContent=symbols[i%symbols.length];
    s.style.setProperty('--x',`${(Math.random()-.5)*90}vw`);
    s.style.setProperty('--y',`${(Math.random()-.5)*90}vh`);
    s.style.setProperty('--r',`${Math.round((Math.random()-.5)*720)}deg`);
    s.style.setProperty('--d',`${Math.random()*.35}s`);
    burst.append(s);
  }
  overlay.append(burst);
  setTimeout(()=>{
    overlay.classList.add('hidden');
    overlay.setAttribute('aria-hidden','true');
    burst.remove();
  },1550);
}

function initVisualControls(){
  // Tema Racing fisso: rimossa l'impostazione giorno/notte.
  document.body.classList.add('dark');
  document.documentElement.dataset.theme='dark';

  const top=document.getElementById('scrollTopBtn');
  if(top){
    const sync=()=>top.classList.toggle('visible',window.scrollY>500);
    window.addEventListener('scroll',sync,{passive:true});
    sync();
    top.onclick=()=>window.scrollTo({top:0,behavior:'smooth'});
  }
}


init();
