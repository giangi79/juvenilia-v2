import { db } from './supabase.js';
import { WHATSAPP_NUMBER } from './config.js';
import { toast, formatDate } from './ui.js';

let seasons=[],selectedAthleteSeasonId='',events=[],currentEvent=null,athletes=[],registrations=[],timers=[],configRows=[];
let selectedRegistrationIds=new Set();
let registrationsSort=localStorage.getItem('juvenilia_registrations_sort')||'name';

const $=id=>document.getElementById(id);
const clean=v=>String(v??'').trim();
const POSTER_BUCKET='juvenilia-locandine';
let posterPreviewUrl=null,posterBusy=false;
function setPosterBusy(busy){posterBusy=busy;$('saveEventPosterBtn').disabled=busy||!currentEvent;$('removeEventPosterBtn').disabled=busy;$('eventPosterInput').disabled=busy||!currentEvent}
function renderAdminPoster(){
  if(posterPreviewUrl){URL.revokeObjectURL(posterPreviewUrl);posterPreviewUrl=null}
  $('eventPosterInput').value='';
  const path=currentEvent?.poster_path;
  const preview=$('eventPosterPreview');
  preview.classList.toggle('hidden',!path);
  preview.src=path?db.storage.from(POSTER_BUCKET).getPublicUrl(path).data.publicUrl:'';
  $('removeEventPosterBtn').classList.toggle('hidden',!path);
  $('eventPosterStatus').textContent=currentEvent?(path?'Locandina caricata. Puoi sostituirla o rimuoverla.':'Nessuna locandina caricata.'):'Salva prima la gara per aggiungere una locandina.';
  setPosterBusy(posterBusy);
}
$('eventPosterInput').onchange=()=>{
  if(posterPreviewUrl)URL.revokeObjectURL(posterPreviewUrl);
  posterPreviewUrl=null;
  const file=$('eventPosterInput').files?.[0];
  if(!file){renderAdminPoster();return}
  posterPreviewUrl=URL.createObjectURL(file);
  $('eventPosterPreview').src=posterPreviewUrl;
  $('eventPosterPreview').classList.remove('hidden');
  $('eventPosterStatus').textContent=`Pronta da caricare: ${file.name}`;
};
$('saveEventPosterBtn').onclick=async()=>{
  const selected=currentEvent,file=$('eventPosterInput').files?.[0];
  if(!selected)return toast('Salva prima la gara');
  if(!file)return toast('Seleziona prima un’immagine');
  const extension={'image/jpeg':'jpg','image/png':'png','image/webp':'webp'}[file.type];
  if(!extension||file.size>8388608||!file.size)return toast('Scegli un JPG, PNG o WebP fino a 8 MB');
  setPosterBusy(true);
  const path=`${selected.id}/${crypto.randomUUID()}.${extension}`;
  const previous=selected.poster_path;
  const storage=db.storage.from(POSTER_BUCKET);
  try{
    const {error:uploadError}=await storage.upload(path,file,{contentType:file.type,upsert:false});
    if(uploadError)throw uploadError;
    const {error:updateError}=await db.from('v2_events').update({poster_path:path}).eq('id',selected.id);
    if(updateError){await storage.remove([path]);throw updateError}
    selected.poster_path=path;
    if(previous)await storage.remove([previous]);
    if(currentEvent?.id===selected.id){renderAdminPoster();toast('Locandina caricata')}
  }catch(error){toast('Errore locandina: '+error.message)}finally{setPosterBusy(false)}
};
$('removeEventPosterBtn').onclick=async()=>{
  const selected=currentEvent,path=selected?.poster_path;
  if(!path)return;
  setPosterBusy(true);
  try{
    const {error}=await db.from('v2_events').update({poster_path:null}).eq('id',selected.id);
    if(error)throw error;
    selected.poster_path=null;
    await db.storage.from(POSTER_BUCKET).remove([path]);
    if(currentEvent?.id===selected.id){renderAdminPoster();toast('Locandina rimossa')}
  }catch(error){toast('Errore locandina: '+error.message)}finally{setPosterBusy(false)}
};

function slugify(value){
  return clean(value)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g,'')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g,'-')
    .replace(/^-+|-+$/g,'')
    .replace(/-{2,}/g,'-');
}
function localDate(v){if(!v)return'';const d=new Date(v);return new Date(d.getTime()-d.getTimezoneOffset()*60000).toISOString().slice(0,16)}
const standardCategories=['GIOVANISSIMI','ESORDIENTI','R12','RAGAZZI','ALLIEVI','JUNIOR','SENIOR'];
function allAthleteCategories(){
  const found=[...new Set(athletes.map(a=>clean(a.category).toUpperCase()).filter(Boolean))];
  const extras=found.filter(c=>!standardCategories.includes(c)).sort((a,b)=>a.localeCompare(b,'it'));
  return [...standardCategories,...extras];
}
function categoryOrderValue(cat){
  const i=standardCategories.indexOf(clean(cat).toUpperCase());
  return i<0?999:i;
}
function sanitizeRichHtml(html){
  const tpl=document.createElement('template'); tpl.innerHTML=String(html||'');
  const allowed=new Set(['B','STRONG','I','EM','U','BR','P','DIV','UL','OL','LI','A','SPAN']);
  const walk=node=>{
    [...node.childNodes].forEach(child=>{
      if(child.nodeType===Node.ELEMENT_NODE){
        if(!allowed.has(child.tagName)){child.replaceWith(...child.childNodes);return}
        [...child.attributes].forEach(attr=>{
          const n=attr.name.toLowerCase();
          if(n==='href'&&child.tagName==='A'){
            try{const u=new URL(attr.value,location.href);if(!['http:','https:','mailto:'].includes(u.protocol))child.removeAttribute(attr.name)}
            catch{child.removeAttribute(attr.name)}
          }else if(n==='style'){
            const keep=[];
            attr.value.split(';').forEach(part=>{
              const [prop,val]=part.split(':').map(x=>x?.trim());
              if(['color','background-color'].includes((prop||'').toLowerCase())&&/^#[0-9a-f]{3,8}$/i.test(val||''))keep.push(`${prop}:${val}`);
            });
            if(keep.length)child.setAttribute('style',keep.join(';'));else child.removeAttribute('style');
          }else if(!(child.tagName==='A'&&['href','target','rel'].includes(n)))child.removeAttribute(attr.name);
        });
        if(child.tagName==='A'){child.setAttribute('target','_blank');child.setAttribute('rel','noopener noreferrer')}
        walk(child);
      }else if(child.nodeType!==Node.TEXT_NODE)child.remove();
    });
  };
  walk(tpl.content); return tpl.innerHTML;
}

async function isAdmin(){
  const {data:{session}}=await db.auth.getSession(); if(!session)return false;
  const {data,error}=await db.rpc('v2_is_admin'); return !error&&data===true;
}
async function boot(){
  if(await isAdmin()){
    showAdmin();
    await loadAll();
    await refreshTimerSetup();
  }else{
    showLogin();
  }
}
function showLogin(){$('loginCard').classList.remove('hidden');$('adminApp').classList.add('hidden')}
function showAdmin(){$('loginCard').classList.add('hidden');$('adminApp').classList.remove('hidden');db.auth.getUser().then(({data})=>$('adminIdentity').textContent=data.user?.email||'Admin')}
$('loginForm').onsubmit=async e=>{e.preventDefault();$('loginError').textContent='';const {error}=await db.auth.signInWithPassword({email:$('email').value.trim(),password:$('password').value});if(error){$('loginError').textContent=error.message;return}if(!(await isAdmin())){await db.auth.signOut();$('loginError').textContent='Utente non autorizzato come amministratore.';return}showAdmin();await loadAll();await refreshTimerSetup()};
$('logoutBtn').onclick=async()=>{await db.auth.signOut();location.reload()};
function openAdminTab(name){
  document.querySelectorAll('#tabs button').forEach(x=>x.classList.toggle('active',x.dataset.tab===name));
  document.querySelectorAll('.tab').forEach(t=>t.classList.add('hidden'));
  const target=$('tab-'+name);
  if(target)target.classList.remove('hidden');
  if(name==='settings')openSettingsPanel('config');
}
document.querySelectorAll('#tabs button').forEach(b=>b.onclick=()=>openAdminTab(b.dataset.tab));

function openSettingsPanel(name){
  document.querySelectorAll('.settings-choice').forEach(b=>b.classList.toggle('active',b.dataset.settingsPanel===name));
  document.querySelectorAll('.settings-panel').forEach(p=>p.classList.add('hidden'));
  const panel=document.querySelector(`.settings-panel[data-settings-section="${name}"]`);
  const host=$('settingsPanelHost');
  if(panel&&host){
    host.append(panel);
    panel.classList.remove('hidden');
  }
  if(name==='timers'){
    setTimeout(()=>refreshTimerSetup(),0);
  }
}
document.querySelectorAll('.settings-choice').forEach(b=>b.onclick=()=>openSettingsPanel(b.dataset.settingsPanel));

async function loadAll(){
  await loadSeasons();
  await loadEvents();
  await Promise.all([loadAthletes(),loadRegistrations(),loadTimers(),loadConfig()]);renderStats();

  populateTimerEventSelect();
  renderTimerCategoryChecks();
}
function currentSeason(){return seasons.find(s=>s.is_current)||seasons[0]||null}
function selectedAthleteSeason(){return seasons.find(s=>s.id===selectedAthleteSeasonId)||currentSeason()}
function formatShortDate(value){if(!value)return'—';return new Date(`${value}T12:00:00`).toLocaleDateString('it-IT')}
function populateSeasonSelect(select,selectedId,{includeEmpty=false}={}){
  if(!select)return;select.replaceChildren();
  if(includeEmpty)select.append(new Option('Nessuna — stagione vuota',''));
  seasons.forEach(s=>select.append(new Option(`${s.name}${s.is_current?' — ATTUALE':''}`,s.id)));
  if(selectedId&&seasons.some(s=>s.id===selectedId))select.value=selectedId;
}
function suggestNextSeason(){
  if($('newSeasonName')?.value)return;
  const base=seasons[0]?.name||currentSeason()?.name;
  const match=base?.match(/^(\d{4})\/(\d{4})$/);if(!match)return;
  const start=Number(match[1])+1,end=Number(match[2])+1;
  $('newSeasonName').value=`${start}/${end}`;$('newSeasonStart').value=`${start}-07-01`;$('newSeasonEnd').value=`${end}-06-30`;
}
function renderSeasons(){
  const box=$('seasonsList');if(!box)return;box.replaceChildren();
  seasons.forEach(s=>{
    const row=document.createElement('article');row.className='season-row';
    const title=document.createElement('div');const strong=document.createElement('strong');strong.textContent=s.name;const small=document.createElement('small');small.textContent=`${formatShortDate(s.start_date)} – ${formatShortDate(s.end_date)}`;const count=document.createElement('small');count.className='season-roster-count';count.textContent=`Rosa: ${s.roster_count||0} atleti (${s.active_count||0} attivi)`;title.append(strong,small,count);
    const badges=document.createElement('div');badges.className='season-badges';
    if(s.is_current){const badge=document.createElement('span');badge.className='season-badge current';badge.textContent='Stagione attuale';badges.append(badge)}
    if(!s.is_current){const badge=document.createElement('span');badge.className='season-badge future';badge.textContent='Preparazione';badges.append(badge)}
    const actions=document.createElement('div');actions.className='actions';
    const open=document.createElement('button');open.type='button';open.className='secondary';open.textContent='Apri rosa';open.onclick=async()=>{selectedAthleteSeasonId=s.id;populateSeasonSelect($('athleteSeasonSelect'),s.id);await loadAthletes();openAdminTab('athletes')};actions.append(open);
    if(!s.roster_count&&s.id!==currentSeason()?.id){const copy=document.createElement('button');copy.type='button';copy.className='secondary';copy.textContent='Copia rosa attuale';copy.onclick=async()=>{const source=currentSeason();if(!source||!confirm(`Copiare gli atleti attivi di ${source.name} nella rosa ${s.name}?`))return;const {data,error}=await db.rpc('v2_copy_season_roster',{p_source_season_id:source.id,p_target_season_id:s.id});if(error)return toast('Errore copia rosa: '+error.message);await loadSeasons(s.id);toast(`Copiati ${data||0} atleti nella stagione ${s.name}`)};actions.append(copy)}
    if(!s.is_current){const current=document.createElement('button');current.type='button';current.className='secondary';current.textContent='Imposta attuale';current.onclick=async()=>{if(!confirm(`Impostare ${s.name} come stagione attuale?`))return;const {error}=await db.rpc('v2_set_current_season',{p_season_id:s.id});if(error)return toast(error.message);await loadSeasons();await loadAthletes();toast('Stagione attuale aggiornata')};actions.append(current)}
    const edit=document.createElement('button');edit.type='button';edit.className='secondary';edit.textContent='Modifica';edit.onclick=()=>openSeasonEditor(s);actions.append(edit);
    if(!s.is_current){const remove=document.createElement('button');remove.type='button';remove.className='danger';remove.textContent='Elimina';remove.onclick=async()=>{if(!confirm(`Eliminare definitivamente la stagione ${s.name} e la sua rosa?\n\nL'operazione è consentita solo se non ci sono gare collegate.`))return;const {error}=await db.rpc('v2_delete_season',{p_season_id:s.id});if(error)return toast(seasonErrorMessage(error));if(selectedAthleteSeasonId===s.id)selectedAthleteSeasonId='';await loadSeasons();await loadAthletes();toast(`Stagione ${s.name} eliminata`)};actions.append(remove)}
    row.append(title,badges,actions);box.append(row);
  });
}
function seasonErrorMessage(error){
  const message=error?.message||String(error||'Errore sconosciuto');
  if(message.includes('CURRENT_SEASON_CANNOT_BE_DELETED'))return'La stagione attuale non può essere eliminata. Imposta prima un’altra stagione come attuale.';
  if(message.includes('SEASON_HAS_EVENTS'))return'Questa stagione contiene già delle gare e non può essere eliminata.';
  if(message.includes('SEASON_NAME_ALREADY_EXISTS'))return'Esiste già una stagione con questo nome.';
  return message;
}
function openSeasonEditor(season){
  $('editSeasonId').value=season.id;$('editSeasonName').value=season.name;$('editSeasonStart').value=season.start_date;$('editSeasonEnd').value=season.end_date;
  $('seasonEditCard').classList.remove('hidden');$('seasonEditCard').scrollIntoView({behavior:'smooth',block:'nearest'});
}
$('cancelSeasonEditBtn').onclick=()=>{$('seasonEditCard').classList.add('hidden');$('editSeasonId').value=''};
$('editSeasonName').addEventListener('input',()=>{const m=$('editSeasonName').value.trim().match(/^(\d{4})\/(\d{4})$/);if(m){$('editSeasonStart').value=`${m[1]}-07-01`;$('editSeasonEnd').value=`${m[2]}-06-30`}});
$('saveSeasonBtn').onclick=async()=>{
  const args={p_season_id:$('editSeasonId').value,p_name:$('editSeasonName').value.trim(),p_start_date:$('editSeasonStart').value||null,p_end_date:$('editSeasonEnd').value||null};
  if(!args.p_season_id||!/^\d{4}\/\d{4}$/.test(args.p_name)||!args.p_start_date||!args.p_end_date)return toast('Inserisci nome e date validi');
  const {error}=await db.rpc('v2_update_season',args);if(error)return toast('Errore modifica stagione: '+seasonErrorMessage(error));
  $('seasonEditCard').classList.add('hidden');$('editSeasonId').value='';await loadSeasons(args.p_season_id);toast('Parametri della stagione aggiornati');
};
async function loadSeasons(preferredId=selectedAthleteSeasonId){
  const {data,error}=await db.from('v2_seasons').select('*').order('start_date',{ascending:false});if(error)return toast('Errore stagioni: '+error.message);
  const {data:rosterRows,error:rosterError}=await db.from('v2_season_athletes').select('season_id,is_active');if(rosterError)return toast('Errore conteggio rose: '+rosterError.message);
  const counts=new Map();(rosterRows||[]).forEach(row=>{const c=counts.get(row.season_id)||{total:0,active:0};c.total++;if(row.is_active)c.active++;counts.set(row.season_id,c)});
  seasons=(data||[]).map(s=>({...s,roster_count:counts.get(s.id)?.total||0,active_count:counts.get(s.id)?.active||0}));selectedAthleteSeasonId=seasons.some(s=>s.id===preferredId)?preferredId:(currentSeason()?.id||seasons[0]?.id||'');
  populateSeasonSelect($('eventSeasonInput'),currentEvent?.season_id||currentSeason()?.id);
  populateSeasonSelect($('athleteSeasonSelect'),selectedAthleteSeasonId);
  populateSeasonSelect($('newSeasonCopyFrom'),currentSeason()?.id,{includeEmpty:true});
  renderSeasons();suggestNextSeason();
}
$('athleteSeasonSelect').onchange=async()=>{selectedAthleteSeasonId=$('athleteSeasonSelect').value;await loadAthletes()};
$('eventSeasonInput').onchange=()=>document.dispatchEvent(new CustomEvent('juvenilia:event-season-changed',{detail:{seasonId:$('eventSeasonInput').value}}));
$('newSeasonName').addEventListener('input',()=>{const m=$('newSeasonName').value.trim().match(/^(\d{4})\/(\d{4})$/);if(m){$('newSeasonStart').value=`${m[1]}-07-01`;$('newSeasonEnd').value=`${m[2]}-06-30`}});
$('createSeasonBtn').onclick=async()=>{
  const args={p_name:$('newSeasonName').value.trim(),p_start_date:$('newSeasonStart').value||null,p_end_date:$('newSeasonEnd').value||null,p_copy_from:$('newSeasonCopyFrom').value||null};
  if(!/^\d{4}\/\d{4}$/.test(args.p_name)||!args.p_start_date||!args.p_end_date)return toast('Inserisci nome e date della stagione');
  const {data,error}=await db.rpc('v2_create_season',args);if(error)return toast('Errore creazione stagione: '+error.message);
  $('newSeasonName').value='';await loadSeasons(data);selectedAthleteSeasonId=data;populateSeasonSelect($('athleteSeasonSelect'),data);await loadAthletes();toast('Nuova stagione creata');
};
const linkedEventSelectIds=['eventSelect','registrationsEventSelect','configEventSelect','advancedEventSelect','exportEventSelect'];

function populateLinkedEventSelects(selectedId=currentEvent?.id||''){
  linkedEventSelectIds.forEach(id=>{
    const sel=$(id);
    if(!sel)return;
    sel.replaceChildren();
    sel.append(new Option(events.length?'Seleziona una gara':'Nessuna gara disponibile',''));
    events.forEach(e=>{
      const o=document.createElement('option');
      o.value=e.id;
      const season=seasons.find(s=>s.id===e.season_id)?.name||'';
      o.textContent=e.title+(season?` — ${season}`:'')+(e.is_archived?' — ARCHIVIATA':'');
      sel.append(o);
    });
    sel.value=selectedId&&events.some(e=>e.id===selectedId)?selectedId:'';
  });
}

async function selectAdminEvent(eventId,{reload=true}={}){
  const found=events.find(e=>e.id===eventId);
  if(!found){
    currentEvent=null;
    populateLinkedEventSelects('');
    $('saveEventBtn').textContent='Salva gara';
    $('saveEventBtn').disabled=true;
    $('deleteEventBtn').disabled=true;
    fillEvent();
    updatePublicEventLink();
    if(reload){await Promise.all([loadRegistrations(),loadTimers(),loadConfig()]);renderStats()}
    document.dispatchEvent(new CustomEvent('juvenilia:event-changed',{detail:{eventId:null}}));
    return;
  }
  currentEvent=found;
  populateLinkedEventSelects(found.id);
  $('saveEventBtn').textContent='Salva gara';
  $('saveEventBtn').disabled=true;
  $('deleteEventBtn').disabled=false;
  $('eventSlugInput').dataset.auto='0';
  fillEvent();
  updatePublicEventLink();
  if(reload){
    await Promise.all([loadRegistrations(),loadTimers(),loadConfig()]);
    renderStats();
  }
  document.dispatchEvent(new CustomEvent('juvenilia:event-changed',{detail:{eventId:found.id}}));
}

async function loadEvents(preferredId=currentEvent?.id||''){
  const {data,error}=await db.from('v2_events').select('*').order('created_at',{ascending:false});
  if(error)return toast(error.message);
  events=data||[];
  const selected=events.find(e=>e.id===preferredId)||null;
  currentEvent=selected;
  populateLinkedEventSelects(selected?.id||'');
  $('saveEventBtn').textContent='Salva gara';
  $('saveEventBtn').disabled=true;
  $('deleteEventBtn').disabled=!selected;
  fillEvent();
  updatePublicEventLink();
}

$('eventSelect').onchange=async()=>selectAdminEvent($('eventSelect').value);
['registrationsEventSelect','configEventSelect','advancedEventSelect','exportEventSelect'].forEach(id=>{
  const sel=$(id);
  if(sel)sel.onchange=async()=>selectAdminEvent(sel.value);
});
function fillEvent(){const e=currentEvent||{};$('eventTitleInput').value=e.title||'';$('eventSlugInput').value=e.slug||'';$('eventDescriptionInput').value=e.description||'';$('eventDeadlineInput').value=localDate(e.registration_deadline);$('eventPublishedInput').checked=!!e.is_published;$('eventArchivedInput').checked=!!e.is_archived;populateSeasonSelect($('eventSeasonInput'),e.season_id||currentSeason()?.id);$('eventSeasonInput').disabled=!!currentEvent;renderAdminPoster()}
function updatePublicEventLink(){
  let link=$('openPublicEventLink');
  let directBtn=$('copyDirectEventLink');
  if(!currentEvent){link?.remove();directBtn?.remove();return}
  if(!link){
    link=document.createElement('a');
    link.id='openPublicEventLink';
    link.className='button secondary admin-public-event-link';
    link.target='_blank';
    link.rel='noopener noreferrer';
    link.textContent='Apri pagina pubblica';
    $('saveEventBtn')?.insertAdjacentElement('afterend',link);
  }
  link.href=`index.html?gara=${encodeURIComponent(currentEvent.slug)}`;

  if(!directBtn){
    directBtn=document.createElement('button');
    directBtn.type='button';
    directBtn.id='copyDirectEventLink';
    directBtn.className='button secondary admin-public-event-link';
    directBtn.textContent='Copia link diretto';
    link.insertAdjacentElement('afterend',directBtn);
  }
  directBtn.onclick=async()=>{
    const directUrl=new URL(`index.html?gara=${encodeURIComponent(currentEvent.slug)}&diretta=1`,location.href).href;
    try{
      await navigator.clipboard.writeText(directUrl);
      toast('Link diretto copiato');
    }catch{
      window.prompt('Copia questo link diretto alla gara:',directUrl);
    }
  };
}

$('newEventBtn').onclick=()=>{
  currentEvent=null;
  populateLinkedEventSelects('');
  fillEvent();
  $('eventSeasonInput').disabled=false;
  updatePublicEventLink();
  $('eventSlugInput').dataset.auto='1';
  $('saveEventBtn').textContent='Crea gara';
  $('saveEventBtn').disabled=true;
  $('deleteEventBtn').disabled=true;
  $('eventTitleInput').focus();
  toast('Nuova gara: inserisci il titolo e compila i dati');
};
$('deleteEventBtn').onclick=async()=>{
  if(!currentEvent)return toast('Seleziona prima una gara');
  const title=currentEvent.title||'questa gara';

  const first=confirm(
    `Eliminare definitivamente "${title}"?\n\n`+
    'Verranno eliminate anche le iscrizioni, le scadenze e la configurazione collegate. '+
    'Gli atleti dell’archivio resteranno salvati.'
  );
  if(!first)return;

  const second=confirm(
    `ULTIMA CONFERMA\n\nSei sicuro di voler eliminare definitivamente "${title}"?\n\n`+
    'Questa operazione non può essere annullata.'
  );
  if(!second)return;

  const deletingId=currentEvent.id;
  const {error}=await db.from('v2_events').delete().eq('id',deletingId);
  if(error)return toast('Errore eliminazione gara: '+error.message);

  if(currentEvent.poster_path)await db.storage.from(POSTER_BUCKET).remove([currentEvent.poster_path]);
  toast('Gara eliminata definitivamente');
  currentEvent=null;
  await loadEvents();
  await Promise.all([loadRegistrations(),loadTimers(),loadConfig()]);
  renderStats();
  document.dispatchEvent(new CustomEvent('juvenilia:event-changed',{detail:{eventId:currentEvent?.id||null}}));
};

$('eventTitleInput').addEventListener('input',()=>{
  if(!currentEvent){
    $('eventSlugInput').value=slugify($('eventTitleInput').value);
    $('eventSlugInput').dataset.auto='1';
  }
});
$('eventSlugInput').addEventListener('input',()=>{
  $('eventSlugInput').value=slugify($('eventSlugInput').value);
  if(document.activeElement===$('eventSlugInput')) $('eventSlugInput').dataset.auto='0';
});
$('saveEventBtn').onclick=async()=>{
  const title=$('eventTitleInput').value.trim();
  const finalSlug=slugify($('eventSlugInput').value || title);
  $('eventSlugInput').value=finalSlug;
  const row={title:title,slug:finalSlug,season_id:$('eventSeasonInput').value||currentSeason()?.id||null,description:$('eventDescriptionInput').value.trim()||null,registration_deadline:$('eventDeadlineInput').value?new Date($('eventDeadlineInput').value).toISOString():null,is_published:$('eventPublishedInput').checked,is_archived:$('eventArchivedInput').checked};if(!row.title){toast('Il titolo della gara è obbligatorio');return false}
  if(!row.season_id){toast('Seleziona la stagione della gara');return false}
  if(!row.slug){toast('Lo slug non è valido. Usa lettere, numeri e trattini.');return false}const creating=!currentEvent;
  const q=creating
    ? db.from('v2_events').insert(row).select().single()
    : db.from('v2_events').update(row).eq('id',currentEvent.id).select().single();
  const {data:saved,error}=await q;
  if(error){toast(error.message);return false}
  toast(creating?'Gara creata':'Modifiche salvate');

  if(creating && saved?.id){
    const {data:activeAthletes,error:athletesError}=await db
      .from('v2_season_athletes')
      .select('athlete_id,category')
      .eq('season_id',saved.season_id)
      .eq('is_active',true);

    if(athletesError){
      toast('Gara creata, ma non riesco a caricare gli atleti attivi: '+athletesError.message);
    }else if(activeAthletes?.length){
      const rows=activeAthletes.map(a=>({
        event_id:saved.id,
        athlete_id:a.athlete_id,
        category_snapshot:a.category,
        status:'pending'
      }));

      const {error:enrollError}=await db
        .from('v2_event_registrations')
        .upsert(rows,{onConflict:'event_id,athlete_id',ignoreDuplicates:true});

      if(enrollError){
        toast('Gara creata, ma alcuni atleti non sono stati aggiunti automaticamente: '+enrollError.message);
      }else{
        toast(`Gara creata con ${activeAthletes.length} atleti attivi`);
      }
    }else{
      toast('Gara creata: nessun atleta attivo da aggiungere');
    }
  }

  await loadEvents(saved?.id||'');
  if(saved){
    currentEvent=events.find(e=>e.id===saved.id)||saved;
    $('eventSelect').value=saved.id;
    $('saveEventBtn').textContent='Salva gara';
    $('eventSlugInput').dataset.auto='0';
    fillEvent();
  }
  await Promise.all([loadAthletes(),loadRegistrations(),loadTimers(),loadConfig()]);
  renderStats();return true};

async function loadAthletes(){
  const season=selectedAthleteSeason();
  if(!season){athletes=[];renderAthletes();return}
  selectedAthleteSeasonId=season.id;populateSeasonSelect($('athleteSeasonSelect'),season.id);
  const {data,error}=await db.from('v2_season_athletes').select('id,season_id,athlete_id,category,is_active').eq('season_id',season.id);
  if(error)return toast(error.message);
  const roster=data||[],ids=roster.map(row=>row.athlete_id);let profiles=[];
  if(ids.length){const {data:profileData,error:profileError}=await db.from('v2_athletes').select('id,full_name,gender').in('id',ids);if(profileError)return toast('Errore anagrafica atleti: '+profileError.message);profiles=profileData||[]}
  const byId=new Map(profiles.map(a=>[a.id,a]));
  athletes=roster.map(row=>{const athlete=byId.get(row.athlete_id);return{season_athlete_id:row.id,season_id:row.season_id,id:row.athlete_id,full_name:athlete?.full_name||'Atleta non disponibile',gender:athlete?.gender||null,category:row.category,is_active:row.is_active}}).sort((a,b)=>a.full_name.localeCompare(b.full_name,'it'));
  const state=$('athleteSeasonState');state.textContent=`${season.is_current?'Stagione attuale':'In preparazione'} · ${athletes.length} atleti`;state.className=`season-state ${season.is_current?'current':'future'}`;
  $('addAthleteBtn').disabled=false;$('athleteName').disabled=false;$('athleteCategory').disabled=false;$('athleteGender').disabled=false;
  renderAthletes();
}
function renderAthletes(){
  $('athletesBody').replaceChildren();
  if(!athletes.length){const tr=document.createElement('tr');const td=document.createElement('td');td.colSpan=5;td.className='empty-state';td.textContent='Nessun atleta in questa rosa. Puoi aggiungerli qui oppure usare “Copia rosa attuale” nella scheda Stagioni.';tr.append(td);$('athletesBody').append(tr);return}
  const categories=allAthleteCategories();
  athletes.forEach(a=>{
    const tr=document.createElement('tr');
    const nameTd=document.createElement('td');nameTd.textContent=a.full_name;tr.append(nameTd);

    const catTd=document.createElement('td');catTd.className='athlete-category-cell';
    const catSelect=document.createElement('select');catSelect.className='inline-select athlete-category-select';
    [...new Set([a.category,...categories].filter(Boolean))].forEach(cat=>{const o=document.createElement('option');o.value=cat;o.textContent=cat;catSelect.append(o)});
    catSelect.value=a.category||'';catTd.append(catSelect);tr.append(catTd);

    [a.gender||'-',a.is_active?'Sì':'No'].forEach(v=>{const td=document.createElement('td');td.textContent=v;tr.append(td)});
    const td=document.createElement('td');td.className='athlete-actions-cell';

    catSelect.onchange=async()=>{
      const category=clean(catSelect.value).toUpperCase();
      if(!category){catSelect.value=a.category||'';return toast('Seleziona una categoria')}
      if(category===a.category)return;
      catSelect.disabled=true;
      const {data:updated,error}=await db.rpc('v2_update_season_athlete_category',{p_season_id:a.season_id,p_athlete_id:a.id,p_category:category});
      if(error){catSelect.disabled=false;catSelect.value=a.category||'';return toast('Errore modifica categoria: '+error.message)}
      toast(`Categoria di ${a.full_name} aggiornata${updated?` anche in ${updated} iscrizioni ancora in attesa`:''}`);
      await loadAthletes();await loadRegistrations();
      document.dispatchEvent(new CustomEvent('juvenilia:athletes-changed'));
    };

    const toggle=document.createElement('button');toggle.textContent=a.is_active?'Disattiva':'Riattiva';toggle.className=a.is_active?'danger':'';
    toggle.onclick=async()=>{
      const becomingActive=!a.is_active;
      const {data:n,error}=await db.rpc('v2_set_season_athlete_active',{p_season_id:a.season_id,p_athlete_id:a.id,p_active:becomingActive});
      if(error)return toast(error.message);
      if(becomingActive){
        toast(`Atleta riattivato: aggiunto a ${n||0} gare attive`);
      }else toast(`Atleta disattivato per ${selectedAthleteSeason()?.name}${n?`: rimosso da ${n} gare ancora in attesa`:''}`);
      await loadAthletes();await loadRegistrations();
      document.dispatchEvent(new CustomEvent('juvenilia:athletes-changed'));
    };

    const remove=document.createElement('button');remove.type='button';remove.textContent='Elimina atleta';remove.className='danger';
    remove.onclick=async()=>{
      if(!confirm(`Eliminare definitivamente "${a.full_name}"?\n\nL'atleta verrà rimosso da tutte le stagioni. Verranno eliminate anche tutte le sue iscrizioni e i risultati nello storico.`))return;
      if(!confirm(`ULTIMA CONFERMA\n\nEliminare definitivamente "${a.full_name}" e i suoi dati collegati? Questa operazione non può essere annullata.`))return;
      remove.disabled=true;
      const {error}=await db.rpc('v2_delete_athlete',{p_athlete_id:a.id});
      if(error){remove.disabled=false;return toast('Errore eliminazione atleta: '+error.message)}
      toast('Atleta eliminato definitivamente');
      await Promise.all([loadAthletes(),loadRegistrations(),loadSeasons()]);
      renderStats();
      document.dispatchEvent(new CustomEvent('juvenilia:athletes-changed'));
    };

    td.append(toggle,remove);tr.append(td);$('athletesBody').append(tr);
  });
}
$('addAthleteBtn').onclick=async()=>{
  const season=selectedAthleteSeason(),fullName=$('athleteName').value.trim().toUpperCase(),category=$('athleteCategory').value.trim().toUpperCase(),gender=$('athleteGender').value||null;
  if(!season)return toast('Seleziona una stagione');if(!fullName||!category)return toast('Nome e categoria obbligatori');
  let athleteId=null;
  const {data:matches,error:searchError}=await db.from('v2_athletes').select('id,full_name,gender').eq('full_name',fullName);
  if(searchError)return toast(searchError.message);
  const same=(matches||[]).find(a=>a.full_name.trim().toUpperCase()===fullName&&(a.gender||null)===gender);
  if(same)athleteId=same.id;
  else{
    const {data:created,error}=await db.from('v2_athletes').insert({full_name:fullName,category,gender,is_active:season.is_current}).select('id').single();
    if(error)return toast(error.message);athleteId=created.id;
  }
  const {error}=await db.from('v2_season_athletes').insert({season_id:season.id,athlete_id:athleteId,category,is_active:true});
  if(error)return toast(error.code==='23505'?'Atleta già presente in questa stagione':error.message);
  const {data:added,error:syncError}=await db.rpc('v2_sync_season_athlete_to_events',{p_season_id:season.id,p_athlete_id:athleteId});
  if(syncError)return toast('Atleta aggiunto, ma sincronizzazione gare non riuscita: '+syncError.message);
  $('athleteName').value='';toast(`${same?'Atleta aggiunto alla stagione':'Nuovo atleta aggiunto'}${added?` e inserito in ${added} gare`:''}`);await loadAthletes();
};

async function loadRegistrations(){
  if(!currentEvent){registrations=[];selectedRegistrationIds.clear();renderRegistrations();return}
  const {data,error}=await db.from('v2_event_registrations').select('*, athlete:v2_athletes(*)').eq('event_id',currentEvent.id).order('created_at');
  if(error)return toast(error.message);
  registrations=data||[];
  selectedRegistrationIds=new Set([...selectedRegistrationIds].filter(id=>registrations.some(r=>r.id===id)));
  renderRegistrations();renderStats();
}
function sortedRegistrations(){
  const rows=[...registrations];
  if(registrationsSort==='category')return rows.sort((a,b)=>categoryOrderValue(categoryOf(a))-categoryOrderValue(categoryOf(b))||(categoryOf(a)||'').localeCompare(categoryOf(b)||'','it')||(a.athlete?.full_name||'').localeCompare(b.athlete?.full_name||'','it'));
  if(registrationsSort==='status'){const order={yes:0,pending:1,no:2};return rows.sort((a,b)=>(order[a.status]??9)-(order[b.status]??9)||(a.athlete?.full_name||'').localeCompare(b.athlete?.full_name||'','it'))}
  return rows.sort((a,b)=>(a.athlete?.full_name||'').localeCompare(b.athlete?.full_name||'','it'));
}
function refreshSelectAllRegistrationState(){
  const all=$('selectAllRegistrations');if(!all)return;
  all.checked=registrations.length>0&&registrations.every(r=>selectedRegistrationIds.has(r.id));
  all.indeterminate=selectedRegistrationIds.size>0&&!all.checked;
}
function renderRegistrations(){
  $('registrationsBody').replaceChildren();if($('registrationsSort'))$('registrationsSort').value=registrationsSort;
  sortedRegistrations().forEach(r=>{
    const tr=document.createElement('tr');tr.dataset.registrationId=String(r.id);tr.dataset.athleteId=String(r.athlete_id);
    const checkTd=document.createElement('td'),cb=document.createElement('input');cb.type='checkbox';cb.className='registration-select';cb.checked=selectedRegistrationIds.has(r.id);
    cb.onchange=()=>{if(cb.checked)selectedRegistrationIds.add(r.id);else selectedRegistrationIds.delete(r.id);refreshSelectAllRegistrationState()};checkTd.append(cb);tr.append(checkTd);
    const statusLabel=r.status==='no'&&r.auto_declined_at?'Non partecipa · Nessuna risposta':r.status;
    [r.athlete?.full_name||'',r.category_override||r.category_snapshot||r.athlete?.category||'',statusLabel,r.companion_name||'',r.is_locked?'Sì':'No'].forEach(v=>{const td=document.createElement('td');td.textContent=v;tr.append(td)});
    const td=document.createElement('td');td.className='row-actions';
    const lock=document.createElement('button');lock.textContent=r.is_locked?'Sblocca':'Blocca';lock.onclick=async()=>{const {error}=await db.from('v2_event_registrations').update({is_locked:!r.is_locked}).eq('id',r.id);if(error)return toast(error.message);await loadRegistrations()};
    const reset=document.createElement('button');reset.textContent='Reset';reset.className='secondary';reset.onclick=async()=>{const {error}=await db.from('v2_event_registrations').update({status:'pending',companion_name:null,responded_at:null,race_day:null,category_override:null}).eq('id',r.id);if(error)return toast(error.message);await loadRegistrations()};
    td.append(lock,reset);tr.append(td);$('registrationsBody').append(tr)
  });
  refreshSelectAllRegistrationState();
}
$('registrationsSort').value=registrationsSort;
$('registrationsSort').onchange=()=>{registrationsSort=$('registrationsSort').value;localStorage.setItem('juvenilia_registrations_sort',registrationsSort);renderRegistrations()};
$('selectAllRegistrations').onchange=()=>{if($('selectAllRegistrations').checked)registrations.forEach(r=>selectedRegistrationIds.add(r.id));else selectedRegistrationIds.clear();renderRegistrations()};
$('clearSelectionBtn').onclick=()=>{selectedRegistrationIds.clear();renderRegistrations()};
async function setSelectedLock(value){
  const ids=[...selectedRegistrationIds];if(!currentEvent)return toast('Seleziona una gara');if(!ids.length)return toast('Seleziona almeno un atleta');
  const {error}=await db.from('v2_event_registrations').update({is_locked:value}).in('id',ids).eq('event_id',currentEvent.id);
  if(error)return toast(error.message);
  toast(value?`${ids.length} iscrizioni bloccate`:`${ids.length} iscrizioni sbloccate`);selectedRegistrationIds.clear();await loadRegistrations();
}
$('lockSelectedBtn').onclick=()=>setSelectedLock(true);
$('unlockSelectedBtn').onclick=()=>setSelectedLock(false);
$('enrollAllBtn').onclick=async()=>{
  if(!currentEvent)return toast('Seleziona una gara');
  const {data:roster,error:rosterError}=await db.from('v2_season_athletes').select('athlete_id,category').eq('season_id',currentEvent.season_id).eq('is_active',true);
  if(rosterError)return toast(rosterError.message);
  const existing=new Set(registrations.map(r=>r.athlete_id)),rows=(roster||[]).filter(a=>!existing.has(a.athlete_id)).map(a=>({event_id:currentEvent.id,athlete_id:a.athlete_id,category_snapshot:a.category}));
  if(!rows.length)return toast('Tutti gli atleti attivi della stagione sono già presenti');const {error}=await db.from('v2_event_registrations').insert(rows);if(error)return toast(error.message);toast(`${rows.length} atleti aggiunti`);await loadRegistrations()
};
$('resetRegistrationsBtn').onclick=async()=>{if(!currentEvent||!confirm('Resettare tutte le scelte, accompagnatori, giornate e categorie specifiche della gara?'))return;const {error}=await db.from('v2_event_registrations').update({status:'pending',companion_name:null,responded_at:null,race_day:null,category_override:null}).eq('event_id',currentEvent.id);if(error)return toast(error.message);await loadRegistrations();toast('Scelte resettate')};
$('unlockAllBtn').onclick=async()=>{if(!currentEvent)return;const {error}=await db.from('v2_event_registrations').update({is_locked:false}).eq('event_id',currentEvent.id);if(error)return toast(error.message);await loadRegistrations();toast('Tutti sbloccati')};

async function loadTimers(){if(!currentEvent){timers=[];renderTimers();return}const {data,error}=await db.from('v2_event_timers').select('*').eq('event_id',currentEvent.id).order('deadline');if(error)return toast(error.message);timers=data||[];renderTimers()}
function renderTimers(){const _timerList=$('timersList');if(!_timerList)return;_timerList.replaceChildren();timers.forEach(t=>{const row=document.createElement('div');row.className='timer-item';const text=document.createElement('div');text.textContent=`${t.label} — ${formatDate(t.deadline)} — ${(t.categories||[]).join(', ')||'Tutte le categorie'}`;const del=document.createElement('button');del.textContent='Elimina';del.className='danger';del.onclick=async()=>{if(!confirm('Eliminare questo timer?'))return;const {error}=await db.from('v2_event_timers').delete().eq('id',t.id);if(error)return toast(error.message);await loadTimers()};row.append(text,del);_timerList.append(row)})}
// Vecchio handler Timer rimosso: la gestione è affidata alla nuova scheda Scadenze per categoria.

async function loadConfig(){if(!currentEvent){configRows=[];fillConfig();return}const {data,error}=await db.from('v2_event_config').select('*').eq('event_id',currentEvent.id);if(error)return toast(error.message);configRows=data||[];fillConfig();renderStats()}
function cfg(k,d=null){return configRows.find(x=>x.key===k)?.value??d}
function fillConfig(){
  $('cfgSubtitle').value=cfg('subtitle','');
  const info=String(cfg('info_box','')||'');
  $('cfgInfo').value=info;$('cfgInfoEditor').innerHTML=sanitizeRichHtml(info);
  $('cfgInfoVisible').checked=cfg('show_info_box',true)!==false;
  $('cfgInfoPreview').classList.add('hidden');$('cfgInfoPreview').innerHTML='';
  const pay=cfg('payment_info','');$('cfgPayment').value=typeof pay==='string'?pay:JSON.stringify(pay,null,2);
  $('cfgCosts').value=JSON.stringify(cfg('category_costs',{}),null,2);
  const d1=cfg('document_1',{}),d2=cfg('document_2',{});
  $('cfgDoc1Text').value=d1?.text||'';$('cfgDoc1Url').value=d1?.url||'';$('cfgDoc2Text').value=d2?.text||'';$('cfgDoc2Url').value=d2?.url||'';
  $('cfgCompanion').checked=cfg('show_companion',true)!==false;
}
function execInfoCommand(cmd,value=null){$('cfgInfoEditor').focus();document.execCommand(cmd,false,value)}
document.querySelectorAll('#cfgInfoToolbar [data-cmd]').forEach(btn=>btn.onclick=()=>execInfoCommand(btn.dataset.cmd));
$('cfgInfoTextColor').oninput=e=>execInfoCommand('foreColor',e.target.value);
$('cfgInfoBgColor').oninput=e=>execInfoCommand('backColor',e.target.value);
$('cfgInfoLinkBtn').onclick=()=>{
  const url=prompt('Inserisci il link (https://...)');if(!url)return;
  try{const parsed=new URL(url);if(!['http:','https:','mailto:'].includes(parsed.protocol))return toast('Link non valido')}catch{return toast('Link non valido')}
  execInfoCommand('createLink',url);
};
$('cfgInfoPreviewBtn').onclick=()=>{const preview=$('cfgInfoPreview');preview.innerHTML=sanitizeRichHtml($('cfgInfoEditor').innerHTML);preview.classList.toggle('hidden')};
$('cfgInfoClearBtn').onclick=()=>{if(!confirm('Azzera il contenuto del box informazioni?'))return;$('cfgInfoEditor').innerHTML='';$('cfgInfo').value='';$('cfgInfoPreview').innerHTML='';$('cfgInfoPreview').classList.add('hidden')};
$('cfgClearDoc1Btn').onclick=()=>{$('cfgDoc1Text').value='';$('cfgDoc1Url').value=''};
$('cfgClearDoc2Btn').onclick=()=>{$('cfgDoc2Text').value='';$('cfgDoc2Url').value=''};
$('saveConfigBtn').onclick=async()=>{
  if(!currentEvent)return toast('Seleziona una gara');
  const info=sanitizeRichHtml($('cfgInfoEditor').innerHTML);$('cfgInfo').value=info;
  const rows=[
    ['subtitle',$('cfgSubtitle').value],
    ['info_box',info],
    ['show_info_box',$('cfgInfoVisible').checked],
    ['document_1',{text:$('cfgDoc1Text').value.trim(),url:$('cfgDoc1Url').value.trim()}],
    ['document_2',{text:$('cfgDoc2Text').value.trim(),url:$('cfgDoc2Url').value.trim()}],
    ['show_companion',$('cfgCompanion').checked]
  ].map(([key,value])=>({event_id:currentEvent.id,key,value,is_public:true}));
  const {error}=await db.from('v2_event_config').upsert(rows,{onConflict:'event_id,key'});
  if(error)return toast(error.message);toast('Configurazione pubblica salvata');await loadConfig();
  document.dispatchEvent(new CustomEvent('juvenilia:config-save-complete'));
};

function categoryOf(r){return r.category_override||r.category_snapshot||r.athlete?.category||''}
function costOf(r){const n=Number(cfg('category_costs',{})[categoryOf(r)]||0);return Number.isFinite(n)?n:0}
function raceDayOf(r){return r.race_day||''}

function renderStats(){
  const yes=registrations.filter(r=>r.status==='yes');
  const no=registrations.filter(r=>r.status==='no').length;
  const pending=registrations.filter(r=>r.status==='pending').length;
  const companions=yes.filter(r=>r.companion_name).length;
  const total=yes.reduce((sum,r)=>sum+costOf(r),0);

  $('adminStats').innerHTML=
    `<div class="stat"><strong>${yes.length}</strong>Partecipa</div>`+
    `<div class="stat"><strong>${no}</strong>Non partecipa</div>`+
    `<div class="stat"><strong>${pending}</strong>Da definire</div>`+
    `<div class="stat"><strong>${companions}</strong>Accompagnatori</div>`+
    `<div class="stat"><strong>${total.toFixed(2)} €</strong>Totale quote</div>`;

  const box=$('exportSummary');
  if(!box)return;
  const byCat={};
  yes.forEach(r=>{
    const c=categoryOf(r)||'SENZA CATEGORIA';
    byCat[c]??={n:0,total:0};
    byCat[c].n++;
    byCat[c].total+=costOf(r);
  });
  box.replaceChildren();
  const title=document.createElement('h3');
  title.textContent='Riepilogo partecipanti';
  box.append(title);
  const entries=Object.entries(byCat).sort(([a],[b])=>categoryOrderValue(a)-categoryOrderValue(b)||a.localeCompare(b,'it'));
  if(!entries.length){
    const empty=document.createElement('p');
    empty.textContent='Nessun partecipante confermato.';
    box.append(empty);
  }else{
    entries.forEach(([c,v])=>{
      const line=document.createElement('div');
      const strong=document.createElement('strong');
      strong.textContent=c;
      line.append(strong,document.createTextNode(`: ${v.n} partecipanti — ${v.total.toFixed(2)} €`));
      box.append(line);
    });
  }
}

function exportRows(companionsOnly=false){
  return registrations
    .filter(r=>!companionsOnly||r.companion_name)
    .map(r=>({
      Atleta:r.athlete?.full_name||'',
      Categoria:categoryOf(r),
      Sesso:r.athlete?.gender||'',
      Giornata:raceDayOf(r),
      Stato:r.status==='yes'?'PARTECIPA':r.status==='no'?'NON PARTECIPA':'DA DEFINIRE',
      Accompagnatore:r.companion_name||'',
      'Quota €':r.status==='yes'?costOf(r):0,
      Bloccato:r.is_locked?'SI':'NO',
      'Ultima risposta':r.responded_at?new Date(r.responded_at).toLocaleString('it-IT'):''
    }));
}

function participantRows(){
  return registrations.filter(r=>r.status==='yes').map(r=>({
    Atleta:r.athlete?.full_name||'',
    Categoria:categoryOf(r),
    Sesso:r.athlete?.gender||'',
    Giornata:raceDayOf(r),
    Accompagnatore:r.companion_name||'',
    'Quota €':costOf(r)
  }));
}

function saveWorkbook(){
  if(!currentEvent)return toast('Seleziona una gara');
  if(typeof XLSX==='undefined')return toast('Libreria Excel non disponibile');
  const wb=XLSX.utils.book_new();
  const sheets=[
    ['Iscrizioni',exportRows()],
    ['Partecipanti',participantRows()],
    ['Accompagnatori',exportRows(true)]
  ];
  sheets.forEach(([name,rows])=>{
    const ws=XLSX.utils.json_to_sheet(rows.length?rows:[{Info:'Nessun dato'}]);
    XLSX.utils.book_append_sheet(wb,ws,name);
  });
  XLSX.writeFile(wb,`Riepilogo_${currentEvent.slug||'gara'}.xlsx`);
}

function saveExcel(rows,name,sheet){
  if(!rows.length)return toast('Nessun dato da esportare');
  const ws=XLSX.utils.json_to_sheet(rows),wb=XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb,ws,sheet);XLSX.writeFile(wb,name)
}

$('exportExcelBtn').textContent='Excel completo';
$('exportExcelBtn').onclick=saveWorkbook;
$('exportCompanionsBtn').onclick=()=>saveExcel(exportRows(true),`Accompagnatori_${currentEvent?.slug||'gara'}.xlsx`,'Accompagnatori');

$('whatsappBtn').onclick=()=>{
  if(!currentEvent)return toast('Seleziona una gara');
  const yes=registrations.filter(r=>r.status==='yes');
  if(!yes.length)return toast('Nessun partecipante confermato');

  let total=0;
  const byCat={};
  yes.forEach(r=>{
    const cat=categoryOf(r)||'SENZA CATEGORIA',q=costOf(r);
    total+=q;(byCat[cat]??=[]).push(r);
  });

  const lines=[];
  Object.entries(byCat).sort().forEach(([cat,list])=>{
    lines.push(`*${cat}*`);
    list.sort((a,b)=>(a.athlete?.full_name||'').localeCompare(b.athlete?.full_name||'')).forEach(r=>{
      const q=costOf(r);
      lines.push(`• ${r.athlete?.full_name||''}${raceDayOf(r)?` — ${raceDayOf(r)}`:''}: ${q.toFixed(2)} €${r.companion_name?` — acc. ${r.companion_name}`:''}`);
    });
    lines.push('');
  });

  const pay=cfg('payment_info',{});
  const payment=[];
  if(pay && typeof pay==='object'){
    if(pay.holder)payment.push(`Intestatario: ${pay.holder}`);
    if(pay.iban)payment.push(`IBAN: ${pay.iban}`);
    if(pay.reason)payment.push(`Causale: ${pay.reason}`);
    if(pay.email)payment.push(`Email distinta: ${pay.email}`);
  }

  const msg=[
    '*JUVENILIA RACING TEAM*',
    `*${currentEvent.title||''}*`,
    '',
    ...lines,
    `*TOTALE: ${total.toFixed(2)} €*`,
    ...(payment.length?['','*PAGAMENTO*',...payment]:[])
  ].join('\n');

  window.open(`https://wa.me/${WHATSAPP_NUMBER}?text=${encodeURIComponent(msg)}`,'_blank','noopener');
};

db.auth.onAuthStateChange(()=>{});
boot();
let timerEventId=null;
let timerEvents=[];
let timerCategories=[];
let timerRows=[];

async function fetchTimerSetupData(){
  const [{data:eventData,error:eventError},{data:categoryData,error:athleteError}] = await Promise.all([
    db.from('v2_events')
      .select('id,title,season_id,is_published,is_archived,created_at')
      .eq('is_archived',false)
      .order('created_at',{ascending:false}),
    db.rpc('v2_admin_list_active_categories',{p_season_id:currentEvent?.season_id||currentSeason()?.id||null})
  ]);
  const athleteData = (categoryData || []).map(category => ({ category }));

  if(eventError){
    toast('Errore caricamento gare: '+eventError.message);
    timerEvents=[];
    const sel=$('timerEventSelect');
    if(sel) sel.innerHTML='<option value="">Errore caricamento gare</option>';
  }else{
    timerEvents=eventData||[];
  }

  if(athleteError){
    toast('Errore caricamento categorie: '+athleteError.message);
    timerCategories=[];
    const box=$('timerCategoryChecks');
    if(box) box.innerHTML='<p class="error">Errore caricamento categorie.</p>';
  }else{
    timerCategories=[...new Set((athleteData||[])
      .map(a=>(a.category||'').trim())
      .filter(Boolean))]
      .sort((a,b)=>a.localeCompare(b,'it'));
  }
}

function populateTimerEventSelect(){
  const sel=$('timerEventSelect');
  if(!sel)return;

  const previous=timerEventId||sel.value||'';
  sel.replaceChildren();

  if(!timerEvents.length){
    const o=document.createElement('option');
    o.value='';
    o.textContent='Nessuna gara disponibile';
    sel.append(o);
    timerEventId=null;
    return;
  }

  sel.append(new Option('Seleziona una gara',''));

  timerEvents.forEach(e=>{
    const o=document.createElement('option');
    o.value=e.id;
    const season=seasons.find(s=>s.id===e.season_id)?.name||'';
    o.textContent=e.title+(season?` — ${season}`:'')+(e.is_published?'':' (non pubblicata)');
    sel.append(o);
  });

  if(previous && timerEvents.some(e=>e.id===previous)){
    sel.value=previous;
  }else{
    sel.value='';
  }

  timerEventId=sel.value||null;
}

function renderTimerCategoryChecks(selected=[]){
  const box=$('timerCategoryChecks');
  if(!box)return;

  const selectedSet=new Set(selected);
  box.replaceChildren();

  if(!timerCategories.length){
    const p=document.createElement('p');
    p.className='muted';
    p.textContent='Nessuna categoria trovata tra gli atleti attivi.';
    box.append(p);
    return;
  }

  [...timerCategories].sort((a,b)=>categoryOrderValue(a)-categoryOrderValue(b)||a.localeCompare(b,'it')).forEach(cat=>{
    const label=document.createElement('label');
    const input=document.createElement('input');
    input.type='checkbox';
    input.value=cat;
    input.checked=selectedSet.has(cat);

    const span=document.createElement('span');
    span.textContent=cat;

    label.append(input,span);
    box.append(label);
  });
}

function selectedTimerCategories(){
  return [...document.querySelectorAll('#timerCategoryChecks input[type="checkbox"]:checked')]
    .map(x=>x.value);
}

async function loadTimersForSelectedEvent(){
  timerEventId=$('timerEventSelect')?.value||null;
  const list=$('timersList');
  if(!list)return;

  list.replaceChildren();

  if(!timerEventId){
    const p=document.createElement('p');
    p.className='muted';
    p.textContent='Seleziona una gara.';
    list.append(p);
    return;
  }

  const {data,error}=await db
    .from('v2_event_timers')
    .select('*')
    .eq('event_id',timerEventId)
    .order('deadline',{ascending:true});

  if(error){
    toast('Errore caricamento scadenze: '+error.message);
    return;
  }

  timerRows=data||[];
  renderSimpleTimersList();
}

async function loadTimerCategoriesForSelectedEvent(){
  const event=timerEvents.find(e=>e.id===timerEventId);
  if(!event){timerCategories=[];renderTimerCategoryChecks();return}
  const {data,error}=await db.rpc('v2_admin_list_active_categories',{p_season_id:event.season_id});
  if(error)return toast('Errore caricamento categorie: '+error.message);
  timerCategories=[...new Set((data||[]).map(x=>String(x).trim()).filter(Boolean))];
  renderTimerCategoryChecks();
}

function renderSimpleTimersList(){
  const list=$('timersList');
  if(!list)return;
  list.replaceChildren();

  if(!timerRows.length){
    const p=document.createElement('p');
    p.className='muted';
    p.textContent='Nessuna scadenza per categoria impostata per questa gara.';
    list.append(p);
    return;
  }

  timerRows.forEach(t=>{
    const row=document.createElement('div');
    row.className='admin-row';

    const info=document.createElement('div');
    const cats=(t.categories||[]).length ? t.categories.join(', ') : 'Tutte le categorie';
    const strong=document.createElement('strong');
    strong.textContent=t.label||'Scadenza categoria';
    const catSpan=document.createElement('span');
    catSpan.className='muted';
    catSpan.textContent=cats;
    const dateSpan=document.createElement('span');
    dateSpan.textContent=new Date(t.deadline).toLocaleString('it-IT');
    info.append(strong,document.createElement('br'),catSpan,document.createElement('br'),dateSpan);

    const actions=document.createElement('div');
    actions.className='actions';

    const edit=document.createElement('button');
    edit.type='button';
    edit.textContent='Modifica';
    edit.onclick=()=>{
      $('timerLabelInput').value=t.label||'';
      $('timerDeadlineInput').value=localDate(t.deadline);
      renderTimerCategoryChecks(t.categories||[]);
      $('saveTimerBtn').dataset.editId=t.id;
      $('saveTimerBtn').textContent='Salva modifiche';
    };

    const del=document.createElement('button');
    del.type='button';
    del.className='danger';
    del.textContent='Elimina';
    del.onclick=async()=>{
      if(!confirm('Eliminare questa scadenza?'))return;
      const {error}=await db.from('v2_event_timers').delete().eq('id',t.id);
      if(error)return toast(error.message);
      toast('Scadenza eliminata');
      await loadTimersForSelectedEvent();
    };

    actions.append(edit,del);
    row.append(info,actions);
    list.append(row);
  });
}

function resetTimerForm(){
  $('timerLabelInput').value='';
  $('timerDeadlineInput').value='';
  renderTimerCategoryChecks();
  delete $('saveTimerBtn').dataset.editId;
  $('saveTimerBtn').textContent='Salva scadenza';
}

async function refreshTimerSetup(){
  const sel=$('timerEventSelect');
  const catBox=$('timerCategoryChecks');
  if(!sel||!catBox)return;

  const {data:{session}}=await db.auth.getSession();
  if(!session)return;

  const {data:adminOk,error:adminError}=await db.rpc('v2_is_admin');
  if(adminError||adminOk!==true)return;

  sel.innerHTML='<option>Caricamento gare...</option>';
  catBox.innerHTML='<p class="muted">Caricamento categorie...</p>';

  await fetchTimerSetupData();
  populateTimerEventSelect();
  await loadTimerCategoriesForSelectedEvent();
  await loadTimersForSelectedEvent();
}

$('timerEventSelect')?.addEventListener('change',async()=>{
  timerEventId=$('timerEventSelect').value||null;
  resetTimerForm();
  await loadTimerCategoriesForSelectedEvent();
  await loadTimersForSelectedEvent();
});

$('timerSelectAllBtn')?.addEventListener('click',()=>{
  document.querySelectorAll('#timerCategoryChecks input[type="checkbox"]')
    .forEach(x=>x.checked=true);
});

$('timerClearAllBtn')?.addEventListener('click',()=>{
  document.querySelectorAll('#timerCategoryChecks input[type="checkbox"]')
    .forEach(x=>x.checked=false);
});

$('saveTimerBtn').onclick=async()=>{
  const eventId=$('timerEventSelect')?.value;
  if(!eventId)return toast('Seleziona una gara');

  const deadline=$('timerDeadlineInput').value;
  if(!deadline)return toast('Inserisci data e ora della scadenza');

  const categories=selectedTimerCategories();
  if(!categories.length)return toast('Seleziona almeno una categoria');

  const row={
    event_id:eventId,
    label:$('timerLabelInput').value.trim()||'Scadenza categoria',
    deadline:new Date(deadline).toISOString(),
    categories
  };

  const editId=$('saveTimerBtn').dataset.editId;
  const q=editId
    ? db.from('v2_event_timers').update(row).eq('id',editId)
    : db.from('v2_event_timers').insert(row);

  const {error}=await q;
  if(error)return toast(error.message);

  toast(editId?'Scadenza aggiornata':'Scadenza salvata');
  resetTimerForm();
  await loadTimersForSelectedEvent();
};

// Il caricamento viene fatto direttamente da Supabase ogni volta che si apre la scheda.
document.querySelector('[data-tab="timers"]')?.addEventListener('click',()=>{
  setTimeout(()=>refreshTimerSetup(),30);
});

// Nessun caricamento automatico prima dell'autenticazione:
 // le scadenze vengono caricate solo dopo login Admin o quando si apre la scheda.
