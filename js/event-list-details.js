import { db } from './supabase.js';

const list=document.getElementById('eventsList');
let busy=false;

async function enrichEventCards(){
  if(busy||!list||list.classList.contains('hidden'))return;
  const cards=[...list.querySelectorAll('.event-card')];
  if(!cards.length)return;
  busy=true;
  try{
    const {data:events,error}=await db.rpc('v2_list_public_events');
    if(error||!Array.isArray(events))return;
    const details=await Promise.all(events.map(async e=>{
      const {data}=await db.rpc('v2_get_public_event',{p_slug:e.slug});
      return {slug:e.slug,title:e.title,config:data?.config||{}};
    }));
    cards.forEach((card,index)=>{
      card.querySelector('.event-list-place-date')?.remove();
      const title=card.querySelector('h2')?.textContent?.trim();
      const d=details[index]?.title===title?details[index]:details.find(x=>x.title===title);
      if(!d)return;
      const place=typeof d.config.event_location==='string'?d.config.event_location.trim():'';
      const date=typeof d.config.event_date_text==='string'?d.config.event_date_text.trim():'';
      if(!place&&!date)return;
      const box=document.createElement('div');box.className='event-list-place-date';
      if(place){const row=document.createElement('div');row.innerHTML='<i class="fas fa-location-dot" aria-hidden="true"></i>';const span=document.createElement('span');span.textContent=place;row.append(span);box.append(row)}
      if(date){const row=document.createElement('div');row.innerHTML='<i class="fas fa-calendar-days" aria-hidden="true"></i>';const span=document.createElement('span');span.textContent=date;row.append(span);box.append(row)}
      const deadline=card.querySelector('.event-meta');
      deadline?.insertAdjacentElement('beforebegin',box);
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
@media(max-width:620px){.event-list-place-date{flex-direction:column;gap:7px;margin:12px 0 9px}}
`;
document.head.append(style);
