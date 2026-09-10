import { db } from './supabase.js';
import { toast } from './ui.js';

const $=id=>document.getElementById(id);
const KEYS=['telegram_status_enabled','telegram_deadline_enabled'];

function selectedEventId(){
  return $('exportEventSelect')?.value || $('eventSelect')?.value || null;
}

function setResult(text,isError=false){
  const el=$('telegramResult');
  if(!el)return;
  el.textContent=text||'';
  el.classList.toggle('error',!!isError);
}

async function loadTelegramSettings(){
  const eventId=selectedEventId();
  if(!eventId)return;

  const {data,error}=await db
    .from('v2_event_config')
    .select('key,value')
    .eq('event_id',eventId)
    .in('key',KEYS);

  if(error){
    setResult('Errore caricamento impostazioni Telegram: '+error.message,true);
    return;
  }

  const map=Object.fromEntries((data||[]).map(r=>[r.key,r.value]));
  $('telegramStatusEnabled').checked=map.telegram_status_enabled===true;
  $('telegramDeadlineEnabled').checked=map.telegram_deadline_enabled===true;
  setResult('');
}

async function saveTelegramSettings(){
  const eventId=selectedEventId();
  if(!eventId)return toast('Seleziona una gara');

  const rows=[
    {
      event_id:eventId,
      key:'telegram_status_enabled',
      value:$('telegramStatusEnabled').checked,
      is_public:false
    },
    {
      event_id:eventId,
      key:'telegram_deadline_enabled',
      value:$('telegramDeadlineEnabled').checked,
      is_public:false
    }
  ];

  const {error}=await db.from('v2_event_config').upsert(rows,{onConflict:'event_id,key'});
  if(error){
    setResult('Errore salvataggio: '+error.message,true);
    return toast(error.message);
  }
  setResult('Impostazioni Telegram salvate.');
  toast('Impostazioni Telegram salvate');
}

async function invokeTelegram(action){
  const eventId=selectedEventId();
  if((action==='manual_summary')&&!eventId){
    toast('Seleziona una gara');
    return null;
  }

  setResult('Invio in corso…');
  const {data,error}=await db.functions.invoke('telegram-dispatch',{
    body:{action,event_id:eventId}
  });

  if(error){
    const message=error.message||'Errore Edge Function';
    setResult(message,true);
    toast(message);
    return null;
  }
  if(data?.error){
    setResult(data.error,true);
    toast(data.error);
    return null;
  }

  const message=data?.message || 'Operazione Telegram completata.';
  setResult(message);
  toast(message);
  return data;
}

async function resetDeadlineFlags(){
  const eventId=selectedEventId();
  if(!eventId)return toast('Seleziona una gara');
  if(!confirm('Azzera i flag Telegram delle scadenze per questa gara? Le scadenze potranno essere inviate nuovamente dal sistema automatico.'))return;

  const {data,error}=await db.rpc('v2_reset_telegram_deadline_flags',{p_event_id:eventId});
  if(error){
    setResult('Errore reset flag: '+error.message,true);
    return toast(error.message);
  }
  setResult(`Flag scadenze azzerati (${data??0} elementi).`);
  toast('Flag Telegram scadenze azzerati');
}

$('telegramSaveSettingsBtn')?.addEventListener('click',saveTelegramSettings);
$('telegramTestBtn')?.addEventListener('click',()=>invokeTelegram('test'));
$('telegramSummaryBtn')?.addEventListener('click',()=>invokeTelegram('manual_summary'));
$('telegramResetFlagsBtn')?.addEventListener('click',resetDeadlineFlags);

$('exportEventSelect')?.addEventListener('change',()=>setTimeout(loadTelegramSettings,50));
document.addEventListener('juvenilia:event-changed',()=>setTimeout(loadTelegramSettings,80));
document.querySelector('[data-tab="exports"]')?.addEventListener('click',()=>setTimeout(loadTelegramSettings,50));

setTimeout(loadTelegramSettings,1000);
