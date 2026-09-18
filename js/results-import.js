import { db } from './supabase.js';
import { toast } from './ui.js';

const $=id=>document.getElementById(id);
let analysis=null;
let creatingEvent=false;

function eventId(){return creatingEvent?'':$('eventSelect')?.value||''}
function cleanUrl(){return $('eventResultsUrl')?.value.trim()||''}
function displayedResult(row){
  if(String(row?.page_title||'').toLocaleUpperCase('it').includes('CLASSIFICA FINALE')){
    const position=String(row?.result_cells?.[0]||'').trim();
    if(/^\d+$/.test(position))return `${position}°`;
  }
  return row?.result_text||'Risultato disponibile';
}
function isFormulaTiezzi(row){return String(row?.page_title||'').toLocaleUpperCase('it').includes('FORMULA TIEZZI')}

function validUrl(value){
  try{const u=new URL(value);return u.protocol==='https:'&&u.hostname==='attivita.rollergames.it'}catch{return false}
}

async function refreshPanel(){
  const id=eventId(); analysis=null;
  $('resultsImportPreview')?.classList.add('hidden');
  $('savedResultsPanel')?.classList.add('hidden');
  $('saveAnalyzedResultsBtn')?.classList.add('hidden');
  if(!id)return;
  const [{data:event},{data:savedRows}]=await Promise.all([
    db.from('v2_events').select('results_url').eq('id',id).maybeSingle(),
    db.from('v2_event_results').select('page_title').eq('event_id',id)
  ]);
  const count=(savedRows||[]).filter(row=>!isFormulaTiezzi(row)).length;
  if($('eventResultsUrl'))$('eventResultsUrl').value=event?.results_url||'';
  if($('resultsSavedState'))$('resultsSavedState').textContent=count?`${count} risultati salvati`:'Nessun risultato salvato';
  $('showSavedResultsBtn')?.classList.toggle('hidden',!count);
  if($('showSavedResultsBtn'))$('showSavedResultsBtn').innerHTML='<i class="fas fa-table-list"></i> Mostra risultati salvati';
  if($('resultsImportStatus'))$('resultsImportStatus').textContent='';
}

async function saveLink(showToast=true){
  const id=eventId(),url=cleanUrl();
  if(!id)return toast('Seleziona una gara');
  if(!validUrl(url))return toast('Inserisci un link HTTPS valido di attivita.rollergames.it');
  const {error}=await db.from('v2_events').update({results_url:url}).eq('id',id);
  if(error)return toast(error.message);
  if(showToast)toast('Link risultati salvato');
  return true;
}

function stat(label,value){
  const box=document.createElement('div'),strong=document.createElement('strong'),span=document.createElement('span');
  strong.textContent=String(value);span.textContent=label;box.append(strong,span);return box;
}

function renderPreview(data){
  const host=$('resultsImportPreview');host.replaceChildren();host.classList.remove('hidden');
  const summary=document.createElement('div');summary.className='results-import-summary';
  summary.append(stat('Pagine lette',data.pages_scanned||0),stat('Partecipanti',data.athletes_total||0),stat('Riconosciuti',data.athletes_matched||0),stat('Da controllare',data.unmatched?.length||0));
  host.append(summary);

  (data.matches||[]).forEach(match=>{
    match.results=(match.results||[]).filter(result=>!isFormulaTiezzi(result));
    if(!match.results.length)return;
    const card=document.createElement('article');card.className='result-match-card';
    const h=document.createElement('h4');h.textContent=`${match.full_name} · ${match.category||'Categoria non indicata'}`;card.append(h);
    const details=document.createElement('details'),head=document.createElement('summary');
    head.textContent=`${match.results.length} risultato${match.results.length===1?'':'i'} trovato${match.results.length===1?'':'i'}`;details.append(head);
    match.results.forEach(result=>{
      const row=document.createElement('div');row.className='result-row';
      const text=document.createElement('div');text.textContent=displayedResult(result);
      const source=document.createElement('small');source.textContent=result.page_title||result.source_page;
      row.append(text,source);details.append(row);
    });
    card.append(details);host.append(card);
  });

  if(data.unmatched?.length){
    const box=document.createElement('section');box.className='results-unmatched';
    const h=document.createElement('h4');h.textContent='Atleti non riconosciuti';
    const p=document.createElement('p');p.textContent=data.unmatched.map(x=>x.full_name).join(' · ');box.append(h,p);host.append(box);
  }
  if(data.warnings?.length){
    const warning=document.createElement('div');warning.className='results-warning';
    warning.textContent=`${data.warnings.length} pagine non sono state lette. La prova può comunque essere salvata.`;host.append(warning);
  }
}

async function analyze(){
  if(!(await saveLink(false)))return;
  const button=$('analyzeResultsBtn'),status=$('resultsImportStatus');
  button.disabled=true;status.textContent='Analisi in corso: sto leggendo le pagine e confrontando gli iscritti…';
  $('resultsImportPreview').classList.add('hidden');$('saveAnalyzedResultsBtn').classList.add('hidden');
  try{
    const {data,error}=await db.functions.invoke('results-import',{body:{event_id:eventId(),source_url:cleanUrl()}});
    if(error)throw error;
    if(data?.error)throw new Error(data.error);
    analysis=data;renderPreview(data);
    status.textContent=`Analisi completata: ${data.athletes_matched||0} atleti riconosciuti su ${data.athletes_total||0}.`;
    if(data.matches?.length)$('saveAnalyzedResultsBtn').classList.remove('hidden');
  }catch(error){
    status.textContent='Analisi non riuscita.';
    toast(error?.message||String(error));
  }finally{button.disabled=false}
}

async function saveAnalysis(){
  if(!analysis)return;
  const rows=[];
  analysis.matches.forEach(match=>match.results.filter(result=>!isFormulaTiezzi(result)).forEach(result=>rows.push({
    athlete_id:match.athlete_id,
    source_page:result.source_page,
    page_title:result.page_title,
    result_text:result.result_text,
    result_cells:result.result_cells
  })));
  if(!rows.length)return toast('Non ci sono risultati da salvare');
  if(!confirm(`Salvare ${rows.length} righe di risultato? I risultati già importati per questa gara verranno sostituiti.`))return;
  const button=$('saveAnalyzedResultsBtn');button.disabled=true;
  const {data,error}=await db.rpc('v2_save_event_results',{p_event_id:eventId(),p_source_url:analysis.source_url,p_rows:rows});
  button.disabled=false;
  if(error)return toast(error.message);
  toast(`${data||rows.length} risultati salvati`);await refreshPanel();
}

async function showSavedResults(){
  const panel=$('savedResultsPanel'),button=$('showSavedResultsBtn');
  if(!panel.classList.contains('hidden')){
    panel.classList.add('hidden');
    button.innerHTML='<i class="fas fa-table-list"></i> Mostra risultati salvati';
    return;
  }
  button.disabled=true;button.textContent='Caricamento…';
  const {data,error}=await db.from('v2_event_results')
    .select('id,source_page,page_title,result_text,result_cells,imported_at,athlete:v2_athletes(full_name,category)')
    .eq('event_id',eventId())
    .order('imported_at',{ascending:false});
  button.disabled=false;
  if(error){button.innerHTML='<i class="fas fa-table-list"></i> Mostra risultati salvati';return toast(error.message)}
  const visibleData=(data||[]).filter(row=>!isFormulaTiezzi(row));
  panel.replaceChildren();
  const heading=document.createElement('div');heading.className='saved-results-heading';
  const h=document.createElement('h4');h.textContent='Risultati salvati';
  const count=document.createElement('span');count.textContent=`${visibleData.length} righe`;heading.append(h,count);panel.append(heading);
  const groups=new Map();
  visibleData.forEach(row=>{
    const name=row.athlete?.full_name||'Atleta non disponibile';
    if(!groups.has(name))groups.set(name,{category:row.athlete?.category||'',rows:[]});
    groups.get(name).rows.push(row);
  });
  [...groups.entries()].sort(([a],[b])=>a.localeCompare(b,'it')).forEach(([name,group])=>{
    const card=document.createElement('article');card.className='saved-athlete-results';
    const title=document.createElement('h5');title.textContent=`${name}${group.category?` · ${group.category}`:''}`;card.append(title);
    group.rows.forEach(row=>{
      const item=document.createElement('div');item.className='saved-result-row';
      const result=document.createElement('div');result.textContent=displayedResult(row);
      const meta=document.createElement('small');meta.textContent=row.page_title||row.source_page||'Pagina risultati';
      item.append(result,meta);card.append(item);
    });
    panel.append(card);
  });
  if(!visibleData.length){const empty=document.createElement('p');empty.className='muted';empty.textContent='Nessun risultato salvato per questa gara.';panel.append(empty)}
  panel.classList.remove('hidden');
  button.innerHTML='<i class="fas fa-chevron-up"></i> Nascondi risultati salvati';
}

$('saveResultsUrlBtn')?.addEventListener('click',()=>saveLink(true));
$('analyzeResultsBtn')?.addEventListener('click',analyze);
$('saveAnalyzedResultsBtn')?.addEventListener('click',saveAnalysis);
$('showSavedResultsBtn')?.addEventListener('click',showSavedResults);
$('newEventBtn')?.addEventListener('click',()=>{creatingEvent=true;analysis=null;$('eventResultsUrl').value='';$('resultsSavedState').textContent='Salva prima la nuova gara';$('resultsImportPreview').classList.add('hidden');$('savedResultsPanel').classList.add('hidden');$('saveAnalyzedResultsBtn').classList.add('hidden');$('showSavedResultsBtn').classList.add('hidden')});
$('eventSelect')?.addEventListener('change',()=>{creatingEvent=false;setTimeout(refreshPanel,0)});
document.addEventListener('juvenilia:event-changed',()=>{creatingEvent=false;refreshPanel()});
setTimeout(refreshPanel,700);
