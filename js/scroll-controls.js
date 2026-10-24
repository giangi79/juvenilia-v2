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

window.addEventListener('touchstart',event=>{
  if(window.scrollY>0||event.touches.length!==1)return;
  pullStartY=event.touches[0].clientY;
  pullDistance=0;
  pullArmed=true;
},{passive:true});

window.addEventListener('touchmove',event=>{
  if(!pullArmed||event.touches.length!==1)return;
  pullDistance=event.touches[0].clientY-pullStartY;
  if(pullDistance<=0){pullArmed=false;return}
  if(pullDistance>=PULL_TO_REFRESH_DISTANCE)event.preventDefault();
},{passive:false});

window.addEventListener('touchend',()=>{
  if(!pullArmed)return;
  const shouldRefresh=pullDistance>=PULL_TO_REFRESH_DISTANCE&&window.scrollY===0;
  pullArmed=false;
  pullDistance=0;
  if(shouldRefresh)window.location.reload();
},{passive:true});

window.addEventListener('touchcancel',()=>{
  pullArmed=false;
  pullDistance=0;
},{passive:true});
