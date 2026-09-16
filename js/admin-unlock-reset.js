import { db } from './supabase.js';
import { toast } from './ui.js';

const $=id=>document.getElementById(id);
const unlockFields={is_locked:false};
const resetFields={status:'pending',companion_name:null,responded_at:null,race_days:[],race_day:null,category_override:null};
let busy=false;

async function registrationForRow(row){
  const eventId=$('eventSelect')?.value;
  const athleteName=row?.children?.[1]?.textContent?.trim();
  if(!eventId||!athleteName)return null;
  const {data,error}=await db.from('v2_event_registrations')
    .select('id,athlete:v2_athletes(full_name)')
    .eq('event_id',eventId);
  if(error){toast(error.message);return null}
  return (data||[]).find(r=>r.athlete?.full_name===athleteName)||null;
}

async function unlockOne(row){
  busy=true;
  try{
    const reg=await registrationForRow(row);
    if(!reg)return toast('Iscrizione atleta non trovata');
    const {error}=await db.from('v2_event_registrations').update(unlockFields).eq('id',reg.id);
    if(error)return toast(error.message);
    toast('Atleta sbloccato');
    setTimeout(()=>location.reload(),180);
  }finally{busy=false}
}

async function resetOne(row){
  busy=true;
  try{
    const reg=await registrationForRow(row);
    if(!reg)return toast('Iscrizione atleta non trovata');
    const {error}=await db.from('v2_event_registrations').update(resetFields).eq('id',reg.id);
    if(error)return toast(error.message);
    toast('Iscrizione resettata: cancellati anche i giorni scelti');
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
    const {error:updateError}=await db.from('v2_event_registrations').update(unlockFields).in('id',ids);
    if(updateError)return toast(updateError.message);
    toast(`${ids.length} atleti sbloccati`);
    setTimeout(()=>location.reload(),180);
  }finally{busy=false}
}

async function unlockAll(){
  const eventId=$('eventSelect')?.value;
  if(!eventId)return toast('Seleziona una gara');
  busy=true;
  try{
    const {error}=await db.from('v2_event_registrations').update(unlockFields).eq('event_id',eventId);
    if(error)return toast(error.message);
    toast('Tutti gli atleti sono stati sbloccati');
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
    e.preventDefault();e.stopImmediatePropagation();unlockOne(btn.closest('tr'));return;
  }
  if(btn.closest('#registrationsBody')&&btn.textContent.trim()==='Reset'){
    e.preventDefault();e.stopImmediatePropagation();resetOne(btn.closest('tr'));
  }
},true);
