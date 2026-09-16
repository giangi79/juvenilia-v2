const topBtn=document.getElementById('scrollTopBtn');
if(topBtn){
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
  bottomBtn.innerHTML='<i class="fas fa-arrow-down" aria-hidden="true"></i>';
  document.body.append(bottomBtn);
}
bottomBtn.onclick=()=>window.scrollTo({top:document.documentElement.scrollHeight,behavior:'smooth'});

/* Mantiene entrambi i controlli disponibili anche dopo render e scroll. */
window.addEventListener('scroll',()=>topBtn?.classList.add('visible'),{passive:true});
