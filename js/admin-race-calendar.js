import { db } from './supabase.js';
import { toast } from './ui.js';

const $=id=>document.getElementById(id);
const parseDate=value=>value?new Date(value+'T12:00:00'):null;
const formatDate=value=>parseDate(value)?.toLocaleDateString('it-IT',{day:'numeric',month:'long',year:'numeric'})||'';
const formatRange=item=>item.end_date&&item.end_date!==item.start_date
  ? formatDate(item.start_date)+' – '+formatDate(item.end_date)
  : formatDate(item.start_date);
const form=$('adminRaceCalendarForm');
let editingId=null;

function resetForm(){
  editingId=null;
  form?.reset();
  const submit=form?.querySelector('button[type="submit"]');
  if(submit)submit.innerHTML='<i class="fas fa-plus"></i> Aggiungi al calendario';
  $('adminRaceCalendarCancel')?.classList.add('hidden');
}

function beginEdit(item){
  editingId=item.id;
  form.elements.title.value=item.title||'';
  form.elements.start_date.value=item.start_date||'';
  form.elements.end_date.value=item.end_date||'';
  form.elements.event_type.value=item.event_type||'Gara';
  form.elements.location.value=item.location||'';
  form.elements.notes.value=item.notes||'';
  const submit=form.querySelector('button[type="submit"]');
  submit.innerHTML='<i class="fas fa-floppy-disk"></i> Salva modifiche';
  $('adminRaceCalendarCancel')?.classList.remove('hidden');
  form.scrollIntoView({behavior:'smooth',block:'start'});
}

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
    const actions=document.createElement('div'); actions.className='actions';
    const edit=document.createElement('button'); edit.type='button'; edit.className='secondary';
    edit.innerHTML='<i class="fas fa-pen"></i> Modifica';
    edit.addEventListener('click',()=>beginEdit(item));
    const remove=document.createElement('button'); remove.type='button'; remove.className='danger';
    remove.innerHTML='<i class="fas fa-trash"></i> Elimina';
    remove.addEventListener('click',async()=>{
      if(!confirm('Eliminare dal calendario “'+item.title+'”?'))return;
      remove.disabled=true;
      const {error}=await db.from('v2_race_calendar').delete().eq('id',item.id);
      if(error){remove.disabled=false;toast('Non è stato possibile eliminare: '+error.message);return}
      if(editingId===item.id)resetForm();
      toast('Appuntamento eliminato dal calendario');
      loadCalendar();
    });
    actions.append(edit,remove);
    row.append(info,actions);
    host.append(row);
  });
}

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
  const row={
    title,
    start_date:startDate,
    end_date:endDate||null,
    event_type:String(values.get('event_type')||'Gara'),
    location:String(values.get('location')||'').trim()||null,
    notes:String(values.get('notes')||'').trim()||null
  };
  const {error}=editingId
    ? await db.from('v2_race_calendar').update(row).eq('id',editingId)
    : await db.from('v2_race_calendar').insert(row);
  submit.disabled=false;
  if(error){toast('Non è stato possibile salvare: '+error.message);return}
  const changed=Boolean(editingId);
  resetForm();
  toast(changed?'Appuntamento aggiornato':'Appuntamento aggiunto al calendario');
  loadCalendar();
});

$('adminRaceCalendarCancel')?.addEventListener('click',resetForm);
document.querySelector('[data-tab="calendar"]')?.addEventListener('click',loadCalendar);
