import { db } from './supabase.js';
import { toast } from './ui.js';

const $=id=>document.getElementById(id);
let month=new Date();
month.setDate(1);
let entries=[];
let admin=false;

const parseDate=value=>value?new Date(value+'T12:00:00'):null;
const isoDate=date=>date.toISOString().slice(0,10);
const fmtDate=value=>parseDate(value)?.toLocaleDateString('it-IT',{day:'numeric',month:'long',year:'numeric'})||'';
const fmtRange=item=>item.end_date&&item.end_date!==item.start_date?fmtDate(item.start_date)+' – '+fmtDate(item.end_date):fmtDate(item.start_date);
const monthTitle=date=>date.toLocaleDateString('it-IT',{month:'long',year:'numeric'}).replace(/^./,c=>c.toUpperCase());

async function refresh(){
  const {data,error}=await db.from('v2_race_calendar').select('*').order('start_date',{ascending:true});
  if(error){toast('Non è stato possibile caricare il calendario: '+error.message);return}
  entries=data||[];
  render();
}

async function checkAdmin(){
  const {data:{user}}=await db.auth.getUser();
  if(!user)return false;
  const {data,error}=await db.rpc('v2_is_admin');
  return !error&&data===true;
}

function showCalendar(){
  $('eventsList')?.classList.add('hidden');
  $('eventView')?.classList.add('hidden');
  $('publicHistoryView')?.classList.add('hidden');
  $('raceCalendarView')?.classList.remove('hidden');
  $('eventTitle').textContent='CALENDARIO GARE';
  $('eventDescription').textContent='Le prossime competizioni comunicate alla squadra.';
  refresh();
}

function closeCalendar(){
  $('raceCalendarView')?.classList.add('hidden');
  $('eventsList')?.classList.remove('hidden');
  $('eventTitle').innerHTML='<span>COMPETIZIONI</span> <strong>JUVENILIA</strong>';
  $('eventDescription').textContent='Seleziona una gara per visualizzare le iscrizioni.';
}

function eventOnDay(day){
  const key=isoDate(day);
  return entries.filter(item=>item.start_date===key||(item.end_date&&item.start_date<=key&&item.end_date>=key));
}

function render(){
  const title=$('raceCalendarMonth');
  const grid=$('raceCalendarGrid');
  const list=$('raceCalendarList');
  if(!title||!grid||!list)return;
  title.textContent=monthTitle(month);
  grid.replaceChildren();
  const year=month.getFullYear(),index=month.getMonth();
  const first=new Date(year,index,1);
  const offset=(first.getDay()+6)%7;
  const daysInMonth=new Date(year,index+1,0).getDate();
  for(let i=0;i<offset;i++){const empty=document.createElement('div');empty.className='race-calendar-day empty';grid.append(empty)}
  for(let day=1;day<=daysInMonth;day++){
    const date=new Date(year,index,day);
    const cell=document.createElement('div');
    cell.className='race-calendar-day';
    const num=document.createElement('strong');
    num.textContent=String(day);
    cell.append(num);
    eventOnDay(date).slice(0,2).forEach(item=>{
      const badge=document.createElement('span');
      badge.className='race-calendar-badge';
      badge.textContent=item.event_type||'Gara';
      badge.title=item.title;
      cell.append(badge);
    });
    grid.append(cell);
  }
  list.replaceChildren();
  const upcoming=entries.filter(item=>{
    const end=parseDate(item.end_date||item.start_date);
    const today=new Date();today.setHours(0,0,0,0);
    return end>=today;
  });
  if(!upcoming.length){const empty=document.createElement('p');empty.className='muted';empty.textContent='Nessuna gara futura inserita.';list.append(empty);return}
  upcoming.forEach(item=>{
    const row=document.createElement('article');
    row.className='race-calendar-entry';
    const date=document.createElement('div');
    date.className='race-calendar-entry-date';
    date.textContent=fmtRange(item);
    const body=document.createElement('div');
    const type=document.createElement('span');
    type.className='race-calendar-type';
    type.textContent=item.event_type||'Gara';
    const name=document.createElement('strong');
    name.textContent=item.title;
    body.append(type,name);
    if(item.location){const where=document.createElement('small');where.textContent=item.location;body.append(where)}
    if(item.notes){const note=document.createElement('small');note.textContent=item.notes;body.append(note)}
    row.append(date,body);
    list.append(row);
  });
}

async function setupAdminForm(){
  const host=$('raceCalendarAdmin');
  if(!host)return;
  admin=await checkAdmin();
  host.classList.toggle('hidden',!admin);
  if(!admin)return;
  const form=$('raceCalendarForm');
  form?.addEventListener('submit',async event=>{
    event.preventDefault();
    const data=new FormData(form);
    const title=String(data.get('title')||'').trim();
    const startDate=String(data.get('start_date')||'');
    const endDate=String(data.get('end_date')||'');
    if(!title||!startDate){toast('Inserisci almeno nome e data della gara');return}
    if(endDate&&endDate<startDate){toast('La data finale non può precedere quella iniziale');return}
    const submit=form.querySelector('button[type="submit"]');
    submit.disabled=true;
    const {error}=await db.from('v2_race_calendar').insert({
      title,
      event_type:String(data.get('event_type')||'Gara'),
      start_date:startDate,
      end_date:endDate||null,
      location:String(data.get('location')||'').trim()||null,
      notes:String(data.get('notes')||'').trim()||null
    });
    submit.disabled=false;
    if(error){toast('Non è stato possibile salvare: '+error.message);return}
    form.reset();
    toast('Gara aggiunta al calendario');
    refresh();
  });
}

function init(){
  $('openRaceCalendar')?.addEventListener('click',showCalendar);
  $('closeRaceCalendar')?.addEventListener('click',closeCalendar);
  $('raceCalendarPrev')?.addEventListener('click',()=>{month.setMonth(month.getMonth()-1);render()});
  $('raceCalendarNext')?.addEventListener('click',()=>{month.setMonth(month.getMonth()+1);render()});
  setupAdminForm();
}
init();