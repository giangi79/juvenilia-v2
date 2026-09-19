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
