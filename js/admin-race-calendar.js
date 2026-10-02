import { db } from './supabase.js';
import { toast } from './ui.js';

const $=id=>document.getElementById(id);
const parseDate=value=>value?new Date(value+'T12:00:00'):null;
const formatDate=value=>parseDate(value)?.toLocaleDateString('it-IT',{day:'numeric',month:'long',year:'numeric'})||'';
const formatRange=item=>item.end_date&&item.end_date!==item.start_date
  ? formatDate(item.start_date)+' – '+formatDate(item.end_date)
  : formatDate(item.start_date);

async function loadCalendar(){
  const host=$('adminRaceCalendarList');
  if(!host)return;
  host.innerHTML='<p class="muted">Caricamento appuntamenti…</p>';
  const {data,error}=await db.from('v2_race_calendar').select('*').order('start_date',{ascending:true});
  if(error){host.innerHTML='<p class="error">Non è stato possibile caricare il calendario.</p>';toast(error.message);return}
  const today=new Date(); today.setHours(0,0,0,0);
  const upcoming=(data||[]).filter(item=>parseDate(item.end_date||item.start_date)>=today);
  host.replaceChildren();
  if(!upcoming.length){host.innerHTML='<p class="muted">Non hai ancora inserito gare future.</p>';return}
  upcoming.forEach(item=>{
    const row=document.createElement('article');
    row.className='admin-row';
    const info=document.createElement('div');
    const title=document.createElement('strong'); title.textContent=item.title;
    const meta=document.createElement('div'); meta.className='muted';
    meta.textContent=[formatRange(item),item.event_type,item.location].filter(Boolean).join(' · ');
    info.append(title,meta);
    if(item.notes){const notes=document.createElement('small');notes.className='muted';notes.textContent=item.notes;info.append(notes)}
    row.append(info);
    host.append(row);
  });
}

const form=$('adminRaceCalendarForm');
form?.addEventListener('submit',async event=>{
  event.preventDefault();
  const values=new FormData(form);
  const title=String(values.get('title')||'').trim();
  const startDate=String(values.get('start_date')||'');
  const endDate=String(values.get('end_date')||'');
  if(!title||!startDate){toast('Inserisci almeno nome e data della gara');return}
  if(endDate&&endDate<startDate){toast('La data finale non può precedere quella iniziale');return}
  const submit=form.querySelector('button[type="submit"]');
  submit.disabled=true;
  const {error}=await db.from('v2_race_calendar').insert({
    title,
    start_date:startDate,
    end_date:endDate||null,
    event_type:String(values.get('event_type')||'Gara'),
    location:String(values.get('location')||'').trim()||null,
    notes:String(values.get('notes')||'').trim()||null
  });
  submit.disabled=false;
  if(error){toast('Non è stato possibile salvare: '+error.message);return}
  form.reset();
  toast('Appuntamento aggiunto al calendario');
  loadCalendar();
});

document.querySelector('[data-tab="calendar"]')?.addEventListener('click',loadCalendar);
