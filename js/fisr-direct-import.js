import { db } from './supabase.js';
const KEY='juvenilia_fisr_pending_v2';
const CATEGORY={GI:'GIOVANISSIMI',ES:'ESORDIENTI',R1:'R12',RA:'RAGAZZI',AL:'ALLIEVI',JU:'JUNIOR',SE:'SENIOR'};
const $=id=>document.getElementById(id);
const el=(tag,txt,cls)=>{const e=document.createElement(tag);if(txt!==undefined)e.textContent=txt;if(cls)e.className=cls;return e};
const groupRaces=races=>{
 const groups=new Map();
 for(const r of races){const cat=CATEGORY[String(r.categoria).toUpperCase()];if(!cat)continue;
  const name=String(r.descrizione||'').trim();const key=`${cat}|${name.toLocaleLowerCase('it')}`;
  if(!groups.has(key))groups.set(key,{key,category:cat,name,ids:{}});
  groups.get(key).ids[r.sesso]=String(r.id_gara);
 }
 return [...groups.values()];
};
function decode(){
 const hash=location.hash.slice(1);
 if(!hash.startsWith('fisr-import='))return null;
 const raw=atob(decodeURIComponent(hash.slice('fisr-import='.length)));
 const value=JSON.parse(new TextDecoder().decode(Uint8Array.from(raw,c=>c.charCodeAt(0))));
 if(value.v!==1||!/^\d{1,12}$/.test(String(value.id_fisr))||!Array.isArray(value.gare)||!value.gare.length||value.gare.length>500)throw Error('Dati FISR non validi');
 if(!value.gare.every(g=>/^\d{1,12}$/.test(String(g.id_gara))&&['M','F'].includes(g.sesso)&&CATEGORY[String(g.categoria).toUpperCase()]&&String(g.descrizione||'').length<150))throw Error('Elenco prove non valido');
 return value;
}
let lastHandledHash='';
let previewPending=false;
function readIncoming(){
 const hash=location.hash;
 if(hash.startsWith('#fisr-import=') && hash!==lastHandledHash){
  lastHandledHash=hash;
  try{
   const data=decode();
   if(!data)return;
   sessionStorage.setItem(KEY,JSON.stringify(data));
   history.replaceState(null,'',location.pathname+location.search);
   document.getElementById('fisrDirectPanel')?.remove();
   renderPreview(data);
  }catch(e){
   lastHandledHash='';
   console.error('Importazione FISR: dati non leggibili',e);
   showError(e);
  }
 }else if(!hash.startsWith('#fisr-import=') && !previewPending && !document.getElementById('fisrDirectPanel')){
  try{const saved=JSON.parse(sessionStorage.getItem(KEY)||'null');if(saved)renderPreview(saved)}catch(e){console.error('Anteprima FISR',e)}
 }
}
function showError(e){
 let warning=document.getElementById('fisrImportError');
 if(!warning){warning=document.createElement('div');warning.id='fisrImportError';warning.style.cssText='position:fixed;top:12px;left:12px;right:12px;z-index:99999;padding:15px;border-radius:10px;background:#842c30;color:white;font-weight:bold';document.body.append(warning)}
 warning.textContent='Importazione FISR non riuscita: '+e.message;
}
function renderPreview(data){
 if(previewPending)return;
 previewPending=true;
 const groups=groupRaces(data.gare);
 const panel=el('section',undefined,'card fisr-import-card');panel.id='fisrDirectPanel';
 const heading=el('h2','Importazione FISR · Anteprima');
 const info=el('p',`${data.nome} · ID FISR ${data.id_fisr} · ${groups.length} prove (${data.gare.length} ID FISR)`);
 const fields=data.campi_calendario||[];
 const detail=el('p',`Data: ${fields[0]||'da verificare'} · Località: ${fields[2]||'da verificare'} · Organizzatore: ${fields[3]||'—'}`,'muted');
 const categories=el('div',undefined,'fisr-category-list');
 for(const category of [...new Set(groups.map(g=>g.category))]){
  const block=el('details',undefined,'fisr-category');const summary=el('summary',`${category} · ${groups.filter(g=>g.category===category).length} prove`);block.append(summary);
  for(const g of groups.filter(g=>g.category===category))block.append(el('div',g.name,'fisr-race-line'));
  categories.append(block);
 }
 const actions=el('div',undefined,'actions');const prepare=el('button','Prepara gara nel gestionale');const cancel=el('button','Annulla','secondary');
 const status=el('p','Le prove saranno tutte confermate per impostazione predefinita. Solo l’amministratore potrà modificarle.','muted');
 actions.append(prepare,cancel);panel.append(heading,info,detail,categories,actions,status);
 const clear=()=>{sessionStorage.removeItem(KEY);panel.remove();previewPending=false};cancel.onclick=clear;
 const parseDate=value=>{const m=String(value||'').match(/(\d{1,2})\/(\d{1,2})(?:\/(\d{2,4}))?/);if(!m)return '';const y=m[3]?(m[3].length===2?2000+Number(m[3]):Number(m[3])):new Date().getFullYear();const d=new Date(y,Number(m[2])-1,Number(m[1]));return d.getFullYear()===y&&d.getMonth()===Number(m[2])-1&&d.getDate()===Number(m[1])?`${y}-${m[2].padStart(2,'0')}-${m[1].padStart(2,'0')}`:''};
 prepare.onclick=async()=>{
  prepare.disabled=true;status.textContent='Controllo dei trofei già importati…';
  try{
   const {data:existing,error}=await db.from('v2_event_config').select('event_id,value').eq('key','fisr_trophy_id');if(error)throw error;
   const duplicate=(existing||[]).find(row=>String(row.value)===String(data.id_fisr));
   if(duplicate){status.textContent='Questo trofeo FISR risulta già importato nel gestionale. Non verrà duplicato.';return}
   const start=parseDate(fields[0]);
   const deadline=parseDate(fields[4]);
   const draft={title:data.nome,start_date:start,end_date:'',location:fields[2]||'',categories:[...new Set(groups.map(g=>g.category))],notes:`Fonte FISR · Trofeo ${data.id_fisr}\nOrganizzatore: ${fields[3]||'—'}\nScadenza iscrizioni FISR: ${fields[4]||'—'}\nTermine depennamenti: ${fields[5]||'—'}`,fisr:{id_fisr:String(data.id_fisr),gare:data.gare,groups},fisr_deadline:deadline};
   document.dispatchEvent(new CustomEvent('juvenilia:create-from-calendar',{detail:draft}));
   const tab=$('tab-event');if(tab){document.querySelectorAll('.tab').forEach(t=>t.classList.add('hidden'));tab.classList.remove('hidden')}
   clear();
  }catch(e){status.textContent='Impossibile controllare i duplicati: '+e.message;prepare.disabled=false}
 };
 const mount=()=>{const app=$('adminApp');if(app&&!app.classList.contains('hidden')){app.prepend(panel);return true}return false};
 if(!mount()){const observer=new MutationObserver(()=>{if(mount())observer.disconnect()});observer.observe(document.body,{subtree:true,attributes:true,attributeFilter:['class']})}
}

// L'estensione può aggiungere il frammento FISR dopo l'avvio del modulo.
window.addEventListener('hashchange',readIncoming);
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',readIncoming,{once:true});
else readIncoming();
let checks=0;const incomingWatcher=setInterval(()=>{readIncoming();if(++checks>=30)clearInterval(incomingWatcher)},1000);
