import { db } from './supabase.js';
import { WHATSAPP_NUMBER } from './config.js';
import { toast, formatDate } from './ui.js';

let events=[],currentEvent=null,athletes=[],registrations=[],timers=[],configRows=[];
let selectedRegistrationIds=new Set();
let registrationsSort=localStorage.getItem('juvenilia_registrations_sort')||'name';

const $=id=>document.getElementById(id);
const clean=v=>String(v??'').trim();

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
  if(name==='history')loadHistory();
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
  await loadEvents(); await Promise.all([loadAthletes(),loadRegistrations(),loadTimers(),loadConfig()]);renderStats();

  populateTimerEventSelect();
  renderTimerCategoryChecks();
}
const linkedEventSelectIds=['eventSelect','registrationsEventSelect','configEventSelect','advancedEventSelect','exportEventSelect'];

function populateLinkedEventSelects(selectedId=currentEvent?.id||''){
  linkedEventSelectIds.forEach(id=>{
    const sel=$(id);
    if(!sel)return;
    sel.replaceChildren();
    events.forEach(e=>{
      const o=document.createElement('option');
      o.value=e.id;
      o.textContent=e.title+(e.is_archived?' — ARCHIVIATA':'');
      sel.append(o);
    });
    if(selectedId&&events.some(e=>e.id===selectedId))sel.value=selectedId;
  });
}

async function selectAdminEvent(eventId,{reload=true}={}){
  const found=events.find(e=>e.id===eventId);
  if(!found)return;
  currentEvent=found;
  populateLinkedEventSelects(found.id);
  $('saveEventBtn').textContent='Salva modifiche';
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
  const selected=events.find(e=>e.id===preferredId)||events[0]||null;
  currentEvent=selected;
  populateLinkedEventSelects(selected?.id||'');
  fillEvent();
  updatePublicEventLink();
}

$('eventSelect').onchange=async()=>selectAdminEvent($('eventSelect').value);
['registrationsEventSelect','configEventSelect','advancedEventSelect','exportEventSelect'].forEach(id=>{
  const sel=$(id);
  if(sel)sel.onchange=async()=>selectAdminEvent(sel.value);
});
function fillEvent(){const e=currentEvent||{};$('eventTitleInput').value=e.title||'';$('eventSlugInput').value=e.slug||'';$('eventDescriptionInput').value=e.description||'';$('eventDeadlineInput').value=localDate(e.registration_deadline);$('eventPublishedInput').checked=!!e.is_published;$('eventArchivedInput').checked=!!e.is_archived}
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
  fillEvent();
  updatePublicEventLink();
  $('eventSlugInput').dataset.auto='1';
  $('saveEventBtn').textContent='Crea gara';
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
  const row={title:title,slug:finalSlug,description:$('eventDescriptionInput').value.trim()||null,registration_deadline:$('eventDeadlineInput').value?new Date($('eventDeadlineInput').value).toISOString():null,is_published:$('eventPublishedInput').checked,is_archived:$('eventArchivedInput').checked};if(!row.title)return toast('Il titolo della gara è obbligatorio');
  if(!row.slug)return toast('Lo slug non è valido. Usa lettere, numeri e trattini.');const creating=!currentEvent;
  const q=creating
    ? db.from('v2_events').insert(row).select().single()
    : db.from('v2_events').update(row).eq('id',currentEvent.id).select().single();
  const {data:saved,error}=await q;
  if(error)return toast(error.message);
  toast(creating?'Gara creata':'Modifiche salvate');

  if(creating && saved?.id){
    const {data:activeAthletes,error:athletesError}=await db
      .from('v2_athletes')
      .select('id')
      .eq('is_active',true);

    if(athletesError){
      toast('Gara creata, ma non riesco a caricare gli atleti attivi: '+athletesError.message);
    }else if(activeAthletes?.length){
      const rows=activeAthletes.map(a=>({
        event_id:saved.id,
        athlete_id:a.id,
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

  await loadEvents();
  if(saved){
    currentEvent=events.find(e=>e.id===saved.id)||saved;
    $('eventSelect').value=saved.id;
    $('saveEventBtn').textContent='Salva modifiche';
    $('eventSlugInput').dataset.auto='0';
    fillEvent();
  }
  await Promise.all([loadAthletes(),loadRegistrations(),loadTimers(),loadConfig()]);
  renderStats()};

async function loadAthletes(){const {data,error}=await db.from('v2_athletes').select('*').order('full_name');if(error)return toast(error.message);athletes=data||[];renderAthletes()}
function renderAthletes(){
  $('athletesBody').replaceChildren();
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

    const saveCategory=document.createElement('button');saveCategory.textContent='Salva categoria';saveCategory.className='secondary';
    saveCategory.onclick=async()=>{
      const category=clean(catSelect.value).toUpperCase();
      if(!category)return toast('Seleziona una categoria');
      if(category===a.category)return toast('Categoria già impostata');
      const {error}=await db.from('v2_athletes').update({category}).eq('id',a.id);
      if(error)return toast('Errore modifica categoria: '+error.message);
      toast(`Categoria di ${a.full_name} aggiornata`);
      await loadAthletes();await loadRegistrations();
      document.dispatchEvent(new CustomEvent('juvenilia:athletes-changed'));
    };

    const toggle=document.createElement('button');toggle.textContent=a.is_active?'Disattiva':'Riattiva';toggle.className=a.is_active?'danger':'';
    toggle.onclick=async()=>{
      const becomingActive=!a.is_active;
      const {error}=await db.from('v2_athletes').update({is_active:becomingActive}).eq('id',a.id);
      if(error)return toast(error.message);
      if(becomingActive){
        const {data:n,error:syncError}=await db.rpc('v2_sync_active_athlete_to_events',{p_athlete_id:a.id});
        if(syncError)return toast('Atleta riattivato, ma sincronizzazione gare non riuscita: '+syncError.message);
        toast(`Atleta riattivato: aggiunto a ${n||0} gare attive`);
      }
      await loadAthletes();await loadRegistrations();
      document.dispatchEvent(new CustomEvent('juvenilia:athletes-changed'));
    };

    const del=document.createElement('button');del.textContent='Elimina atleta';del.className='danger';
    del.onclick=async()=>{
      if(!confirm(`Eliminare definitivamente "${a.full_name}"?\n\nVerranno eliminate anche tutte le sue iscrizioni collegate alle gare.`))return;
      if(!confirm(`ULTIMA CONFERMA\n\nSei sicuro di voler eliminare definitivamente "${a.full_name}"?\n\nQuesta operazione non può essere annullata.`))return;
      const {error}=await db.from('v2_athletes').delete().eq('id',a.id);
      if(error)return toast('Errore eliminazione atleta: '+error.message);
      toast('Atleta eliminato definitivamente');await loadAthletes();await loadRegistrations();renderStats();
      document.dispatchEvent(new CustomEvent('juvenilia:athletes-changed'));
    };
    td.append(saveCategory,toggle,del);tr.append(td);$('athletesBody').append(tr);
  });
}
$('addAthleteBtn').onclick=async()=>{const row={full_name:$('athleteName').value.trim().toUpperCase(),category:$('athleteCategory').value.trim().toUpperCase(),gender:$('athleteGender').value||null};if(!row.full_name||!row.category)return toast('Nome e categoria obbligatori');const {error}=await db.from('v2_athletes').insert(row);if(error)return toast(error.message);$('athleteName').value='';toast('Atleta aggiunto');await loadAthletes()};

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
    [r.athlete?.full_name||'',r.category_override||r.athlete?.category||'',r.status,r.companion_name||'',r.is_locked?'Sì':'No'].forEach(v=>{const td=document.createElement('td');td.textContent=v;tr.append(td)});
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
$('enrollAllBtn').onclick=async()=>{if(!currentEvent)return toast('Seleziona una gara');const existing=new Set(registrations.map(r=>r.athlete_id)),rows=athletes.filter(a=>a.is_active&&!existing.has(a.id)).map(a=>({event_id:currentEvent.id,athlete_id:a.id}));if(!rows.length)return toast('Tutti gli atleti attivi sono già presenti');const {error}=await db.from('v2_event_registrations').insert(rows);if(error)return toast(error.message);toast(`${rows.length} atleti aggiunti`);await loadRegistrations()};
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
};

function categoryOf(r){return r.category_override||r.athlete?.category||''}
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
      .select('id,title,is_published,is_archived,created_at')
      .eq('is_archived',false)
      .order('created_at',{ascending:false}),
    db.rpc('v2_admin_list_active_categories')
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

  const previous=timerEventId||sel.value||currentEvent?.id||'';
  sel.replaceChildren();

  if(!timerEvents.length){
    const o=document.createElement('option');
    o.value='';
    o.textContent='Nessuna gara disponibile';
    sel.append(o);
    timerEventId=null;
    return;
  }

  timerEvents.forEach(e=>{
    const o=document.createElement('option');
    o.value=e.id;
    o.textContent=e.title+(e.is_published?'':' (non pubblicata)');
    sel.append(o);
  });

  if(previous && timerEvents.some(e=>e.id===previous)){
    sel.value=previous;
  }else{
    sel.selectedIndex=0;
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
  renderTimerCategoryChecks();
  await loadTimersForSelectedEvent();
}

$('timerEventSelect')?.addEventListener('change',async()=>{
  timerEventId=$('timerEventSelect').value||null;
  resetTimerForm();
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


// Storico gare e partecipazione atleti
let historyRegistrations=[],historyConfig=[];
function historyEventStatus(e){
  if(e.is_archived)return {key:'archived',label:'ARCHIVIATA'};
  if(e.is_published)return {key:'published',label:'PUBBLICATA'};
  return {key:'draft',label:'NON PUBBLICATA'};
}
function historyEventDays(eventId){
  const row=historyConfig.find(x=>x.event_id===eventId&&x.key==='event_days');
  const days=Array.isArray(row?.value)?row.value:[];
  return days.filter(Boolean).join(' · ')||'—';
}
function addHistoryCell(tr,label,value,className=''){
  const td=document.createElement('td');td.dataset.label=label;if(className)td.className=className;
  if(value instanceof Node)td.append(value);else td.textContent=value;tr.append(td);return td;
}
async function loadHistory(){
  if(!$('historyEventsBody'))return;
  const [{data:ev,error:ee},{data:rr,error:re},{data:cc,error:ce}]=await Promise.all([
    db.from('v2_events').select('*').order('created_at',{ascending:false}),
    db.from('v2_event_registrations').select('id,event_id,athlete_id,status,athlete:v2_athletes(id,full_name,category,is_active)'),
    db.from('v2_event_config').select('event_id,key,value').eq('key','event_days')
  ]);
  if(ee||re||ce)return toast((ee||re||ce).message);
  events=ev||events;historyRegistrations=rr||[];historyConfig=cc||[];
  renderHistoryEvents();renderHistoryAthletes();
}
function renderHistoryEvents(){
  const body=$('historyEventsBody');if(!body)return;body.replaceChildren();
  const q=clean($('historyEventSearch')?.value).toLocaleLowerCase('it');const filter=$('historyEventFilter')?.value||'all';
  events.filter(e=>{
    const st=historyEventStatus(e);return (!q||e.title.toLocaleLowerCase('it').includes(q))&&(filter==='all'||st.key===filter);
  }).forEach(e=>{
    const regs=historyRegistrations.filter(r=>r.event_id===e.id),yes=regs.filter(r=>r.status==='yes').length,no=regs.filter(r=>r.status==='no').length,pending=regs.filter(r=>r.status==='pending').length;
    const tr=document.createElement('tr');addHistoryCell(tr,'Gara',e.title);addHistoryCell(tr,'Data gara',historyEventDays(e.id));
    const st=historyEventStatus(e),badge=document.createElement('span');badge.className=`history-status ${st.key}`;badge.textContent=st.label;addHistoryCell(tr,'Stato',badge);
    addHistoryCell(tr,'Partecipano',String(yes),'history-number');addHistoryCell(tr,'Non partecipano',String(no),'history-number');addHistoryCell(tr,'In attesa',String(pending),'history-number');addHistoryCell(tr,'Totale',String(regs.length),'history-number');
    const acts=document.createElement('div');acts.className='history-actions';
    const manage=document.createElement('button');manage.type='button';manage.textContent='Gestisci';manage.onclick=async()=>{await selectAdminEvent(e.id);openAdminTab('event')};acts.append(manage);
    if(e.is_published&&!e.is_archived){const pub=document.createElement('button');pub.type='button';pub.className='secondary';pub.textContent='Apri';pub.onclick=()=>window.open(`index.html?gara=${encodeURIComponent(e.slug)}`,'_blank','noopener');acts.append(pub)}
    addHistoryCell(tr,'Azioni',acts);body.append(tr);
  });
}
function renderHistoryAthletes(){
  const body=$('historyAthletesBody');if(!body)return;body.replaceChildren();
  const select=$('historyAthleteCategory');if(select&&select.options.length<=1){standardCategories.forEach(c=>{const o=document.createElement('option');o.value=c;o.textContent=c;select.append(o)})}
  const q=clean($('historyAthleteSearch')?.value).toLocaleLowerCase('it'),cat=select?.value||'all';
  const map=new Map();
  historyRegistrations.forEach(r=>{const a=r.athlete;if(!a)return;let x=map.get(a.id);if(!x){x={athlete:a,total:0,yes:0,no:0,pending:0};map.set(a.id,x)}x.total++;if(r.status==='yes')x.yes++;else if(r.status==='no')x.no++;else x.pending++});
  // Include anche atleti senza storico gare.
  athletes.forEach(a=>{if(!map.has(a.id))map.set(a.id,{athlete:a,total:0,yes:0,no:0,pending:0})});
  [...map.values()].filter(x=>(!q||x.athlete.full_name.toLocaleLowerCase('it').includes(q))&&(cat==='all'||clean(x.athlete.category).toUpperCase()===cat)).sort((a,b)=>b.yes-a.yes||a.athlete.full_name.localeCompare(b.athlete.full_name,'it')).forEach(x=>{
    const tr=document.createElement('tr');addHistoryCell(tr,'Atleta',x.athlete.full_name);addHistoryCell(tr,'Categoria',x.athlete.category||'—');addHistoryCell(tr,'Gare presenti',String(x.total),'history-number');addHistoryCell(tr,'Gare fatte',String(x.yes),'history-number');addHistoryCell(tr,'Non partecipate',String(x.no),'history-number');addHistoryCell(tr,'Senza risposta',String(x.pending),'history-number');
    const pct=x.total?Math.round(x.yes/x.total*100):0;addHistoryCell(tr,'Partecipazione',`${pct}%`,'history-percent');body.append(tr);
  });
}
$('historyEventsBtn')?.addEventListener('click',()=>{$('historyEventsBtn').classList.add('active');$('historyAthletesBtn').classList.remove('active');$('historyEventsPanel').classList.remove('hidden');$('historyAthletesPanel').classList.add('hidden')});
$('historyAthletesBtn')?.addEventListener('click',()=>{$('historyAthletesBtn').classList.add('active');$('historyEventsBtn').classList.remove('active');$('historyAthletesPanel').classList.remove('hidden');$('historyEventsPanel').classList.add('hidden')});
$('historyEventSearch')?.addEventListener('input',renderHistoryEvents);$('historyEventFilter')?.addEventListener('change',renderHistoryEvents);$('historyAthleteSearch')?.addEventListener('input',renderHistoryAthletes);$('historyAthleteCategory')?.addEventListener('change',renderHistoryAthletes);
