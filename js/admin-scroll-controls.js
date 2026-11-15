const admin=document.getElementById('adminApp');
if(admin){
  const controls=document.createElement('div');
  controls.setAttribute('role','group');
  controls.setAttribute('aria-label','Navigazione pagina');
  controls.style.cssText='position:fixed;right:calc(12px + env(safe-area-inset-right, 0px));bottom:calc(12px + env(safe-area-inset-bottom, 0px));z-index:999;display:flex;flex-direction:column;gap:8px';
  const makeButton=(label,path,atBottom)=>{
    const button=document.createElement('button');
    button.type='button';button.setAttribute('aria-label',label);button.title=label;
    button.style.cssText='display:grid;place-items:center;box-sizing:border-box;width:44px;height:44px;padding:8px;border:1px solid #a4c9e3;border-radius:50%;background:#16558b;color:white;box-shadow:0 3px 12px #0005;cursor:pointer';
    button.innerHTML='<svg aria-hidden="true" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.8" stroke-linecap="round" stroke-linejoin="round"><path d="'+path+'"/><path d="M12 4v16"/></svg>';
    button.addEventListener('click',()=>window.scrollTo({top:atBottom?Math.max(document.documentElement.scrollHeight,document.body.scrollHeight):0,behavior:'smooth'}));
    return button;
  };
  controls.append(makeButton('Vai in cima','m5 14 7-7 7 7',false),makeButton('Vai in fondo','m5 10 7 7 7-7',true));
  const syncPosition=()=>{
    const dock=document.getElementById('adminMobileSaveDock');
    const rect=dock?.getBoundingClientRect();
    const visible=rect&&rect.width>0&&rect.height>0&&rect.top<window.innerHeight&&rect.bottom>0;
    controls.style.bottom=visible
      ? Math.max(12,Math.ceil(window.innerHeight-rect.top+12))+'px'
      : 'calc(12px + env(safe-area-inset-bottom, 0px))';
  };
  let observedDock=null;
  const resizeObserver=typeof ResizeObserver==='function'?new ResizeObserver(syncPosition):null;
  const observeDock=()=>{
    const dock=document.getElementById('adminMobileSaveDock');
    if(dock!==observedDock){
      if(observedDock)resizeObserver?.unobserve(observedDock);
      observedDock=dock;
      if(dock)resizeObserver?.observe(dock);
    }
    syncPosition();
  };
  const syncVisibility=()=>{
    controls.style.display=admin.classList.contains('hidden')?'none':'flex';
    observeDock();
  };
  new MutationObserver(syncVisibility).observe(admin,{attributes:true,attributeFilter:['class']});
  new MutationObserver(records=>{
    if(records.some(record=>record.type==='childList'||record.target.id==='adminMobileSaveDock'))observeDock();
  }).observe(document.body,{childList:true,subtree:true,attributes:true,attributeFilter:['class','style']});
  window.addEventListener('resize',syncPosition);
  window.visualViewport?.addEventListener('resize',syncPosition);
  syncVisibility();document.body.append(controls);
}
