const $=id=>document.getElementById(id);

const groups={
  event:{button:'saveEventBtn',label:'Salva gara'},
  config:{button:'saveConfigBtn',label:'Salva configurazione'},
  advanced:{button:'advSaveConfigBtn',label:'Salva impostazioni'}
};

const eventFields=new Set(['eventTitleInput','eventSlugInput','eventDeadlineInput','eventDescriptionInput','eventPublishedInput','eventArchivedInput','eventSeasonInput','eventLocationInput','eventDateTextInput']);
const configFields=new Set(['cfgSubtitle','cfgInfoVisible','cfgCompanion','cfgInfoEditor','cfgDoc1Text','cfgDoc1Url','cfgDoc2Text','cfgDoc2Url','cfgInfoTextColor','cfgInfoBgColor']);
const advancedFields=new Set(['advDayA','advDayB','advDayC','advShowCosts','advPayHolder','advPayIban','advPayReason','advPayEmail']);
const states={event:'idle',config:'idle',advanced:'idle'};

function hasSelectedEvent(){return !!$('eventSelect')?.value}
function ensureState(group){
  const button=$(groups[group].button);
  if(!button)return null;
  let state=$(`${group}SaveState`);
  if(!state){
    state=document.createElement('span');
    state.id=`${group}SaveState`;
    state.className='admin-save-state';
    state.setAttribute('role','status');
    state.setAttribute('aria-live','polite');
    button.insertAdjacentElement('afterend',state);
  }
  return state;
}
function setState(group,state){
  const button=$(groups[group].button),status=ensureState(group);
  if(!button||!status)return;
  states[group]=state;
  status.className=`admin-save-state ${state}`;
  status.textContent=state==='dirty'?'Modifiche non salvate':state==='saved'?'Salvato ✓':'';
  button.disabled=state!=='dirty';
  updateMobileDock();
}
function markDirty(group){
  if(group==='event'&&!hasSelectedEvent()&&!($('saveEventBtn')?.textContent||'').toLowerCase().includes('crea'))return;
  if(group!=='event'&&!hasSelectedEvent())return;
  setState(group,'dirty');
}
function groupForTarget(target){
  if(!(target instanceof Element))return null;
  if(eventFields.has(target.id)||target.closest('#eventCategoriesChecks'))return'event';
  if(configFields.has(target.id))return'config';
  if(advancedFields.has(target.id)||target.closest('#advCosts'))return'advanced';
  return null;
}

document.addEventListener('input',event=>{const group=groupForTarget(event.target);if(group)markDirty(group)});
document.addEventListener('change',event=>{const group=groupForTarget(event.target);if(group)markDirty(group)});

['cfgInfoClearBtn','cfgClearDoc1Btn','cfgClearDoc2Btn'].forEach(id=>$(id)?.addEventListener('click',()=>setTimeout(()=>markDirty('config'),0)));
['advClearDaysBtn','advClearCostsBtn','advClearPaymentBtn'].forEach(id=>$(id)?.addEventListener('click',()=>setTimeout(()=>markDirty('advanced'),0)));
['selectAllEventCategories','clearEventCategories'].forEach(id=>$(id)?.addEventListener('click',()=>setTimeout(()=>markDirty('event'),0)));
$('newEventBtn')?.addEventListener('click',()=>setTimeout(()=>setState('event','idle'),0));

document.addEventListener('juvenilia:event-changed',()=>{
  setState('event','idle');
  setState('config','idle');
  setState('advanced','idle');
});
document.addEventListener('juvenilia:event-save-complete',()=>setState('event','saved'));
document.addEventListener('juvenilia:config-save-complete',()=>setState('config','saved'));
document.addEventListener('juvenilia:advanced-save-complete',()=>setState('advanced','saved'));

const dock=document.createElement('div');
dock.id='adminMobileSaveDock';
dock.className='admin-mobile-save-dock';
dock.innerHTML='<span></span><button type="button"></button>';
document.body.append(dock);
const dockState=dock.querySelector('span'),dockButton=dock.querySelector('button');

function activeGroup(){
  if($('adminApp')?.classList.contains('hidden'))return null;
  const tab=document.querySelector('#tabs button.active')?.dataset.tab;
  if(tab==='event')return'event';
  if(tab!=='settings')return null;
  const panel=document.querySelector('.settings-choice.active')?.dataset.settingsPanel;
  return panel==='config'||panel==='advanced'?panel:null;
}
function updateMobileDock(){
  const group=activeGroup();
  document.body.dataset.adminSaveGroup=group||'';
  if(!group){dock.classList.remove('visible');return}
  dock.classList.add('visible');
  const state=states[group];
  dockState.textContent=state==='dirty'?'Modifiche non salvate':state==='saved'?'Salvato ✓':'Nessuna modifica';
  dockState.className=state;
  dockButton.textContent=groups[group].label;
  dockButton.disabled=state!=='dirty';
  dockButton.dataset.group=group;
}
dockButton.addEventListener('click',()=>{
  const group=dockButton.dataset.group;
  if(group)$(groups[group].button)?.click();
});
document.querySelectorAll('#tabs button,.settings-choice').forEach(button=>button.addEventListener('click',()=>setTimeout(updateMobileDock,0)));
window.addEventListener('resize',updateMobileDock);
if($('adminApp'))new MutationObserver(updateMobileDock).observe($('adminApp'),{attributes:true,attributeFilter:['class']});

Object.keys(groups).forEach(group=>setState(group,'idle'));
updateMobileDock();
