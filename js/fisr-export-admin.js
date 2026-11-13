import {db} from './supabase.js';
const $=id=>document.getElementById(id);
const map={GI:'GIOVANISSIMI',ES:'ESORDIENTI',R1:'R12',RA:'RAGAZZI',AL:'ALLIEVI',JU:'JUNIOR',SE:'SENIOR'};
const norm=x=>String(x||'').trim().toUpperCase();
const section=document.createElement('section');section.className='fisr-athlete-proves';
section.innerHTML='<h3>Iscrizioni su FISR</h3><p>Prepara il confronto con la pagina FISR. Potrai controllare le differenze prima di applicare le spunte.</p><button type="button" id="fisrExportBtn">Prepara iscrizioni FISR</button><p id="fisrExportStatus" role="status"></p>';
$('tab-registrations')?.append(section);
const status=$('fisrExportStatus');
$('fisrExportBtn').onclick=async()=>{const btn=$('fisrExportBtn');btn.disabled=true;status.textContent='Lettura iscritti e prove…';try{
 const eventId=$('registrationsEventSelect')?.value||$('eventSelect')?.value;if(!eventId)throw Error('Seleziona una gara.');
 const [{data:cfg,error:e1},{data:regs,error:e2}]=await Promise.all([
  db.from('v2_event_config').select('key,value').eq('event_id',eventId).in('key',['fisr_trophy_id','fisr_races','fisr_athlete_proves']),
  db.from('v2_event_registrations').select('athlete_id,status,category_snapshot,category_override,athlete:v2_athletes(full_name,gender,category,membership_number)').eq('event_id',eventId)]);
 if(e1||e2)throw Error((e1||e2).message);const c=Object.fromEntries((cfg||[]).map(x=>[x.key,x.value]));const id=String(c.fisr_trophy_id||'');if(!/^\d{1,12}$/.test(id)||!Array.isArray(c.fisr_races)||!c.fisr_races.length)throw Error('Questa gara non contiene i dati FISR importati.');
 const saved=c.fisr_athlete_proves||{};const athletes=(regs||[]).filter(r=>r.status==='yes'||r.status==='no').map(r=>{const a=r.athlete||{},category=norm(r.category_override||r.category_snapshot||a.category),gender=norm(a.gender);const races=c.fisr_races.filter(g=>map[norm(g.categoria)]===category&&norm(g.sesso)===gender);const chosen=Array.isArray(saved[r.athlete_id])?saved[r.athlete_id]:null;return {name:String(a.full_name||''),membership:String(a.membership_number||'').trim(),category,gender,races:races.filter(g=>r.status==='yes'&&(!chosen||chosen.includes(`${category}|${String(g.descrizione||'').trim().toLocaleLowerCase('it')}`))).map(g=>({id:String(g.id_gara),name:String(g.descrizione||'')})),available:races.map(g=>String(g.id_gara))}});
 if(!athletes.length)throw Error('Nessuna risposta di partecipazione disponibile per questa gara.');
 const request=crypto.randomUUID();window.postMessage({source:'juvenilia-admin',type:'FISR_PREPARE',request,payload:{id,athletes}},location.origin);
 await new Promise((resolve,reject)=>{const listener=e=>{if(e.source!==window||e.origin!==location.origin||e.data?.source!=='juvenilia-extension'||e.data.request!==request)return;window.removeEventListener('message',listener);clearTimeout(timer);e.data.ok?resolve():reject(Error(e.data.error||'Trasferimento non riuscito.'))};window.addEventListener('message',listener);const timer=setTimeout(()=>{window.removeEventListener('message',listener);reject(Error('Estensione non rilevata. Installa la nuova versione e ricarica questa pagina.'))},8000)});
 status.textContent='Pagina FISR aperta. Accedi se necessario e controlla il confronto.';
 }catch(e){status.textContent=e.message}finally{btn.disabled=false}};
