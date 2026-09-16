import { db } from './supabase.js';

function slug(){const p=new URLSearchParams(location.search);return p.get('gara')||p.get('event')||null}
async function renderHeader(){
  const s=slug();if(!s)return;
  const {data,error}=await db.rpc('v2_get_public_event',{p_slug:s});
  if(error||!data)return;
  const e=data.event||{},cfg=data.config||{};
  const title=document.getElementById('eventTitle');
  const sub=document.getElementById('eventDescription');
  if(title)title.textContent=e.title||'Gara Juvenilia';
  if(sub){
    sub.replaceChildren();
    sub.classList.add('event-place-date');
    const location=typeof cfg.event_location==='string'?cfg.event_location.trim():'';
    const dateText=typeof cfg.event_date_text==='string'?cfg.event_date_text.trim():'';
    if(location){const l=document.createElement('span');l.className='event-header-location';l.innerHTML='<i class="fas fa-location-dot" aria-hidden="true"></i> ';l.append(document.createTextNode(location));sub.append(l)}
    if(dateText){const d=document.createElement('span');d.className='event-header-date';d.innerHTML='<i class="fas fa-calendar-days" aria-hidden="true"></i> ';d.append(document.createTextNode(dateText));sub.append(d)}
    if(!location&&!dateText)sub.textContent=e.description||'';
  }
}
window.addEventListener('popstate',()=>setTimeout(renderHeader,120));
setTimeout(renderHeader,350);
const style=document.createElement('style');style.textContent=`.event-place-date{display:flex!important;align-items:center;gap:10px 18px;flex-wrap:wrap;margin-top:8px!important}.event-place-date span{display:inline-flex;align-items:center;gap:7px;font-weight:800;color:#fff!important}.event-place-date i{color:#ffd166}@media(max-width:600px){.event-place-date{flex-direction:column;align-items:flex-start;gap:5px}.event-place-date span{font-size:.95rem}}`;document.head.append(style);
