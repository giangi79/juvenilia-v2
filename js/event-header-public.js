import { db } from './supabase.js';

function slug(){const p=new URLSearchParams(location.search);return p.get('gara')||p.get('event')||null}
function hidePublicPayment(){const box=document.getElementById('paymentBox');if(box){box.replaceChildren();box.classList.add('hidden');box.setAttribute('aria-hidden','true')}}
let requestId=0,lastRenderedSlug='';

async function renderHeader(force=false){
  hidePublicPayment();
  const s=slug();
  if(!s)return;
  if(!force&&s===lastRenderedSlug&&document.querySelector('#eventDescription.event-place-date'))return;
  const myId=++requestId;
  const {data,error}=await db.rpc('v2_get_public_event',{p_slug:s});
  if(error||!data||myId!==requestId||s!==slug())return;
  const e=data.event||{},cfg=data.config||{};
  const title=document.getElementById('eventTitle');
  const sub=document.getElementById('eventDescription');
  if(title)title.textContent=e.title||'Gara Juvenilia';
  if(sub){
    sub.replaceChildren();
    sub.classList.add('event-place-date');
    const location=typeof cfg.event_location==='string'?cfg.event_location.trim():'';
    const dateText=typeof cfg.event_date_text==='string'?cfg.event_date_text.trim():'';
    if(location){const l=document.createElement('span');l.className='event-header-location';const i=document.createElement('i');i.className='fas fa-location-dot';i.setAttribute('aria-hidden','true');l.append(i,document.createTextNode(location));sub.append(l)}
    if(dateText){const d=document.createElement('span');d.className='event-header-date';const i=document.createElement('i');i.className='fas fa-calendar-days';i.setAttribute('aria-hidden','true');d.append(i,document.createTextNode(dateText));sub.append(d)}
  }
  lastRenderedSlug=s;
  hidePublicPayment();
}

// app.js apre le gare con history.pushState senza ricaricare la pagina.
// Intercettiamo il cambio URL direttamente: funziona anche su Safari/iPhone.
const nativePushState=history.pushState.bind(history);
history.pushState=function(...args){
  nativePushState(...args);
  lastRenderedSlug='';
  setTimeout(()=>renderHeader(true),0);
  setTimeout(()=>renderHeader(true),180);
};
const nativeReplaceState=history.replaceState.bind(history);
history.replaceState=function(...args){
  nativeReplaceState(...args);
  lastRenderedSlug='';
  setTimeout(()=>renderHeader(true),0);
};

window.addEventListener('popstate',()=>{lastRenderedSlug='';setTimeout(()=>renderHeader(true),0)});

// Ulteriore sincronizzazione: se app.js riscrive il sottotitolo dopo il nostro render,
// lo ripristiniamo immediatamente con luogo e data.
const sub=document.getElementById('eventDescription');
if(sub)new MutationObserver(()=>{
  if(slug()&&!sub.classList.contains('event-place-date')){lastRenderedSlug='';setTimeout(()=>renderHeader(true),0)}
}).observe(sub,{childList:true,characterData:true,subtree:true,attributes:true,attributeFilter:['class']});

const paymentBox=document.getElementById('paymentBox');
if(paymentBox)new MutationObserver(hidePublicPayment).observe(paymentBox,{childList:true,subtree:true});

setTimeout(()=>renderHeader(true),0);
setTimeout(()=>renderHeader(true),350);
setTimeout(hidePublicPayment,900);

const style=document.createElement('style');style.textContent=`#paymentBox{display:none!important}.hero>div:first-child{min-width:0}.hero #eventTitle{margin-bottom:10px!important}.hero .event-place-date{display:flex!important;align-items:center;gap:9px 20px;flex-wrap:wrap;margin:0!important;min-height:28px;color:#fff!important;opacity:1!important}.hero .event-place-date span{display:inline-flex;align-items:center;gap:8px;font-size:1rem;line-height:1.3;font-weight:800;color:#fff!important;opacity:1!important}.hero .event-place-date i{color:#ffd166!important;font-size:.95em}@media(max-width:600px){.hero .event-place-date{flex-direction:column;align-items:flex-start;gap:6px}.hero .event-place-date span{font-size:.92rem}}`;
document.head.append(style);
