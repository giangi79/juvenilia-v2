import { db } from './supabase.js';

function slug(){const p=new URLSearchParams(location.search);return p.get('gara')||p.get('event')||null}
function hidePublicPayment(){const box=document.getElementById('paymentBox');if(box){box.replaceChildren();box.classList.add('hidden');box.setAttribute('aria-hidden','true')}}
let rendering=false,lastSlug='';
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
    if(title&&title.textContent!==(e.title||'Gara Juvenilia'))title.textContent=e.title||'Gara Juvenilia';
    if(sub){
      sub.replaceChildren();sub.classList.add('event-place-date');
      const location=typeof cfg.event_location==='string'?cfg.event_location.trim():'';
      const dateText=typeof cfg.event_date_text==='string'?cfg.event_date_text.trim():'';
      if(location){const l=document.createElement('span');l.className='event-header-location';l.innerHTML='<i class="fas fa-location-dot" aria-hidden="true"></i> ';l.append(document.createTextNode(location));sub.append(l)}
      if(dateText){const d=document.createElement('span');d.className='event-header-date';d.innerHTML='<i class="fas fa-calendar-days" aria-hidden="true"></i> ';d.append(document.createTextNode(dateText));sub.append(d)}
      if(!location&&!dateText)sub.textContent='';
    }
    lastSlug=s;hidePublicPayment();
  }finally{rendering=false}
}

// L'apertura della gara usa pushState: aggiorna l'intestazione senza refresh.
document.addEventListener('click',e=>{if(e.target.closest('.event-card button')){setTimeout(renderHeader,0);setTimeout(renderHeader,120)}},true);

// Se app.js ridisegna il titolo, sincronizza subito anche luogo e data.
const title=document.getElementById('eventTitle');
if(title)new MutationObserver(()=>{const s=slug(),sub=document.getElementById('eventDescription');if(s&&(s!==lastSlug||!sub?.classList.contains('event-place-date')))setTimeout(renderHeader,0)}).observe(title,{childList:true,characterData:true,subtree:true});

window.addEventListener('popstate',()=>setTimeout(renderHeader,0));
document.addEventListener('juvenilia:public-event-rendered',renderHeader);
const paymentBox=document.getElementById('paymentBox');if(paymentBox)new MutationObserver(hidePublicPayment).observe(paymentBox,{childList:true,subtree:true});
setTimeout(renderHeader,0);setTimeout(renderHeader,300);setTimeout(hidePublicPayment,900);
const style=document.createElement('style');style.textContent=`#paymentBox{display:none!important}.hero>div:first-child{min-width:0}.hero #eventTitle{margin-bottom:10px!important}.hero .event-place-date{display:flex!important;align-items:center;gap:9px 20px;flex-wrap:wrap;margin:0!important;min-height:28px;color:#fff!important;opacity:1!important}.hero .event-place-date span{display:inline-flex;align-items:center;gap:8px;font-size:1rem;line-height:1.3;font-weight:800;color:#fff!important;opacity:1!important}.hero .event-place-date i{color:#ffd166!important;font-size:.95em}@media(max-width:600px){.hero .event-place-date{flex-direction:column;align-items:flex-start;gap:6px}.hero .event-place-date span{font-size:.92rem}}`;document.head.append(style);
