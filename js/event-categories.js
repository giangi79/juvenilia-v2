import { db } from './supabase.js';
import { toast } from './ui.js';

const CATEGORIES=['GIOVANISSIMI','ESORDIENTI','R12','RAGAZZI','ALLIEVI','JUNIOR','SENIOR'];
const $=id=>document.getElementById(id);
const clean=v=>String(v??'').trim().toUpperCase();
let loadedAllowed=[...CATEGORIES];
let creatingEvent=false;

function ensureUI(){
  if($('eventCategoriesChecks'))return;
  const description=$('eventDescriptionInput')?.closest('label');
  if(!description)return;
  const card=document.createElement('div');card.className='wide event-categories-card';
  card.innerHTML=`<div class="event-categories-head"><div><strong>Categorie ammesse</strong><small>Lascia selezionate solo le categorie che possono partecipare a questa gara.</small></div><div class="event-categories-actions"><button id="selectAllEventCategories" type="button" class="secondary">Tutte</button><button id="clearEventCategories" type="button" class="secondary">Nessuna</button></div></div><div id="eventCategoriesChecks" class="event-categories-grid"></div>`;
  description.insertAdjacentElement('afterend',card);
  const style=document.createElement('style');style.textContent=`
    .event-categories-card{background:#10283c;border:1px solid #355a78;border-radius:14px;padding:16px}.event-categories-head{display:flex;justify-content:space-between;gap:14px;align-items:flex-start;margin-bottom:13px}.event-categories-head strong{display:block;font-size:1rem;margin-bottom:4px}.event-categories-head small{display:block;color:#a9c3d8;line-height:1.35}.event-categories-actions{display:flex;gap:7px;flex-wrap:wrap}.event-categories-actions button{padding:7px 11px;font-size:.82rem}.event-categories-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:9px}.event-category-option{display:flex!important;align-items:center;gap:9px;background:#17354f;border:1px solid #3c6483;border-radius:10px;padding:10px 12px;cursor:pointer;font-weight:800;margin:0!important}.event-category-option:hover{border-color:#67bff1;background:#1c405e}.event-category-option input{width:19px;height:19px;accent-color:#19a7e0;flex:0 0 auto}@media(max-width:700px){.event-categories-head{flex-direction:column}.event-categories-actions{width:100%}.event-categories-actions button{flex:1}.event-categories-grid{grid-template-columns:1fr 1fr}}@media(max-width:430px){.event-categories-grid{grid-template-columns:1fr}}`;
  document.head.append(style);
}

function render(selected=CATEGORIES){
  const host=$('eventCategoriesChecks');if(!host)return;
  const chosen=new Set(selected.map(clean));
  host.replaceChildren();
  CATEGORIES.forEach(category=>{
    const label=document.createElement('label');label.className='event-category-option';
    const input=document.createElement('input');input.type='checkbox';input.value=category;input.checked=chosen.has(category);
    const text=document.createElement('span');text.textContent=category;
    label.append(input,text);host.append(label);
  });
}
function selected(){return [...document.querySelectorAll('#eventCategoriesChecks input:checked')].map(x=>x.value)}
function applyPublicSwitches(map){
  if($('cfgInfoVisible'))$('cfgInfoVisible').checked=map.show_info_box===true;
  if($('cfgCompanion'))$('cfgCompanion').checked=map.show_companion===true;
  if($('advShowCosts'))$('advShowCosts').checked=map.show_category_costs===true;
}
async function loadForEvent(){
  if(creatingEvent)return;
  const eventId=$('eventSelect')?.value;
  if(!eventId){loadedAllowed=[...CATEGORIES];render(loadedAllowed);return}
  const {data:{session}}=await db.auth.getSession();
  if(!session||creatingEvent||$('eventSelect')?.value!==eventId)return;
  const keys=['allowed_categories','show_info_box','show_companion','show_category_costs'];
  const {data,error}=await db.from('v2_event_config').select('key,value').eq('event_id',eventId).in('key',keys);
  if(creatingEvent||$('eventSelect')?.value!==eventId)return;
  if(error){toast('Errore caricamento impostazioni gara: '+error.message);return}
  const map=Object.fromEntries((data||[]).map(x=>[x.key,x.value]));
  const publicDefaults=['show_info_box','show_companion','show_category_costs'];
  const missing=publicDefaults.filter(key=>!Object.prototype.hasOwnProperty.call(map,key));
  if(missing.length){
    const rows=missing.map(key=>({event_id:eventId,key,value:false,is_public:true}));
    const {error:defaultError}=await db.from('v2_event_config').upsert(rows,{onConflict:'event_id,key'});
    if(creatingEvent||$('eventSelect')?.value!==eventId)return;
    if(defaultError){toast('Errore salvataggio impostazioni iniziali: '+defaultError.message);return}
    missing.forEach(key=>{map[key]=false});
  }
  loadedAllowed=Array.isArray(map.allowed_categories)&&map.allowed_categories.length?map.allowed_categories.map(clean).filter(c=>CATEGORIES.includes(c)):[...CATEGORIES];
  render(loadedAllowed);
  applyPublicSwitches(map);
}
async function saveAndSync(eventId,allowed){
  const {error:cfgError}=await db.from('v2_event_config').upsert({event_id:eventId,key:'allowed_categories',value:allowed,is_public:false},{onConflict:'event_id,key'});
  if(cfgError)throw cfgError;
  const {data:event,error:eventError}=await db.from('v2_events').select('season_id').eq('id',eventId).single();
  if(eventError)throw eventError;
  const [{data:athletes,error:ae},{data:regs,error:re}]=await Promise.all([
    db.from('v2_season_athletes').select('athlete_id,category').eq('season_id',event.season_id).eq('is_active',true),
    db.from('v2_event_registrations').select('id,athlete_id,category_override,category_snapshot,athlete:v2_athletes(category)').eq('event_id',eventId)
  ]);
  if(ae)throw ae;if(re)throw re;
  const ok=new Set(allowed);
  const remove=(regs||[]).filter(r=>!ok.has(clean(r.category_override||r.category_snapshot||r.athlete?.category)));
  if(remove.length){const {error}=await db.from('v2_event_registrations').delete().in('id',remove.map(r=>r.id));if(error)throw error}
  const kept=new Set((regs||[]).filter(r=>!remove.some(x=>x.id===r.id)).map(r=>r.athlete_id));
  const add=(athletes||[]).filter(a=>ok.has(clean(a.category))&&!kept.has(a.athlete_id)).map(a=>({event_id:eventId,athlete_id:a.athlete_id,category_snapshot:a.category,status:'pending'}));
  if(add.length){const {error}=await db.from('v2_event_registrations').upsert(add,{onConflict:'event_id,athlete_id',ignoreDuplicates:true});if(error)throw error}
  loadedAllowed=[...allowed];
  return {added:add.length,removed:remove.length};
}

async function applyNewEventDefaults(eventId){
  const rows=[
    {event_id:eventId,key:'show_info_box',value:false,is_public:true},
    {event_id:eventId,key:'show_companion',value:false,is_public:true},
    {event_id:eventId,key:'show_category_costs',value:false,is_public:true}
  ];
  const {error}=await db.from('v2_event_config').upsert(rows,{onConflict:'event_id,key'});
  if(error)throw error;
}
function showNewEventDefaultsInUI(){
  if($('cfgInfoVisible'))$('cfgInfoVisible').checked=false;
  if($('cfgCompanion'))$('cfgCompanion').checked=false;
  if($('advShowCosts'))$('advShowCosts').checked=false;
}

ensureUI();
$('selectAllEventCategories')?.addEventListener('click',()=>render(CATEGORIES));
$('clearEventCategories')?.addEventListener('click',()=>render([]));
$('newEventBtn')?.addEventListener('click',()=>{creatingEvent=true;loadedAllowed=[...CATEGORIES];render(loadedAllowed);showNewEventDefaultsInUI()});
$('eventSelect')?.addEventListener('change',()=>{creatingEvent=false;setTimeout(loadForEvent,0)});
['registrationsEventSelect','configEventSelect','advancedEventSelect','exportEventSelect'].forEach(id=>$(id)?.addEventListener('change',()=>{creatingEvent=false;setTimeout(loadForEvent,0)}));
document.addEventListener('juvenilia:event-changed',()=>setTimeout(loadForEvent,0));

db.auth.onAuthStateChange((event,session)=>{
  if(session&&(event==='SIGNED_IN'||event==='INITIAL_SESSION')){
    // admin.js carica la configurazione dopo il login: sincronizziamo gli switch
    // solo dopo che quel caricamento è terminato, usando i valori reali del DB.
    setTimeout(loadForEvent,700);
  }
});

const saveBtn=$('saveEventBtn');
if(saveBtn){
  const originalSave=saveBtn.onclick;
  saveBtn.onclick=async event=>{
    const allowed=selected();
    if(!allowed.length)return toast('Seleziona almeno una categoria ammessa');
    const removed=loadedAllowed.filter(c=>!allowed.includes(c));
    const eventIdBefore=$('eventSelect')?.value||'';
    const wasCreating=(saveBtn.textContent||'').toLowerCase().includes('crea');
    let existingEventIds=new Set();
    if(wasCreating){
      const {data,error}=await db.from('v2_events').select('id');
      if(error)return toast('Errore preparazione nuova gara: '+error.message);
      existingEventIds=new Set((data||[]).map(x=>x.id));
    }
    if(eventIdBefore&&removed.length&&!wasCreating){
      const {data:regs,error}=await db.from('v2_event_registrations').select('status,category_override,category_snapshot,athlete:v2_athletes(category)').eq('event_id',eventIdBefore);
      if(error)return toast('Errore controllo categorie: '+error.message);
      const affected=(regs||[]).filter(r=>removed.includes(clean(r.category_override||r.category_snapshot||r.athlete?.category)));
      if(affected.length){
        const answered=affected.filter(r=>r.status!=='pending').length;
        if(!confirm(`Stai disabilitando: ${removed.join(', ')}.\n\nSaranno rimosse ${affected.length} iscrizioni${answered?`, di cui ${answered} con risposta già registrata`:''}.\n\nContinuare?`))return;
      }
    }
    const savedOk=await originalSave?.call(saveBtn,event);
    if(savedOk===false)return;
    if(wasCreating&&$('saveEventBtn')?.textContent?.toLowerCase().includes('crea'))return;
    creatingEvent=false;
    let eventId=$('eventSelect')?.value||'';
    if(wasCreating){
      const {data:newEvents,error}=await db.from('v2_events').select('id,created_at').order('created_at',{ascending:false});
      if(error)return toast('Gara creata, ma errore impostazioni iniziali: '+error.message);
      const created=(newEvents||[]).find(x=>!existingEventIds.has(x.id));
      if(!created)return toast('Gara creata, ma non riesco a identificare la nuova gara per applicare le impostazioni iniziali');
      eventId=created.id;
    }
    if(!eventId)return;
    try{
      if(wasCreating)await applyNewEventDefaults(eventId);
      const result=await saveAndSync(eventId,allowed);
      if(result.added||result.removed)toast(`Categorie ammesse aggiornate: ${result.added} atleti aggiunti, ${result.removed} rimossi`);
      else toast('Categorie ammesse salvate');
      if($('eventSelect')&&$('eventSelect').value!==eventId)$('eventSelect').value=eventId;
      await $('eventSelect')?.onchange?.();
      if(wasCreating)showNewEventDefaultsInUI();
      document.dispatchEvent(new CustomEvent('juvenilia:event-changed',{detail:{eventId}}));
      document.dispatchEvent(new CustomEvent('juvenilia:event-save-complete',{detail:{eventId}}));
      setTimeout(loadForEvent,100);
    }catch(err){toast('Errore gestione gara: '+(err?.message||err))}
  };
}

const enrollBtn=$('enrollAllBtn');
if(enrollBtn){
  enrollBtn.onclick=async()=>{
    const eventId=$('eventSelect')?.value;if(!eventId)return toast('Seleziona una gara');
    try{const result=await saveAndSync(eventId,loadedAllowed);toast(result.added?`${result.added} atleti aggiunti`:'Tutti gli atleti delle categorie ammesse sono già presenti');await $('eventSelect')?.onchange?.();document.dispatchEvent(new CustomEvent('juvenilia:event-changed',{detail:{eventId}}))}
    catch(err){toast('Errore aggiunta atleti: '+(err?.message||err))}
  };
}

render(CATEGORIES);
setTimeout(loadForEvent,900);
