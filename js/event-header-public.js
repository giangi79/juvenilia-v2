import { db } from './supabase.js';

function slug(){const p=new URLSearchParams(location.search);return p.get('gara')||p.get('event')||null}
function hidePublicPayment(){const box=document.getElementById('paymentBox');if(box){box.replaceChildren();box.classList.add('hidden');box.setAttribute('aria-hidden','true')}}
let rendering=false,lastSlug='',lastLocation='',lastDate='';

function headerIsCorrect(){
  const sub=document.getElementById('eventDescription');
  if(!sub)return false;
  const loc=sub.querySelector('.event-header-location')?.textContent?.trim()||'';
  const dat=sub.querySelector('.event-header-date')?.textContent?.trim()||'';
  return loc===lastLocation&&dat===lastDate&&(lastLocation||lastDate);
}

async function renderHeader(){
  hidePublicPayment();
  const s=slug();if(!s||rendering)return;
  rendering=true;
  try{
    const {data,error}=await db.rpc('v2_get_public_event',{p_slug:s});
    if(error||!data)return;
    const e=data.event||{},cfg=data.config||{};
    const title=document.getElementById('eventTitle');
    const sub=document.getElementById('eventDescription');
    const location=typeof cfg.event_location==='string'?cfg.event_location.trim():'';
    const dateText=typeof cfg.event_date_text==='string'?cfg.event_date_text.trim():'';
    lastSlug=s;lastLocation=location;lastDate=dateText;
    if(title)title.textContent=e.title||'Gara Juvenilia';
    if(sub){
      sub.replaceChildren();
      sub.className='event-place-date';
      if(location){const l=document.createElement('span');l.className='event-header-location';const i=document.createElement('i');i.className='fas fa-location-dot';i.setAttribute('aria-hidden','true');l.append(i,document.createTextNode(' '+location));sub.append(l)}
      if(dateText){const d=document.createElement('span');d.className='event-header-date';const i=document.createElement('i');i.className='fas fa-calendar-days';i.setAttribute('aria-hidden','true');d.append(i,document.createTextNode(' '+dateText));sub.append(d)}
    }
    hidePublicPayment();
  }finally{rendering=false}
}

function syncSoon(){setTimeout(()=>{if(slug()&&(!headerIsCorrect()||slug()!==lastSlug))renderHeader()},0)}

// app.js può sovrascrivere eventDescription dopo il caricamento RPC.
// Osserviamo direttamente quel nodo: funziona anche su Safari/iOS e nelle aperture SPA.
const sub=document.getElementById('eventDescription');
if(sub)new MutationObserver(()=>{if(!rendering)syncSoon()}).observe(sub,{childList:true,characterData:true,subtree:true});

const title=document.getElementById('eventTitle');
if(title)new MutationObserver(()=>{if(!rendering)syncSoon()}).observe(title,{childList:true,characterData:true,subtree:true});

document.addEventListener('click',e=>{if(e.target.closest('.event-card button')){setTimeout(renderHeader,30);setTimeout(renderHeader,250)}},true);
window.addEventListener('popstate',()=>setTimeout(renderHeader,30));
document.addEventListener('juvenilia:public-event-rendered',renderHeader);
const paymentBox=document.getElementById('paymentBox');if(paymentBox)new MutationObserver(hidePublicPayment).observe(paymentBox,{childList:true,subtree:true});
setTimeout(renderHeader,50);setTimeout(renderHeader,500);setTimeout(renderHeader,1200);setTimeout(hidePublicPayment,900);

const style=document.createElement('style');style.textContent=`#paymentBox{display:none!important}.hero>div:first-child{min-width:0}.hero #eventTitle{margin-bottom:10px!important}.hero .event-place-date{display:flex!important;align-items:center;gap:9px 20px;flex-wrap:wrap;margin:0!important;min-height:28px;color:#fff!important;opacity:1!important;visibility:visible!important}.hero .event-place-date span{display:inline-flex!important;align-items:center;gap:8px;font-size:1rem;line-height:1.3;font-weight:800;color:#fff!important;opacity:1!important;visibility:visible!important}.hero .event-place-date i{color:#ffd166!important;font-size:.95em}@media(max-width:600px){.hero .event-place-date{display:flex!important;flex-direction:column;align-items:flex-start;gap:6px}.hero .event-place-date span{display:inline-flex!important;font-size:.92rem!important;color:#fff!important}}`;document.head.append(style);
