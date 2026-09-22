import { db } from './supabase.js';
import { toast } from './ui.js';
const $=id=>document.getElementById(id);
let costs={},regs=[],cfgRows=[];
const eventId=()=>$('eventSelect')?.value||null;
const cfg=(k,d=null)=>cfgRows.find(x=>x.key===k)?.value??d;
const CATEGORY_ORDER=['GIOVANISSIMI','ESORDIENTI','R12','RAGAZZI','ALLIEVI','JUNIOR','SENIOR'];

async function loadAdvanced(){
  if(!eventId()) return;
  const [c,r]=await Promise.all([
    db.from('v2_event_config').select('*').eq('event_id',eventId()),
    db.from('v2_event_registrations').select('*, athlete:v2_athletes(*)').eq('event_id',eventId())
  ]);
  if(c.error||r.error){toast((c.error||r.error).message);return}
  cfgRows=c.data||[];regs=r.data||[];
  const days=cfg('event_days',[]);$('advDayA').value=days[0]||'';$('advDayB').value=days[1]||'';$('advDayC').value=days[2]||'';
  costs={...cfg('category_costs',{})};renderCosts();$('advShowCosts').checked=cfg('show_category_costs',true)!==false;
  const pay=cfg('payment_info',{});$('advPayHolder').value=pay&&typeof pay==='object'?pay.holder||'':'';$('advPayIban').value=pay&&typeof pay==='object'?pay.iban||'':'';$('advPayReason').value=pay&&typeof pay==='object'?pay.reason||'':'';$('advPayEmail').value=pay&&typeof pay==='object'?pay.email||'':'';
  renderRegs();
}
function renderCosts(){
  const b=$('advCosts');
  b.replaceChildren();
  CATEGORY_ORDER.forEach(cat=>{
    const item=document.createElement('label');
    item.className='fixed-cost-item';

    const title=document.createElement('span');
    title.textContent=cat;

    const inp=document.createElement('input');
    inp.type='number';
    inp.min='0';
    inp.step='.50';
    inp.inputMode='decimal';
    inp.placeholder='0';
    inp.value=Number(costs[cat]||0) || '';
    inp.setAttribute('aria-label',`Quota ${cat}`);
    inp.oninput=()=>{
      const value=Number(inp.value||0);
      if(value>0) costs[cat]=value;
      else delete costs[cat];
    };

    item.append(title,inp);
    b.append(item);
  });
}
$('advSaveConfigBtn').onclick=async()=>{const days=[$('advDayA').value.trim(),$('advDayB').value.trim(),$('advDayC').value.trim()].filter(Boolean),pay={holder:$('advPayHolder').value.trim(),iban:$('advPayIban').value.trim().toUpperCase(),reason:$('advPayReason').value.trim(),email:$('advPayEmail').value.trim()};const rows=[['event_days',days],['category_costs',costs],['show_category_costs',$('advShowCosts').checked],['payment_info',pay]].map(([key,value])=>({event_id:eventId(),key,value,is_public:true}));const {error}=await db.from('v2_event_config').upsert(rows,{onConflict:'event_id,key'});if(error)return toast(error.message);toast('Dettagli gara salvati');await loadAdvanced()};
$('advClearDaysBtn').onclick=()=>{$('advDayA').value='';$('advDayB').value='';$('advDayC').value='';toast('Giornate azzerate: premi Salva per confermare')};
$('advClearCostsBtn').onclick=()=>{if(!confirm('Azzera tutte le quote della gara?'))return;costs={};renderCosts();toast('Quote azzerate: premi Salva per confermare')};
$('advClearPaymentBtn').onclick=()=>{if(!confirm('Azzera tutti i dati di pagamento?'))return;$('advPayHolder').value='';$('advPayIban').value='';$('advPayReason').value='';$('advPayEmail').value='';toast('Pagamento azzerato: premi Salva per confermare')};

async function updateReg(id,patch){const {error}=await db.from('v2_event_registrations').update(patch).eq('id',id);if(error)return toast(error.message);toast('Iscrizione aggiornata');await loadAdvanced()}
function renderRegs(){const body=$('advRegistrationsBody');body.replaceChildren();const days=cfg('event_days',[]);regs.sort((a,b)=>(a.athlete?.full_name||'').localeCompare(b.athlete?.full_name||'')).forEach(r=>{const tr=document.createElement('tr');const name=document.createElement('td');name.textContent=r.athlete?.full_name||'';tr.append(name);const ctd=document.createElement('td'),ci=document.createElement('select');ci.className='inline-select';[['','-'],...CATEGORY_ORDER.map(c=>[c,c])].forEach(([v,t])=>{const o=document.createElement('option');o.value=v;o.textContent=t;ci.append(o)});ci.value=r.category_override||r.category_snapshot||r.athlete?.category||'';ci.onchange=()=>updateReg(r.id,{category_override:ci.value||null});ctd.append(ci);tr.append(ctd);const dtd=document.createElement('td'),ds=document.createElement('select');ds.className='inline-select';[['','-'],...days.map(d=>[d,d])].forEach(([v,t])=>{const o=document.createElement('option');o.value=v;o.textContent=t;ds.append(o)});ds.value=r.race_day||'';ds.onchange=()=>updateReg(r.id,{race_day:ds.value||null});dtd.append(ds);tr.append(dtd);const std=document.createElement('td'),ss=document.createElement('select');[['pending','DA DEFINIRE'],['yes','PARTECIPA'],['no','NON PARTECIPA']].forEach(([v,t])=>{const o=document.createElement('option');o.value=v;o.textContent=t;ss.append(o)});ss.value=r.status;ss.onchange=()=>updateReg(r.id,{status:ss.value,responded_at:ss.value==='pending'?null:new Date().toISOString(),...(ss.value==='no'?{companion_name:null}:{})});std.append(ss);if(r.status==='no'&&r.auto_declined_at){const note=document.createElement('small');note.textContent='Nessuna risposta entro la scadenza';note.style.display='block';std.append(note)}tr.append(std);const atd=document.createElement('td'),ai=document.createElement('input');ai.className='inline-input';ai.value=r.companion_name||'';ai.onchange=()=>updateReg(r.id,{companion_name:ai.value.trim().toUpperCase()||null});atd.append(ai);tr.append(atd);const ltd=document.createElement('td'),lb=document.createElement('button');lb.textContent=r.is_locked?'Sblocca':'Blocca';lb.className=r.is_locked?'':'danger';lb.onclick=()=>updateReg(r.id,{is_locked:!r.is_locked});ltd.append(lb);tr.append(ltd);body.append(tr)})}
$('eventSelect')?.addEventListener('change',()=>setTimeout(loadAdvanced,50));
document.addEventListener('juvenilia:event-changed',()=>setTimeout(loadAdvanced,50));
document.querySelector('[data-settings-panel="advanced"]')?.addEventListener('click',loadAdvanced);
setTimeout(loadAdvanced,600);


document.addEventListener('juvenilia:athletes-changed',()=>setTimeout(loadAdvanced,50));

$('resetEventDefaultsBtn')?.addEventListener('click',async()=>{
  const id=eventId();if(!id)return toast('Seleziona una gara');
  const title=$('eventSelect')?.selectedOptions?.[0]?.textContent||'questa gara';
  if(!confirm(`Reset completo di "${title}"?\n\nVerranno azzerati scadenza generale, descrizione, configurazione, giornate, quote, pagamento, documenti, timer, scelte, accompagnatori e blocchi. La gara e l’archivio atleti resteranno esistenti.`))return;
  if(!confirm('ULTIMA CONFERMA\n\nSei sicuro di voler riportare questa gara alle impostazioni iniziali?'))return;
  const results=await Promise.all([
    db.from('v2_events').update({registration_deadline:null,description:null}).eq('id',id),
    db.from('v2_event_timers').delete().eq('event_id',id),
    db.from('v2_event_config').delete().eq('event_id',id),
    db.from('v2_event_registrations').update({status:'pending',companion_name:null,race_day:null,category_override:null,is_locked:false,responded_at:null}).eq('event_id',id)
  ]);
  const failed=results.find(x=>x.error);if(failed)return toast('Errore reset gara: '+failed.error.message);
  toast('Gara riportata alle impostazioni iniziali');setTimeout(()=>location.reload(),500);
});
