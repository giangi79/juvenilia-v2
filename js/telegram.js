import './event-categories.js?v=defaults-3';
import './race-days-admin.js?v=giorni-gara-1';
import './event-header-admin.js?v=1';
import './admin-mobile-cards.js?v=1';
import './admin-unlock-reset.js?v=5';
import { db } from './supabase.js';
import { toast } from './ui.js';

const $=id=>document.getElementById(id);
const KEYS=['telegram_status_enabled','telegram_deadline_enabled'];

function selectedEventId(){return $('exportEventSelect')?.value || $('eventSelect')?.value || null;}
function currentEvent(){const id=selectedEventId();return window.__juveniliaEvents?.find?.(e=>e.id===id)||null;}
async function configMap(eventId){const {data,error}=await db.from('v2_event_config').select('key,value').eq('event_id',eventId).in('key',KEYS);if(error)throw error;return Object.fromEntries((data||[]).map(r=>[r.key,r.value]));}
async function loadTelegramSettings(){const id=selectedEventId();if(!id)return;try{const cfg=await configMap(id);if($('telegramStatusEnabled'))$('telegramStatusEnabled').checked=cfg.telegram_status_enabled!==false;if($('telegramDeadlineEnabled'))$('telegramDeadlineEnabled').checked=cfg.telegram_deadline_enabled!==false;}catch(e){console.warn(e)}}
async function saveTelegramSettings(){const id=selectedEventId();if(!id)return toast('Seleziona una gara');const rows=[{event_id:id,key:'telegram_status_enabled',value:$('telegramStatusEnabled')?.checked!==false,is_public:false},{event_id:id,key:'telegram_deadline_enabled',value:$('telegramDeadlineEnabled')?.checked!==false,is_public:false}];const {error}=await db.from('v2_event_config').upsert(rows,{onConflict:'event_id,key'});if(error)return toast(error.message);toast('Impostazioni Telegram salvate');}
async function callTelegram(body){const {data:{session}}=await db.auth.getSession();if(!session)return toast('Sessione admin non valida');const url='https://jnfnfszekfstuoiemkgf.supabase.co/functions/v1/telegram-dispatch';const r=await fetch(url,{method:'POST',headers:{'Content-Type':'application/json','Authorization':`Bearer ${session.access_token}`},body:JSON.stringify(body)});const text=await r.text();let out;try{out=JSON.parse(text)}catch{out={error:text}}if(!r.ok||out?.error)throw new Error(out?.error||`HTTP ${r.status}`);return out;}
async function telegramAction(action){const eventId=selectedEventId();if(!eventId)return toast('Seleziona una gara');const result=$('telegramResult');if(result)result.textContent='Invio in corso...';try{const out=await callTelegram({action,event_id:eventId});if(result)result.textContent=out?.message||'Operazione completata';toast(out?.message||'Operazione Telegram completata')}catch(e){if(result)result.textContent=e.message;toast(e.message)}}
function bind(){if($('telegramSaveSettingsBtn'))$('telegramSaveSettingsBtn').onclick=saveTelegramSettings;if($('telegramTestBtn'))$('telegramTestBtn').onclick=()=>telegramAction('test');if($('telegramSummaryBtn'))$('telegramSummaryBtn').onclick=()=>telegramAction('summary');if($('telegramResetFlagsBtn'))$('telegramResetFlagsBtn').onclick=()=>telegramAction('reset_deadline_flags');$('exportEventSelect')?.addEventListener('change',loadTelegramSettings);$('eventSelect')?.addEventListener('change',loadTelegramSettings);loadTelegramSettings();}
setTimeout(bind,400);
