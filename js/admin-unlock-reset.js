import { db } from './supabase.js';
import { toast } from './ui.js';

const $=id=>document.getElementById(id);
const resetFields={is_locked:false,status:'pending',responded_at:null,race_days:[],race_day:null};
let busy=false;

async function unlockOne(row){
  const eventId=$('eventSelect')?.value;
  const athleteName=row?.children?.[1]?.textContent?.trim();
  if(!eventId||!athleteName)return;
  busy=true;
  try{
    const {data,error}=await db.from('v2_event_registrations')
      .select('id,athlete:v2_athletes(full_name)')
      .eq('event_id',eventId);
    if(error)return toast(error.message);
    const reg=(data||[]).find(r=>r.athlete?.full_name===athleteName);
    if(!reg)return toast('Iscrizione atleta non trovata');
    const {error:updateError}=await db.from('v2_event_registrations').update(resetFields).eq('id',reg.id);
    if(updateError)return toast(updateError.message);
    toast('Atleta sbloccato: giorni e risposta resettati');
    setTimeout(()=>location.reload(),180);
  }finally{busy=false}
}

async function unlockSelected(){
  const eventId=$('eventSelect')?.value;
  const rows=[...document.querySelectorAll('#registrationsBody tr')];
  const names=rows.filter(r=>r.querySelector('.registration-select:checked')).map(r=>r.children?.[1]?.textContent?.trim()).filter(Boolean);
  if(!eventId||!names.length)return toast('Seleziona almeno un atleta');
  busy=true;
  try{
    const {data,error}=await db.from('v2_event_registrations').select('id,athlete:v2_athletes(full_name)').eq('event_id',eventId);
    if(error)return toast(error.message);
    const ids=(data||[]).filter(r=>names.includes(r.athlete?.full_name)).map(r=>r.id);
    if(!ids.length)return toast('Nessuna iscrizione trovata');
    const {error:updateError}=await db.from('v2_event_registrations').update(resetFields).in('id',ids);
    if(updateError)return toast(updateError.message);
    toast(`${ids.length} atleti sbloccati: giorni e risposte resettati`);
    setTimeout(()=>location.reload(),180);
  }finally{busy=false}
}

async function unlockAll(){
  const eventId=$('eventSelect')?.value;
  if(!eventId)return toast('Seleziona una gara');
  busy=true;
  try{
    const {error}=await db.from('v2_event_registrations').update(resetFields).eq('event_id',eventId);
    if(error)return toast(error.message);
    toast('Tutti sbloccati: giorni e risposte resettati');
    setTimeout(()=>location.reload(),180);
  }finally{busy=false}
}

document.addEventListener('click',e=>{
  if(busy)return;
  const btn=e.target.closest('button');
  if(!btn)return;
  if(btn.id==='unlockSelectedBtn'){
    e.preventDefault();e.stopImmediatePropagation();unlockSelected();return;
  }
  if(btn.id==='unlockAllBtn'){
    e.preventDefault();e.stopImmediatePropagation();unlockAll();return;
  }
  if(btn.closest('#registrationsBody')&&btn.textContent.trim()==='Sblocca'){
    e.preventDefault();e.stopImmediatePropagation();unlockOne(btn.closest('tr'));
  }
},true);
