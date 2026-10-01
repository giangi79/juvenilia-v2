import { db } from './supabase.js';

function raceDateDisplay(cfg){
  const parse=value=>{if(typeof value!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(value))return null;const d=new Date(value+'T12:00:00Z');return Number.isNaN(d.getTime())?null:d};
  const start=parse(cfg.event_start_date),end=parse(cfg.event_end_date)||start;
  if(!start||end<start)return {date:typeof cfg.event_date_text==='string'?cfg.event_date_text.trim():'',days:''};
  const format=d=>new Intl.DateTimeFormat('it-IT',{day:'numeric',month:'long',year:'numeric',timeZone:'UTC'}).format(d);
  const names=[],count=Math.round((end-start)/86400000)+1;
  for(let i=0;i<Math.min(count,366);i++){const d=new Date(start.getTime()+i*86400000);let name=new Intl.DateTimeFormat('it-IT',{weekday:'long',timeZone:'UTC'}).format(d);names.push(name[0].toUpperCase()+name.slice(1))}
  return {date:start.getTime()===end.getTime()?format(start):format(start)+' – '+format(end),days:names.join(' · ')};
}


const list=document.getElementById('eventsList');
let busy=false;

function safeUrl(value){
  const raw=String(value||'').trim();
  if(!raw)return '';
  try{
    const url=new URL(raw,location.href);
    return ['http:','https:'].includes(url.protocol)?url.href:'';
  }catch{return ''}
}

function programUrl(config){
  const direct=safeUrl(config.event_program_url);
  if(direct)return direct;
  return [config.document_1,config.document_2]
    .find(doc=>doc&&/programma/i.test(String(doc.text||''))&&safeUrl(doc.url))?.url||'';
}

function mapsUrl(config){
  const direct=safeUrl(config.event_maps_url);
  if(direct)return direct;
  const place=typeof config.event_location==='string'?config.event_location.trim():'';
  return place?'https://www.google.com/maps/search/?api=1&query='+encodeURIComponent(place):'';
}

function actionLink(label,icon,url,{external=false,disabled=false}={}){
  const element=disabled||!url?document.createElement('span'):document.createElement('a');
  element.className='event-card-action'+(disabled||!url?' is-disabled':'');
  element.innerHTML='<i class="fas '+icon+'" aria-hidden="true"></i><span>'+label+'</span>';
  if(element.tagName==='A'){
    element.href=url;
    if(external){element.target='_blank';element.rel='noopener noreferrer'}
  }else element.setAttribute('aria-disabled','true');
  return element;
}

function attendeePanel(registrations){
  const confirmed=(registrations||[]).filter(row=>row.status==='yes')
    .sort((a,b)=>String(a.full_name||'').localeCompare(String(b.full_name||''),'it'));
  const panel=document.createElement('div');panel.className='event-card-attendees hidden';
  if(!confirmed.length){
    const empty=document.createElement('p');empty.textContent='Nessun atleta confermato.';panel.append(empty);
    return {panel,count:0};
  }
  const ul=document.createElement('ul');
  confirmed.forEach(row=>{
    const li=document.createElement('li');
    const name=document.createElement('strong');name.textContent=row.full_name||'Atleta';
    const category=document.createElement('span');category.textContent=row.category||'—';
    li.append(name,category);ul.append(li);
  });
  panel.append(ul);
  return {panel,count:confirmed.length};
}

function openRegistrationDialog(event,registrations){
  const athletes=(registrations||[]).slice().sort((a,b)=>String(a.full_name||'').localeCompare(String(b.full_name||''),'it'));
  const dialog=document.createElement('dialog');
  dialog.className='quick-registration-dialog';
  dialog.innerHTML='<form method="dialog" class="quick-registration-card"><button class="quick-registration-close" value="cancel" aria-label="Chiudi">×</button><div class="section-kicker">ISCRIZIONE ATLETA</div><h2></h2><p class="quick-registration-help">Cerca per nome o numero gara, seleziona l’atleta e conferma la partecipazione.</p><label class="quick-registration-label">Nome atleta o numero gara<input type="search" autocomplete="off" placeholder="Nome atleta o numero gara"></label><div class="quick-registration-results" aria-live="polite"></div><p class="quick-registration-state" aria-live="polite"></p><div class="quick-registration-actions"><button type="button" class="quick-registration-confirm" disabled><i class="fas fa-check"></i> Conferma iscrizione</button></div></form>';
  dialog.querySelector('h2').textContent=event.title||'Gara';
  const input=dialog.querySelector('input');
  const results=dialog.querySelector('.quick-registration-results');
  const state=dialog.querySelector('.quick-registration-state');
  const confirmButton=dialog.querySelector('.quick-registration-confirm');
  let selected=null;
  const render=()=>{
    const query=input.value.trim().toLocaleLowerCase('it');
    results.replaceChildren();
    selected=null;confirmButton.disabled=true;state.textContent='';
    if(!query)return;
    const matches=athletes.filter(a=>{
      const name=String(a.full_name||'').toLocaleLowerCase('it');
      const number=String(a.race_number??'');
      return name.includes(query)||number.includes(query);
    }).slice(0,8);
    if(!matches.length){state.textContent='Nessun atleta trovato.';return}
    matches.forEach(athlete=>{
      const button=document.createElement('button');button.type='button';button.className='quick-registration-result';
      const name=document.createElement('strong');name.textContent=athlete.full_name||'Atleta';
      const details=document.createElement('span');details.textContent=[athlete.category,athlete.race_number!=null?'N. '+athlete.race_number:''].filter(Boolean).join(' · ');
      button.append(name,details);
      button.onclick=()=>{
        selected=athlete;input.value=athlete.full_name||'';
        [...results.children].forEach(item=>item.classList.remove('is-selected'));button.classList.add('is-selected');
        confirmButton.disabled=false;state.textContent='Selezionato/a: '+(athlete.full_name||'Atleta')+'.';
      };
      results.append(button);
    });
  };
  input.addEventListener('input',render);
  confirmButton.onclick=async()=>{
    if(!selected)return;
    confirmButton.disabled=true;state.textContent='Salvataggio iscrizione…';
    const {error}=await db.rpc('v2_set_registration_status',{p_event_slug:event.slug,p_athlete_id:selected.athlete_id,p_status:'yes'});
    if(error){state.textContent='Non è stato possibile confermare: '+error.message;confirmButton.disabled=false;return}
    state.textContent='Iscrizione confermata per '+(selected.full_name||'atleta')+'.';
    await enrichEventCards();
  };
  dialog.addEventListener('close',()=>dialog.remove());
  document.body.append(dialog);dialog.showModal();input.focus();
}

function renderActions(card,event,config,registrations){
  card.querySelector('.event-card-actions')?.remove();
  card.querySelector('.event-card-attendees')?.remove();
  card.querySelectorAll(':scope > button').forEach(button=>button.remove());

  const actions=document.createElement('div');actions.className='event-card-actions';
  const registrationButton=document.createElement('button');
  registrationButton.type='button';registrationButton.className='event-card-action';
  registrationButton.innerHTML='<i class="fas fa-user-plus" aria-hidden="true"></i><span>Iscrivi atleta</span>';
  registrationButton.onclick=()=>openRegistrationDialog(event,registrations);
  actions.append(registrationButton);
  actions.append(actionLink('Apri gara','fa-flag-checkered','?gara='+encodeURIComponent(event.slug)));

  const attendees=attendeePanel(registrations);
  const attendeesButton=document.createElement('button');
  attendeesButton.type='button';attendeesButton.className='event-card-action';
  attendeesButton.disabled=!attendees.count;
  attendeesButton.innerHTML='<i class="fas fa-users" aria-hidden="true"></i><span>Iscritti</span>';
  attendeesButton.setAttribute('aria-expanded','false');
  attendeesButton.addEventListener('click',()=>{
    const open=attendees.panel.classList.toggle('hidden')===false;
    attendeesButton.setAttribute('aria-expanded',String(open));
    attendeesButton.classList.toggle('is-open',open);
  });
  actions.append(attendeesButton);

  actions.append(actionLink('Programma','fa-file-lines',programUrl(config),{external:true}));
  actions.append(actionLink('Google Maps','fa-location-dot',mapsUrl(config),{external:true}));
  card.append(actions,attendees.panel);
}

async function enrichEventCards(){
  if(busy||!list||list.classList.contains('hidden'))return;
  const cards=[...list.querySelectorAll('.event-card')];
  if(!cards.length)return;
  busy=true;
  try{
    const {data:events,error}=await db.rpc('v2_list_public_events');
    if(error||!Array.isArray(events))return;
    const details=await Promise.all(events.map(async event=>{
      const {data}=await db.rpc('v2_get_public_event',{p_slug:event.slug});
      return {slug:event.slug,title:event.title,config:data?.config||{},registrations:data?.registrations||[]};
    }));
    cards.forEach((card,index)=>{
      card.querySelector('.event-list-place-date')?.remove();
      const title=card.querySelector('h2')?.textContent?.trim();
      const detail=details[index]?.title===title?details[index]:details.find(item=>item.title===title);
      if(!detail)return;
      const place=typeof detail.config.event_location==='string'?detail.config.event_location.trim():'';
      const {date,days}=raceDateDisplay(detail.config);
      if(place||date){
        const box=document.createElement('div');box.className='event-list-place-date';
        if(place){const row=document.createElement('div');row.innerHTML='<i class="fas fa-location-dot" aria-hidden="true"></i>';const span=document.createElement('span');span.textContent=place;row.append(span);box.append(row)}
        if(date){const row=document.createElement('div');row.innerHTML='<i class="fas fa-calendar-days" aria-hidden="true"></i>';const span=document.createElement('span');span.textContent=date;const stack=document.createElement('div');stack.append(span);if(days){const line=document.createElement('small');line.className='event-weekdays';line.textContent=days;stack.append(line)}row.append(stack);box.append(row)}
        const deadline=card.querySelector('.event-meta');
        deadline?.insertAdjacentElement('beforebegin',box);
      }
      renderActions(card,detail,detail.config,detail.registrations);
    });
  }finally{busy=false}
}

if(list)new MutationObserver(()=>setTimeout(enrichEventCards,30)).observe(list,{childList:true});
setTimeout(enrichEventCards,250);
setTimeout(enrichEventCards,900);

const style=document.createElement('style');style.textContent=`
.event-list-place-date{display:flex;gap:10px 22px;flex-wrap:wrap;margin:14px 0 10px;color:#eaf4fb;font-weight:800}
.event-list-place-date>div{display:inline-flex;align-items:center;gap:8px;min-width:0}
.event-list-place-date i{color:#ffd166;width:18px;text-align:center}
.event-list-place-date span{overflow-wrap:anywhere}
.event-card-actions{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));grid-template-rows:55px;grid-auto-rows:48px;gap:10px;margin-top:18px;padding-top:16px;border-top:1px solid rgba(255,255,255,.28)}
.event-card-action{box-sizing:border-box;display:flex;align-items:center;justify-content:center;gap:8px;min-height:0;height:100%;width:100%;margin:0!important;padding:10px 12px;border:1px solid rgba(255,255,255,.72);border-radius:999px;background:rgba(16,91,171,.34);color:#fff;text-align:center;text-decoration:none;font:inherit;font-weight:800;cursor:pointer}
.event-card-action:hover:not(.is-disabled):not(:disabled),.event-card-action:focus-visible{background:#0878cf;color:#fff;filter:none}
.event-card-actions>.event-card-action:first-child{grid-column:1/-1;background:#ffd166;border-color:#ffe29b;color:#123c62;font-size:1.03rem;box-shadow:0 7px 17px rgba(0,0,0,.18)}
.event-card-actions>.event-card-action:first-child:hover,.event-card-actions>.event-card-action:first-child:focus-visible{background:#ffe29b;color:#0c355b}
.event-card-action.is-open{background:#0878cf}
.event-card-action.is-disabled,.event-card-action:disabled{opacity:.38;cursor:default}
.quick-registration-dialog{width:min(560px,calc(100vw - 28px));border:0;border-radius:20px;padding:0;background:transparent;color:#17324d;box-shadow:0 28px 70px rgba(0,0,0,.38)}
.quick-registration-dialog::backdrop{background:rgba(4,18,32,.65);backdrop-filter:blur(3px)}
.quick-registration-card{position:relative;padding:26px;background:#fff;border-radius:20px;margin:0}
.quick-registration-card h2{margin:5px 34px 8px 0;color:#103e68;font-size:1.3rem}.quick-registration-help{margin:0 0 18px;color:#52687a}.quick-registration-close{position:absolute;right:14px;top:12px;width:36px;height:36px;border:0;border-radius:50%;background:#edf3f7;color:#174a76;font-size:1.5rem;line-height:1;cursor:pointer}.quick-registration-label{display:grid;gap:6px;font-weight:800;color:#183b59}.quick-registration-label input{width:100%;box-sizing:border-box;padding:12px;border:1px solid #a9bdcb;border-radius:11px;font:inherit}.quick-registration-results{display:grid;gap:7px;margin-top:11px;max-height:270px;overflow:auto}.quick-registration-result{display:grid;gap:3px;text-align:left;padding:11px 13px;border:1px solid #d3e0e8;border-radius:11px;background:#fff;color:#183b59;font:inherit;cursor:pointer}.quick-registration-result span{font-size:.82rem;color:#60798c}.quick-registration-result:hover,.quick-registration-result.is-selected{border-color:#0b72bd;background:#edf7ff}.quick-registration-state{min-height:1.3em;margin:11px 0;color:#164f7d;font-weight:700}.quick-registration-actions{display:flex;justify-content:flex-end;gap:9px;flex-wrap:wrap}.quick-registration-actions button{min-height:43px;width:100%}.quick-registration-confirm:disabled{opacity:.55;cursor:not-allowed}@media(max-width:500px){.quick-registration-card{padding:22px 17px}.quick-registration-actions{display:grid;grid-template-columns:1fr}.quick-registration-actions button{width:100%}}
.event-card-attendees{margin-top:12px;padding:12px;border:1px solid rgba(255,255,255,.25);border-radius:13px;background:rgba(5,26,43,.5)}
.event-card-attendees ul{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:7px;margin:0;padding:0;list-style:none}
.event-card-attendees li{display:flex;justify-content:space-between;gap:10px;padding:8px 9px;border-radius:8px;background:rgba(255,255,255,.08)}
.event-card-attendees li span{color:#b9d5e8;font-size:.78rem;text-align:right}
.event-card-attendees p{margin:0}
@media(max-width:620px){.event-list-place-date{flex-direction:column;gap:7px;margin:12px 0 9px}.event-card-actions{gap:8px}.event-card-action{min-height:44px;padding:9px 8px;font-size:.9rem}.event-card-attendees ul{grid-template-columns:1fr}}
`;
document.head.append(style);
