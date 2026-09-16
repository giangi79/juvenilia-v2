import { db } from './supabase.js';
import { toast } from './ui.js';

const $=id=>document.getElementById(id);
const KEYS=['event_location','event_date_text'];

function ensureFields(){
  if($('eventLocationInput'))return;
  const title=$('eventTitleInput');
  if(!title)return;
  const grid=title.closest('.form-grid');
  if(!grid)return;
  const description=$('eventDescriptionInput')?.closest('label');
  if(description)description.style.display='none';
  const locationLabel=document.createElement('label');
  locationLabel.innerHTML='Luogo<input id="eventLocationInput" type="text" placeholder="Es. Senigallia">';
  const dateLabel=document.createElement('label');
  dateLabel.innerHTML='Data<input id="eventDateTextInput" type="text" placeholder="Es. 20-21 settembre 2026"><small class="muted">Scrivila liberamente, senza calendario.</small>';
  const slugLabel=$('eventSlugInput')?.closest('label');
  if(slugLabel){slugLabel.insertAdjacentElement('beforebegin',locationLabel);locationLabel.insertAdjacentElement('afterend',dateLabel)}
  else grid.append(locationLabel,dateLabel);
}

async function loadFields(){
  ensureFields();
  const eventId=$('eventSelect')?.value;
  if(!eventId){$('eventLocationInput').value='';$('eventDateTextInput').value='';return}
  const {data,error}=await db.from('v2_event_config').select('key,value').eq('event_id',eventId).in('key',KEYS);
  if(error)return;
  const map=Object.fromEntries((data||[]).map(r=>[r.key,r.value]));
  $('eventLocationInput').value=typeof map.event_location==='string'?map.event_location:'';
  $('eventDateTextInput').value=typeof map.event_date_text==='string'?map.event_date_text:'';
}

async function saveFieldsFor(eventId){
  if(!eventId)return;
  const location=$('eventLocationInput')?.value.trim()||'';
  const dateText=$('eventDateTextInput')?.value.trim()||'';
  const rows=[
    {event_id:eventId,key:'event_location',value:location,is_public:true},
    {event_id:eventId,key:'event_date_text',value:dateText,is_public:true}
  ];
  const {error}=await db.from('v2_event_config').upsert(rows,{onConflict:'event_id,key'});
  if(error)toast('Gara salvata, ma luogo/data non salvati: '+error.message);
}

ensureFields();
$('eventSelect')?.addEventListener('change',()=>setTimeout(loadFields,80));
$('newEventBtn')?.addEventListener('click',()=>setTimeout(()=>{ensureFields();$('eventLocationInput').value='';$('eventDateTextInput').value=''},0));
$('saveEventBtn')?.addEventListener('click',()=>{
  const title=$('eventTitleInput')?.value.trim();
  const before=$('eventSelect')?.value;
  let tries=0;
  const timer=setInterval(async()=>{
    tries++;
    const sel=$('eventSelect');
    const current=sel?.value;
    const optionText=sel?.selectedOptions?.[0]?.textContent||'';
    const ready=current && (current!==before || optionText.startsWith(title||'') || tries>5);
    if(ready||tries>=20){clearInterval(timer);if(current){await saveFieldsFor(current);await loadFields()}}
  },250);
},true);
document.addEventListener('juvenilia:event-changed',()=>setTimeout(loadFields,100));
setTimeout(loadFields,900);
