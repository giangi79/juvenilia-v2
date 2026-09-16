import { db } from './supabase.js';
import { toast } from './ui.js';

const DAYS=['LUNEDÌ','MARTEDÌ','MERCOLEDÌ','GIOVEDÌ','VENERDÌ','SABATO','DOMENICA'];
const $=id=>document.getElementById(id);
let slug=null,enabled=[],choices=new Map(),regs=[],busy=false,refreshTimer=null;
const routeSlug=()=>{const p=new URLSearchParams(location.search);return p.get('gara')||p.get('event')||null};
const short=d=>String(d||'').slice(0,3);
const selectedFor=id=>choices.get(String(id))||[];

async function refreshData(){
  slug=routeSlug();
  if(!slug){enabled=[];choices.clear();regs=[];render();return}
  const [{data:event,error:e1},{data:rows,error:e2}]=await Promise.all([
    db.rpc('v2_get_public_event',{p_slug:slug}),
    db.rpc('v2_get_public_registration_days',{p_slug:slug})
  ]);
  if(e1||e2){console.warn('Giorni gara:',(e1||e2)?.message);return}
  enabled=Array.isArray(event?.config?.athlete_weekdays)?event.config.athlete_weekdays.filter(d=>DAYS.includes(d)):[];
  choices=new Map((rows||[]).map(r=>[String(r.athlete_id),Array.isArray(r.race_days)?r.race_days:[]]));
  regs=event?.registrations||[];
  render();
}
function scheduleRefresh(){clearTimeout(refreshTimer);refreshTimer=setTimeout(refreshData,90)}

async function saveDays(reg,next){
  if(busy)return;
  busy=true;
  try{
    const {error}=await db.rpc('v2_set_registration_days',{p_event_slug:slug,p_athlete_id:reg.athlete_id,p_days:next});
    if(error){toast(error.message);return}
    choices.set(String(reg.athlete_id),next);
    toast('Giorni gara salvati');
    render();
  }finally{busy=false}
}

function addDayChoices(row,reg){
  row.querySelector('.athlete-weekday-choice')?.remove();
  if(!enabled.length)return;
  const host=row.querySelector('.athlete-name-cell');if(!host)return;
  const wrap=document.createElement('div');wrap.className='athlete-weekday-choice';
  const title=document.createElement('span');title.className='weekday-choice-title';title.textContent='Giorni:';wrap.append(title);
  enabled.forEach(day=>{
    const label=document.createElement('label');label.className='weekday-choice';
    const input=document.createElement('input');input.type='checkbox';input.checked=selectedFor(reg.athlete_id).includes(day);input.disabled=reg.status!=='yes';
    const text=document.createElement('span');text.textContent=short(day);
    input.onchange=()=>{const current=new Set(selectedFor(reg.athlete_id));input.checked?current.add(day):current.delete(day);saveDays(reg,DAYS.filter(d=>current.has(d)&&enabled.includes(d)))};
    label.append(input,text);wrap.append(label);
  });
  if(reg.status!=='yes'){const note=document.createElement('small');note.textContent='Seleziona PARTECIPA per scegliere i giorni';wrap.append(note)}
  host.append(wrap);
}

function renderSummary(){
  const confirmed=$('confirmed');if(!confirmed)return;
  confirmed.querySelectorAll('.pill').forEach(p=>{
    p.querySelector('.weekday-summary')?.remove();
    const raw=[...p.childNodes].filter(n=>n.nodeType===Node.TEXT_NODE).map(n=>n.textContent).join('').trim();
    const reg=regs.find(r=>raw===r.full_name||raw.startsWith((r.full_name||'')+' —'));
    const ds=reg?selectedFor(reg.athlete_id):[];
    if(ds.length){const s=document.createElement('span');s.className='weekday-summary';s.textContent=' · '+ds.map(short).join(' • ');p.append(s)}
  });
}
function render(){
  document.querySelectorAll('#registrations .athlete').forEach(row=>{
    const name=row.querySelector('h3')?.textContent?.trim();
    const reg=regs.find(r=>r.full_name===name);if(reg)addDayChoices(row,reg);
  });
  renderSummary();
}

const registrations=$('registrations');if(registrations)new MutationObserver(scheduleRefresh).observe(registrations,{childList:true});
const confirmed=$('confirmed');if(confirmed)new MutationObserver(()=>requestAnimationFrame(renderSummary)).observe(confirmed,{childList:true});
window.addEventListener('popstate',scheduleRefresh);
setTimeout(refreshData,500);

const style=document.createElement('style');style.textContent=`
.athlete-weekday-choice{display:flex;align-items:center;gap:6px;flex-wrap:wrap;margin-top:10px}.weekday-choice-title{font-size:.72rem;font-weight:900;color:#9fc3df;text-transform:uppercase}.weekday-choice{display:inline-flex!important;align-items:center!important;gap:4px!important;margin:0!important;padding:5px 7px!important;border:1px solid #496b86;border-radius:8px;background:#102b42;cursor:pointer}.weekday-choice input{width:16px!important;height:16px!important;margin:0!important;accent-color:#21b879}.weekday-choice span{font-size:.68rem;font-weight:900}.weekday-choice:has(input:checked){background:#147653;border-color:#42c391;color:#fff}.weekday-choice:has(input:disabled){opacity:.48;cursor:not-allowed}.athlete-weekday-choice small{width:100%;font-size:.7rem;color:#8da7ba}.weekday-summary{font-weight:900;color:#62d7a6}@media(max-width:760px){.athlete-weekday-choice{gap:5px}.weekday-choice{padding:5px!important}}`;
document.head.append(style);
