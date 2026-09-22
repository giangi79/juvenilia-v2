import { db } from './supabase.js';
import { formatDate, toast } from './ui.js';

const $=id=>document.getElementById(id);
let historyData={summary:{},events:[],athletes:[],categories:[]};
let historyResults=new Map();
let loaded=false;

function percentage(value){return `${Math.round(Number(value)||0)}%`}
function eventStatus(e){return e.is_archived?{key:'archived',label:'ARCHIVIATA'}:{key:'published',label:'APERTA'}}
function eventDays(e){return Array.isArray(e.event_days)&&e.event_days.length?e.event_days.join(' · '):'—'}
function addCell(tr,label,value,className=''){const td=document.createElement('td');td.dataset.label=label;if(className)td.className=className;td.textContent=value;tr.append(td)}
function resultKey(athlete,event,season=''){return `${String(athlete||'').trim().toLocaleUpperCase('it')}||${String(event||'').trim().toLocaleUpperCase('it')}||${String(season||'').trim().toLocaleUpperCase('it')}`}
function publicResultText(row){
  const text=String(row?.result_text||'').trim();
  if(String(row?.page_title||'').toLocaleUpperCase('it').includes('CLASSIFICA FINALE')){
    const position=text.match(/^\s*(\d+)/)?.[1];
    if(position)return `${position}°`;
  }
  return text||'Risultato disponibile';
}

function renderSummary(){const s=historyData.summary||{},box=$('publicHistorySummary');box.replaceChildren();[
  ['fa-flag-checkered','Gare',s.events_total||0],
  ['fa-users','Atleti',s.athletes_total||0],
  ['fa-circle-check','Partecipazioni',s.yes_total||0],
  ['fa-chart-line','Presenza',percentage(s.participation_rate)]
].forEach(([icon,label,value])=>{const card=document.createElement('div');card.className='public-history-stat';const i=document.createElement('i');i.className=`fas ${icon}`;const copy=document.createElement('div');const strong=document.createElement('strong');strong.textContent=value;const span=document.createElement('span');span.textContent=label;copy.append(strong,span);card.append(i,copy);box.append(card)})}

function renderEvents(){const box=$('publicHistoryEvents'),q=$('publicHistoryEventSearch').value.trim().toLocaleLowerCase('it'),filter=$('publicHistoryEventFilter').value;box.replaceChildren();const rows=historyData.events.filter(e=>(!q||`${e.title} ${e.season_name||''} ${eventDays(e)}`.toLocaleLowerCase('it').includes(q))&&(filter==='all'||eventStatus(e).key===filter));if(!rows.length){box.innerHTML='<p class="card muted">Nessuna gara trovata.</p>';return}rows.forEach(e=>{const st=eventStatus(e),card=document.createElement('article');card.className='public-history-event card';const head=document.createElement('div');head.className='public-history-event-head';const title=document.createElement('div');const kicker=document.createElement('span');kicker.className=`history-status ${st.key}`;kicker.textContent=st.label;const h=document.createElement('h3');h.textContent=e.title;const days=document.createElement('p');days.innerHTML='<i class="fas fa-calendar-days" aria-hidden="true"></i> ';days.append(document.createTextNode(`${e.season_name?`Stagione ${e.season_name} · `:''}${eventDays(e)}`));title.append(kicker,h,days);const rate=document.createElement('div');rate.className='public-history-rate';rate.innerHTML=`<strong>${percentage(e.participation_rate)}</strong><span>partecipazione</span>`;head.append(title,rate);const stats=document.createElement('div');stats.className='public-history-event-stats';[['Confermati',e.yes_count,'yes'],['Non partecipano',e.no_count,'no'],['In attesa',e.pending_count,'pending'],['Totale',e.total_count,'total']].forEach(([label,value,kind])=>{const d=document.createElement('div');d.className=`history-mini-stat ${kind}`;const strong=document.createElement('strong');strong.textContent=value;const span=document.createElement('span');span.textContent=label;d.append(strong,span);stats.append(d)});card.append(head,stats);const athletes=Array.isArray(e.confirmed_athletes)?e.confirmed_athletes:[];const button=document.createElement('button');button.type='button';button.className='public-history-attendees-button';button.setAttribute('aria-expanded','false');button.innerHTML='<i class="fas fa-users" aria-hidden="true"></i> Vedi iscritti';const panel=document.createElement('div');panel.className='public-history-attendees hidden';if(athletes.length){const list=document.createElement('ul');athletes.forEach(a=>{const item=document.createElement('li');const name=document.createElement('strong');name.textContent=a.full_name;const category=document.createElement('span');category.textContent=a.category||'—';item.append(name,category);list.append(item)});panel.append(list)}else{const empty=document.createElement('p');empty.textContent='Nessun atleta confermato per questa gara.';panel.append(empty)}button.addEventListener('click',()=>{const open=panel.classList.toggle('hidden')===false;button.setAttribute('aria-expanded',String(open));button.innerHTML=`<i class="fas ${open?'fa-chevron-up':'fa-users'}" aria-hidden="true"></i> ${open?'Nascondi iscritti':'Vedi iscritti'}`});card.append(button,panel);box.append(card)})}

function renderAthletes(){
  const body=$('publicHistoryAthletes'),q=$('publicHistoryAthleteSearch').value.trim().toLocaleLowerCase('it'),cat=$('publicHistoryAthleteCategory').value;
  body.replaceChildren();
  historyData.athletes.filter(a=>(!q||a.full_name.toLocaleLowerCase('it').includes(q))&&(cat==='all'||a.category===cat)).forEach(a=>{
    const attended=Array.isArray(a.attended_events)?a.attended_events:[],last=attended.find(e=>e.is_registration_closed===true);
    const tr=document.createElement('tr');tr.className='public-athlete-row';tr.tabIndex=0;tr.setAttribute('role','button');tr.setAttribute('aria-expanded','false');
    const athleteCell=document.createElement('td');athleteCell.dataset.label='Atleta';const name=document.createElement('span');name.textContent=a.full_name;const hint=document.createElement('small');hint.textContent='Vedi gare';athleteCell.append(name,hint);tr.append(athleteCell);
    addCell(tr,'Categoria',a.category||'—');addCell(tr,'Gare',String(a.total_count),'history-number');addCell(tr,'Partecipate',String(a.yes_count),'history-number');addCell(tr,'Non partecipate',String(a.no_count),'history-number');addCell(tr,'In attesa',String(a.pending_count),'history-number');addCell(tr,'Presenza',percentage(a.participation_rate),'history-percent');addCell(tr,'Ultima gara partecipata',last?last.title:'—','history-last-event');
    const detail=document.createElement('tr');detail.className='public-athlete-detail-row hidden';const cell=document.createElement('td');cell.colSpan=8;const panel=document.createElement('div');panel.className='public-athlete-detail';const title=document.createElement('strong');title.textContent=`Gare a cui si è ${a.gender==='F'?'iscritta':a.gender==='M'?'iscritto':'iscritto/a'} ${a.full_name}`;panel.append(title);
    if(attended.length){
      const list=document.createElement('ul');
      attended.forEach(e=>{
        const item=document.createElement('li'),head=document.createElement('div');head.className='public-athlete-event-head';
        const rows=historyResults.get(resultKey(a.full_name,e.title,e.season_name))||[];
        let eventName;
        if(rows.length){eventName=document.createElement('button');eventName.type='button';eventName.className='public-athlete-event-button';eventName.setAttribute('aria-expanded','false');eventName.innerHTML='<i class="fas fa-ranking-star" aria-hidden="true"></i> ';eventName.append(document.createTextNode(e.title))}
        else{eventName=document.createElement('b');eventName.textContent=e.title}
        const days=document.createElement('span');days.textContent=`${e.season_name?`${e.season_name} · `:''}${eventDays(e)}`;head.append(eventName,days);item.append(head);
        if(rows.length){
          const results=document.createElement('div');results.className='public-athlete-event-results hidden';
          rows.forEach(row=>{const result=document.createElement('div');result.className='public-athlete-result';if(row.page_title){const page=document.createElement('small');page.textContent=row.page_title;result.append(page)}const text=document.createElement('strong');text.textContent=publicResultText(row);result.append(text);results.append(result)});
          eventName.addEventListener('click',event=>{event.stopPropagation();const open=results.classList.toggle('hidden')===false;eventName.setAttribute('aria-expanded',String(open));item.classList.toggle('has-open-results',open)});
          item.append(results)
        }
        list.append(item)
      });
      panel.append(list)
    }else{const empty=document.createElement('p');empty.textContent='Nessuna partecipazione confermata nello storico pubblico.';panel.append(empty)}
    cell.append(panel);detail.append(cell);
    const toggle=()=>{const open=detail.classList.toggle('hidden')===false;tr.classList.toggle('is-open',open);tr.setAttribute('aria-expanded',String(open))};
    tr.addEventListener('click',toggle);tr.addEventListener('keydown',event=>{if(event.key==='Enter'||event.key===' '){event.preventDefault();toggle()}});
    body.append(tr,detail)
  })
}

function populateCategories(){const select=$('publicHistoryAthleteCategory');const old=select.value;select.replaceChildren(new Option('Tutte le categorie','all'));[...new Set(historyData.athletes.map(a=>a.category).filter(Boolean))].sort((a,b)=>a.localeCompare(b,'it')).forEach(c=>select.append(new Option(c,c)));select.value=[...select.options].some(o=>o.value===old)?old:'all'}
function renderAll(){renderSummary();populateCategories();renderEvents();renderAthletes()}

async function loadHistory(){if(loaded)return;const [{data,error},{data:attendees,error:attendeesError},{data:results,error:resultsError}]=await Promise.all([db.rpc('v2_get_public_history'),db.rpc('v2_get_public_history_attendees'),db.rpc('v2_get_public_history_results')]);if(error){toast('Storico non disponibile: '+error.message);return}historyData=data||historyData;if(!attendeesError&&Array.isArray(attendees)){const byEvent=new Map(attendees.map(row=>[`${row.event_title}||${row.season_name||''}`,Array.isArray(row.athletes)?row.athletes:[]]));historyData.events=(historyData.events||[]).map(event=>({...event,confirmed_athletes:byEvent.get(`${event.title}||${event.season_name||''}`)||event.confirmed_athletes||[]}))}historyResults=new Map();if(!resultsError&&Array.isArray(results))results.forEach(row=>historyResults.set(resultKey(row.athlete_name,row.event_title,row.season_name),Array.isArray(row.results)?row.results:[]));loaded=true;renderAll()}
async function openHistory(){await loadHistory();if(!loaded)return;$('eventsList').classList.add('hidden');$('eventView').classList.add('hidden');$('publicHistoryView').classList.remove('hidden');$('eventTitle').textContent='Storico Juvenilia';$('eventDescription').textContent='Gare e statistiche della squadra';window.scrollTo({top:0,behavior:'auto'})}
function closeHistory(){$('publicHistoryView').classList.add('hidden');const route=new URLSearchParams(location.search).get('gara')||new URLSearchParams(location.search).get('event');(route?$('eventView'):$('eventsList')).classList.remove('hidden');window.dispatchEvent(new PopStateEvent('popstate'));window.scrollTo({top:0,behavior:'auto'})}
function showPanel(name){['Events','Athletes'].forEach(x=>{const active=x.toLowerCase()===name;$(`publicHistory${x}Btn`).classList.toggle('active',active);$(`publicHistory${x}Panel`).classList.toggle('hidden',!active)})}

$('openPublicHistory')?.addEventListener('click',openHistory);
$('closePublicHistory')?.addEventListener('click',closeHistory);
$('publicHistoryEventsBtn')?.addEventListener('click',()=>showPanel('events'));
$('publicHistoryAthletesBtn')?.addEventListener('click',()=>showPanel('athletes'));
$('publicHistoryEventSearch')?.addEventListener('input',renderEvents);
$('publicHistoryEventFilter')?.addEventListener('change',renderEvents);
$('publicHistoryAthleteSearch')?.addEventListener('input',renderAthletes);
$('publicHistoryAthleteCategory')?.addEventListener('change',renderAthletes);
