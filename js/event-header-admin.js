import { db } from './supabase.js';
import { toast } from './ui.js';

const $=id=>document.getElementById(id);
const KEYS=['event_location','event_date_text','event_start_date','event_end_date','event_program_url','event_maps_url'];

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
  const dateLabel=document.createElement('div');
  dateLabel.innerHTML='<label>Data inizio<input id="eventStartDateInput" type="date"></label><small id="eventLegacyDate" class="muted"></small><input id="eventDateTextInput" type="hidden">';
  const endLabel=document.createElement('label');
  endLabel.innerHTML='Data fine<input id="eventEndDateInput" type="date"><small class="muted">Per una gara di un solo giorno puoi lasciarla vuota.</small>';
  dateLabel.append(endLabel);
  dateLabel.addEventListener('change',()=>{const start=$('eventStartDateInput'),end=$('eventEndDateInput');end.min=start.value;end.setCustomValidity(end.value&&(!start.value||end.value<start.value)?'La data fine deve essere uguale o successiva alla data inizio.':'')});
  const programLabel=document.createElement('label');
  programLabel.innerHTML='Link programma<input id="eventProgramUrlInput" type="url" placeholder="https://..."><small class="muted">Facoltativo. Attiva il pulsante Programma nella Dashboard.</small>';
  const mapsLabel=document.createElement('label');
  mapsLabel.innerHTML='Link Google Maps<input id="eventMapsUrlInput" type="url" placeholder="https://maps.app.goo.gl/..."><small class="muted">Facoltativo: se vuoto, Maps cercherà automaticamente il luogo indicato.</small>';
  const slugLabel=$('eventSlugInput')?.closest('label');
  if(slugLabel){slugLabel.insertAdjacentElement('beforebegin',locationLabel);locationLabel.insertAdjacentElement('afterend',dateLabel);dateLabel.insertAdjacentElement('afterend',programLabel);programLabel.insertAdjacentElement('afterend',mapsLabel)}
  else grid.append(locationLabel,dateLabel,programLabel,mapsLabel);
}

async function loadFields(){
  ensureFields();
  const eventId=$('eventSelect')?.value;
  if(!eventId){$('eventLocationInput').value='';$('eventDateTextInput').value='';$('eventStartDateInput').value='';$('eventEndDateInput').value='';$('eventEndDateInput').min='';$('eventEndDateInput').setCustomValidity('');$('eventLegacyDate').textContent='';$('eventProgramUrlInput').value='';$('eventMapsUrlInput').value='';return}
  const {data,error}=await db.from('v2_event_config').select('key,value').eq('event_id',eventId).in('key',KEYS);
  if(error)return;
  if($('eventSelect')?.value!==eventId)return;
  const map=Object.fromEntries((data||[]).map(r=>[r.key,r.value]));
  $('eventLocationInput').value=typeof map.event_location==='string'?map.event_location:'';
  $('eventDateTextInput').value=typeof map.event_date_text==='string'?map.event_date_text:'';
  $('eventStartDateInput').value=map.event_start_date||'';
  $('eventEndDateInput').value=map.event_end_date||'';
  $('eventEndDateInput').min=$('eventStartDateInput').value;
  $('eventEndDateInput').setCustomValidity('');
  $('eventLegacyDate').textContent=!map.event_start_date&&map.event_date_text?'Data precedente: '+map.event_date_text+'. Seleziona le date per aggiornarla.':'';
  $('eventProgramUrlInput').value=typeof map.event_program_url==='string'?map.event_program_url:'';
  $('eventMapsUrlInput').value=typeof map.event_maps_url==='string'?map.event_maps_url:'';
}

async function saveFieldsFor(eventId){
  if(!eventId)return;
  const location=$('eventLocationInput')?.value.trim()||'';
  const start=$('eventStartDateInput').value,end=$('eventEndDateInput').value;
  const format=value=>new Intl.DateTimeFormat('it-IT',{day:'numeric',month:'long',year:'numeric'}).format(new Date(value+'T12:00:00'));
  const dateText=start?(end&&end!==start?format(start)+' – '+format(end):format(start)):($('eventDateTextInput')?.value.trim()||'');
  const programUrl=$('eventProgramUrlInput')?.value.trim()||'';
  const mapsUrl=$('eventMapsUrlInput')?.value.trim()||'';
  const rows=[
    {event_id:eventId,key:'event_location',value:location,is_public:true},
    {event_id:eventId,key:'event_date_text',value:dateText,is_public:true},
    {event_id:eventId,key:'event_start_date',value:start,is_public:true},
    {event_id:eventId,key:'event_end_date',value:end,is_public:true},
    {event_id:eventId,key:'event_program_url',value:programUrl,is_public:true},
    {event_id:eventId,key:'event_maps_url',value:mapsUrl,is_public:true}
  ];
  const {error}=await db.from('v2_event_config').upsert(rows,{onConflict:'event_id,key'});
  if(error)toast('Gara salvata, ma luogo/data non salvati: '+error.message);
}

ensureFields();
$('eventSelect')?.addEventListener('change',()=>setTimeout(loadFields,80));
$('newEventBtn')?.addEventListener('click',()=>setTimeout(()=>{ensureFields();$('eventLocationInput').value='';$('eventDateTextInput').value='';$('eventStartDateInput').value='';$('eventEndDateInput').value='';$('eventEndDateInput').min='';$('eventEndDateInput').setCustomValidity('');$('eventLegacyDate').textContent='';$('eventProgramUrlInput').value='';$('eventMapsUrlInput').value=''},0));
$('saveEventBtn')?.addEventListener('click',event=>{
  const start=$('eventStartDateInput'),end=$('eventEndDateInput');
  if(end.value&&(!start.value||end.value<start.value)){event.preventDefault();event.stopImmediatePropagation();end.setCustomValidity('La data fine deve essere uguale o successiva alla data inizio.');end.reportValidity();return}
  end.setCustomValidity('');
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
