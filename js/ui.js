export function toast(message){
  const el=document.getElementById('toast'); if(!el)return;
  el.textContent=message; el.classList.add('show'); setTimeout(()=>el.classList.remove('show'),2600);
}
export function formatDate(value){
  if(!value)return 'Nessuna scadenza';
  return new Intl.DateTimeFormat('it-IT',{dateStyle:'medium',timeStyle:'short'}).format(new Date(value));
}
export function escapeText(v){ return String(v ?? ''); }
