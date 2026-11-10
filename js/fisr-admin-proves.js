import {db} from './supabase.js';
const $=id=>document.getElementById(id);
const CODES={GI:'GIOVANISSIMI',ES:'ESORDIENTI',R1:'R12',RA:'RAGAZZI',AL:'ALLIEVI',JU:'JUNIOR',SE:'SENIOR'};
const normalize=v=>String(v||'').trim().toUpperCase();
const groupsFromRaces=races=>{const groups=new Map();for(const r of races||[]){const category=CODES[normalize(r.categoria)];if(!category)continue;const name=String(r.descrizione||'').trim();const key=`${category}|${name.toLocaleLowerCase('it')}`;if(!groups.has(key))groups.set(key,{key,category,name});}return [...groups.values()]};
const create=(tag,content)=>{const n=document.createElement(tag);if(content!==undefined)n.textContent=content;return n};
let request=0;
async function refresh(){
 const eventId=$('eventSelect')?.value;const token=++request;let container=$('fisrAthleteProves');
 if(!container){container=create('section');container.id='fisrAthleteProves';container.className='fisr-athlete-proves';$('tab-registrations')?.append(container)}
 if(!container)return;
 container.replaceChildren();if(!eventId)return;
 const [{data:config,error:ce},{data:registrations,error:re}]=await Promise.all([
  db.from('v2_event_config').select('key,value').eq('event_id',eventId).in('key',['fisr_races','fisr_athlete_proves']),
  db.from('v2_event_registrations').select('athlete_id,status,category_snapshot,category_override,athlete:v2_athletes(full_name,category)').eq('event_id',eventId)
 ]);
 if(token!==request)return;
 if(ce||re){container.textContent='Impossibile leggere le prove FISR: '+(ce||re).message;return}
 const cfg=Object.fromEntries((config||[]).map(x=>[x.key,x.value]));const groups=groupsFromRaces(cfg.fisr_races);
 if(!groups.length)return;
 const saved=cfg.fisr_athlete_proves&&typeof cfg.fisr_athlete_proves==='object'?cfg.fisr_athlete_proves:{};
 const title=create('h3','Prove FISR · Gestione amministratore');container.append(title);
 container.append(create('p','Le prove sono tutte confermate per impostazione predefinita. Deseleziona soltanto quelle che l’atleta non disputerà.'));
 const eligible=(registrations||[]).filter(r=>r.status==='yes').sort((a,b)=>String(a.athlete?.full_name||'').localeCompare(String(b.athlete?.full_name||''),'it'));
 if(!eligible.length){container.append(create('p','Nessun atleta ha ancora confermato la partecipazione.'));return}
 for(const r of eligible){
  const category=normalize(r.category_override||r.category_snapshot||r.athlete?.category);const options=groups.filter(g=>g.category===category);
  if(!options.length)continue;
  const details=create('details');details.className='fisr-athlete-row';const summary=create('summary',`${r.athlete?.full_name||'Atleta'} · ${category}`);details.append(summary);
  const grid=create('div');grid.className='fisr-proof-grid';const selected=Array.isArray(saved[r.athlete_id])?saved[r.athlete_id]:options.map(g=>g.key);
  for(const g of options){const label=create('label');const cb=create('input');cb.type='checkbox';cb.checked=selected.includes(g.key);
   cb.onchange=async()=>{const previous=Array.isArray(saved[r.athlete_id])?[...saved[r.athlete_id]]:null;
    const current=Array.isArray(saved[r.athlete_id])?[...saved[r.athlete_id]]:options.map(x=>x.key);
    saved[r.athlete_id]=cb.checked?[...new Set([...current,g.key])]:current.filter(k=>k!==g.key);
    cb.disabled=true;
    const {error}=await db.from('v2_event_config').upsert({event_id:eventId,key:'fisr_athlete_proves',value:saved,is_public:true},{onConflict:'event_id,key'});
    cb.disabled=false;
    if(error){cb.checked=!cb.checked;if(previous===null)delete saved[r.athlete_id];else saved[r.athlete_id]=previous;alert('Salvataggio prove non riuscito: '+error.message)}
   };
   label.append(cb,create('span',g.name));grid.append(label)
  }
  details.append(grid);container.append(details)
 }
}
$('eventSelect')?.addEventListener('change',()=>setTimeout(refresh,250));
$('registrationsEventSelect')?.addEventListener('change',()=>setTimeout(refresh,250));
document.addEventListener('juvenilia:event-changed',()=>setTimeout(refresh,400));
document.addEventListener('juvenilia:event-save-complete',()=>setTimeout(refresh,500));
db.auth.onAuthStateChange((event,session)=>{if(session&&(event==='SIGNED_IN'||event==='INITIAL_SESSION'))setTimeout(refresh,900)});
