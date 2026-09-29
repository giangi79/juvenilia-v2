import { db } from './supabase.js';

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

function renderActions(card,event,config,registrations){
  card.querySelector('.event-card-actions')?.remove();
  card.querySelector('.event-card-attendees')?.remove();
  card.querySelector(':scope > button')?.remove();

  const actions=document.createElement('div');actions.className='event-card-actions';
  const registrationUrl='?gara='+encodeURIComponent(event.slug);
  actions.append(actionLink('Iscrivi atleta','fa-user-plus',registrationUrl));

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
      const date=typeof detail.config.event_date_text==='string'?detail.config.event_date_text.trim():'';
      if(place||date){
        const box=document.createElement('div');box.className='event-list-place-date';
        if(place){const row=document.createElement('div');row.innerHTML='<i class="fas fa-location-dot" aria-hidden="true"></i>';const span=document.createElement('span');span.textContent=place;row.append(span);box.append(row)}
        if(date){const row=document.createElement('div');row.innerHTML='<i class="fas fa-calendar-days" aria-hidden="true"></i>';const span=document.createElement('span');span.textContent=date;row.append(span);box.append(row)}
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
.event-card-actions{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px;margin-top:18px;padding-top:16px;border-top:1px solid rgba(255,255,255,.28)}
.event-card-action{display:flex;align-items:center;justify-content:center;gap:8px;min-height:46px;padding:10px 12px;border:1px solid rgba(255,255,255,.72);border-radius:999px;background:rgba(16,91,171,.34);color:#fff;text-align:center;text-decoration:none;font:inherit;font-weight:800;cursor:pointer}
.event-card-action:hover:not(.is-disabled):not(:disabled),.event-card-action:focus-visible{background:#0878cf;color:#fff;filter:none}
.event-card-action.is-open{background:#0878cf}
.event-card-action.is-disabled,.event-card-action:disabled{opacity:.38;cursor:default}
.event-card-attendees{margin-top:12px;padding:12px;border:1px solid rgba(255,255,255,.25);border-radius:13px;background:rgba(5,26,43,.5)}
.event-card-attendees ul{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:7px;margin:0;padding:0;list-style:none}
.event-card-attendees li{display:flex;justify-content:space-between;gap:10px;padding:8px 9px;border-radius:8px;background:rgba(255,255,255,.08)}
.event-card-attendees li span{color:#b9d5e8;font-size:.78rem;text-align:right}
.event-card-attendees p{margin:0}
@media(max-width:620px){.event-list-place-date{flex-direction:column;gap:7px;margin:12px 0 9px}.event-card-actions{gap:8px}.event-card-action{min-height:44px;padding:9px 8px;font-size:.9rem}.event-card-attendees ul{grid-template-columns:1fr}}
`;
document.head.append(style);
