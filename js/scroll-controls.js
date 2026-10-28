const arrowSvg=direction=>`<svg xmlns="http://www.w3.org/2000/svg" width="25" height="25" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m5 ${direction==='up'?'14 7-7 7 7':'10 7 7 7-7'}"/><path d="M12 4v16"/></svg>`;
const topBtn=document.getElementById('scrollTopBtn');
if(topBtn){
  topBtn.innerHTML=arrowSvg('up');
  topBtn.classList.add('visible');
  topBtn.onclick=()=>window.scrollTo({top:0,behavior:'smooth'});
}

let bottomBtn=document.getElementById('scrollBottomBtn');
if(!bottomBtn){
  bottomBtn=document.createElement('button');
  bottomBtn.id='scrollBottomBtn';
  bottomBtn.className='scroll-bottom-btn';
  bottomBtn.type='button';
  bottomBtn.setAttribute('aria-label','Vai in fondo alla pagina');
  bottomBtn.title='Vai in fondo';
  document.body.append(bottomBtn);
}
bottomBtn.innerHTML=arrowSvg('down');
bottomBtn.onclick=()=>window.scrollTo({top:document.documentElement.scrollHeight,behavior:'smooth'});

/* Mantiene entrambi i controlli disponibili anche dopo render e scroll. */
window.addEventListener('scroll',()=>topBtn?.classList.add('visible'),{passive:true});


// Aggiornamento con trascinamento verso il basso, come nel browser.
let pullStartY=0;
let pullDistance=0;
let pullArmed=false;
const PULL_TO_REFRESH_DISTANCE=78;
const isAtTop=()=>Math.max(0,window.scrollY||0,document.documentElement?.scrollTop||0,document.body?.scrollTop||0)<=1;

// Indicatore visivo dell'aggiornamento tramite trascinamento.
const pullHint=document.createElement('div');
pullHint.className='pull-refresh-hint';
pullHint.setAttribute('aria-live','polite');
pullHint.innerHTML='<i class="fas fa-arrow-down" aria-hidden="true"></i><span>Trascina per aggiornare</span>';
document.body.append(pullHint);
const updatePullHint=distance=>{
  if(distance<=0){pullHint.classList.remove('visible','ready');return}
  const ready=distance>=PULL_TO_REFRESH_DISTANCE;
  pullHint.classList.add('visible');
  pullHint.classList.toggle('ready',ready);
  pullHint.querySelector('span').textContent=ready?'Rilascia per aggiornare':'Trascina per aggiornare';
};
const clearPullHint=()=>pullHint.classList.remove('visible','ready');
const pullHintStyle=document.createElement('style');
pullHintStyle.textContent='.pull-refresh-hint{position:fixed;z-index:1000;top:12px;left:50%;display:flex;align-items:center;gap:8px;padding:9px 14px;border-radius:999px;background:#123c62;color:#fff;box-shadow:0 7px 18px rgba(0,0,0,.22);font-size:.86rem;font-weight:800;pointer-events:none;opacity:0;transform:translate(-50%,-18px);transition:opacity .16s,transform .16s}.pull-refresh-hint.visible{opacity:1;transform:translate(-50%,0)}.pull-refresh-hint.ready{background:#0878cf}.pull-refresh-hint i{transition:transform .16s}.pull-refresh-hint.ready i{transform:rotate(180deg)}';
document.head.append(pullHintStyle);


window.addEventListener('touchstart',event=>{
  if(!isAtTop()||event.touches.length!==1)return;
  pullStartY=event.touches[0].clientY;
  pullDistance=0;
  pullArmed=true;
},{passive:true});

window.addEventListener('touchmove',event=>{
  if(!pullArmed||event.touches.length!==1)return;
  pullDistance=event.touches[0].clientY-pullStartY;
  if(pullDistance<=0){pullArmed=false;clearPullHint();return}
  updatePullHint(pullDistance);
  if(pullDistance>=PULL_TO_REFRESH_DISTANCE)event.preventDefault();
},{passive:false});

window.addEventListener('touchend',()=>{
  if(!pullArmed)return;
  const shouldRefresh=pullDistance>=PULL_TO_REFRESH_DISTANCE&&isAtTop();
  pullArmed=false;
  pullDistance=0;
  clearPullHint();
  if(shouldRefresh)window.location.reload();
},{passive:true});

window.addEventListener('touchcancel',()=>{
  pullArmed=false;
  pullDistance=0;
  clearPullHint();
},{passive:true});
