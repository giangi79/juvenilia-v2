import { db } from './supabase.js';
import { toast } from './ui.js';
const $=id=>document.getElementById(id);
const DAYS=['LUNEDÌ','MARTEDÌ','MERCOLEDÌ','GIOVEDÌ','VENERDÌ','SABATO','DOMENICA'];
let days=[],regs=[],loadedEventId=null,loading=false;

function ensureUI(){
  if($('athleteWeekdaysBox'))return;
  const heading=[...document.querySelectorAll('#tab-advanced h3')].find(x=>x.textContent.includes('Giornate / date gara'));
  if(!heading)return;
  const box=document.createElement('div');box.id='athleteWeekdaysBox';box.className='athlete-weekdays-admin';
  box.innerHTML='<h3>Giorni selezionabili dagli atleti</h3><p class="muted">Seleziona i giorni che gli atleti potranno scegliere dopo aver indicato PARTECIPA. Nessun giorno selezionato = funzione disattivata.</p><div id="athleteWeekdaysChecks" class="athlete-weekdays-grid"></div><button id="saveAthleteWeekdays" type="button">Salva giorni selezionabili</button>';
  heading.insertAdjacentElement('beforebegin',box);renderChecks([]);$('saveAthleteWeekdays').onclick=save;
}
function renderChecks(selected){const host=$('athleteWeekdaysChecks');if(!host)return;const set=new Set(selected||[]);host.replaceChildren();DAYS.forEach(d=>{const l=document.createElement('label');l.className='athlete-weekday-admin-option';const i=document.createElement('input');i.type='checkbox';i.value=d;i.checked=set.has(d);const s=document.createElement('span');s.textContent=d;l.append(i,s);host.append(l)})}
async function save(){const id=$('eventSelect')?.value;if(!id)return toast('Seleziona una gara');const value=[...document.querySelectorAll('#athleteWeekdaysChecks input:checked')].map(x=>x.value);const {error}=await db.from('v2_event_config').upsert({event_id:id,key:'athlete_weekdays',value,is_public:true},{onConflict:'event_id,key'});if(error)return toast(error.message);toast(value.length?'Giorni selezionabili salvati':'Scelta giorni disattivata');loadedEventId=null;await load(true)}
function badges(values){const box=document.createElement('div');box.className='admin-day-badges';days.forEach(d=>{const s=document.createElement('span');s.textContent=d.slice(0,3);s.className=(values||[]).includes(d)?'on':'off';box.append(s)});return box}
function renderTable(){
  if(!days.length){document.querySelector('.race-days-head')?.remove();document.querySelectorAll('.race-days-cell').forEach(x=>x.remove());return}
  const table=$('registrationsBody')?.closest('table');if(!table)return;
  let th=table.querySelector('.race-days-head');if(!th){th=document.createElement('th');th.className='race-days-head';th.textContent='Giorni';table.querySelector('thead tr')?.children[2]?.insertAdjacentElement('afterend',th)}
  [...($('registrationsBody')?.rows||[])].forEach(tr=>{tr.querySelector('.race-days-cell')?.remove();const r=regs.find(x=>String(x.id)===tr.dataset.registrationId);const td=document.createElement('td');td.className='race-days-cell';td.dataset.label='Giorni';td.append(badges(r?.race_days||[]));tr.children[2]?.insertAdjacentElement('afterend',td)});
}
async function load(force=false){
  ensureUI();const id=$('eventSelect')?.value;if(!id)return;if(loading)return;if(!force&&id===loadedEventId){renderTable();return}
  const {data:{session}}=await db.auth.getSession();if(!session)return;loading=true;
  try{const [c,r]=await Promise.all([db.from('v2_event_config').select('key,value').eq('event_id',id).eq('key','athlete_weekdays'),db.from('v2_event_registrations').select('id,race_days,athlete:v2_athletes(full_name)').eq('event_id',id)]);if(c.error||r.error)return;days=Array.isArray(c.data?.[0]?.value)?c.data[0].value:[];regs=r.data||[];loadedEventId=id;renderChecks(days);renderTable()}finally{loading=false}
}
function refresh(){loadedEventId=null;setTimeout(()=>load(true),80)}
ensureUI();
const body=$('registrationsBody');if(body)new MutationObserver(()=>requestAnimationFrame(renderTable)).observe(body,{childList:true});
document.addEventListener('juvenilia:event-changed',refresh);$('eventSelect')?.addEventListener('change',refresh);$('registrationsEventSelect')?.addEventListener('change',refresh);document.querySelector('[data-tab="registrations"]')?.addEventListener('click',refresh);document.querySelector('[data-settings-panel="advanced"]')?.addEventListener('click',()=>setTimeout(()=>{ensureUI();load(true)},80));db.auth.onAuthStateChange((event,session)=>{if(session)setTimeout(()=>load(true),300);else{days=[];regs=[];loadedEventId=null}});setTimeout(()=>load(true),900);
const style=document.createElement('style');style.textContent=`.athlete-weekdays-admin{margin:18px 0;padding:16px;background:#10283c;border:1px solid #355a78;border-radius:14px}.athlete-weekdays-grid{display:grid;grid-template-columns:repeat(7,minmax(105px,1fr));gap:8px;margin:12px 0}.athlete-weekday-admin-option{display:flex!important;align-items:center!important;justify-content:center;gap:6px!important;margin:0!important;padding:10px 7px!important;border:1px solid #456883;border-radius:9px;background:#102b42;font-weight:900;cursor:pointer}.athlete-weekday-admin-option input{width:18px!important;height:18px!important;margin:0!important;accent-color:#21b879}.athlete-weekday-admin-option:has(input:checked){background:#147653;border-color:#42c391;color:#fff}.admin-day-badges{display:flex;gap:4px;flex-wrap:wrap}.admin-day-badges span{display:inline-flex;min-width:35px;justify-content:center;padding:4px 6px;border-radius:7px;font-size:.68rem;font-weight:900;border:1px solid #557087;color:#8399aa}.admin-day-badges span.on{background:#16865f;border-color:#42c391;color:#fff}.race-days-cell{min-width:150px}@media(max-width:900px){.athlete-weekdays-grid{grid-template-columns:repeat(2,1fr)}}`;
document.head.append(style);
