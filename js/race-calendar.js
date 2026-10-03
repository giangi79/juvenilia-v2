import { db } from './supabase.js';
import { toast } from './ui.js';

const $=id=>document.getElementById(id);
let entries=[];

const parseDate=value=>value?new Date(value+'T12:00:00'):null;
const fmtDate=value=>parseDate(value)?.toLocaleDateString('it-IT',{day:'numeric',month:'long',year:'numeric'})||'';
const shortDate=value=>parseDate(value)?.toLocaleDateString('it-IT',{day:'2-digit',month:'2-digit'})||'';
const fmtRange=item=>item.end_date&&item.end_date!==item.start_date?shortDate(item.start_date)+'–'+shortDate(item.end_date):shortDate(item.start_date);
const monthLabel=value=>parseDate(value)?.toLocaleDateString('it-IT',{month:'long',year:'numeric'}).replace(/^./,c=>c.toUpperCase())||'';
const seasonLabel=()=>{
  const now=new Date(),year=now.getFullYear(),start=now.getMonth()>=6?year:year-1;
  return start+'/'+String(start+1).slice(-2);
};
const shortMonth=value=>parseDate(value)?.toLocaleDateString('it-IT',{month:'short'}).replace('.','').toUpperCase()||'';
const dateParts=item=>{
  const start=parseDate(item.start_date),end=parseDate(item.end_date||item.start_date);
  const day=value=>String(value.getDate()).padStart(2,'0');
  if(start.getMonth()===end.getMonth()&&start.getFullYear()===end.getFullYear()){
    return {days:start.getTime()===end.getTime()?day(start):day(start)+'–'+day(end),month:shortMonth(item.start_date)};
  }
  return {days:day(start)+' '+shortMonth(item.start_date),month:'→ '+day(end)+' '+shortMonth(item.end_date||item.start_date)};
};
const typeInfo=type=>{
  const text=String(type||'').toLocaleLowerCase('it');
  if(/internazionale|europe|mondiale/.test(text))return {key:'international',icon:'INT'};
  if(/regionale/.test(text))return {key:'regional',icon:'REG'};
  if(/nazionale|italiano/.test(text))return {key:'national',icon:'IT'};
  if(/raduno/.test(text))return {key:'meeting',icon:'RAD'};
  if(/amichevole/.test(text))return {key:'friendly',icon:'AM'};
  if(/trofeo/.test(text))return {key:'trophy',icon:'TRO'};
  return {key:'race',icon:'GARA'};
};

async function refresh(){
  const {data,error}=await db.from('v2_race_calendar').select('*').order('start_date',{ascending:true});
  if(error){toast('Non è stato possibile caricare il calendario: '+error.message);return}
  entries=data||[];
  render();
}

function showCalendar(){
  if(location.hash.toLowerCase()!=='#calendario')history.replaceState({},'',location.pathname+'#calendario');
  $('eventsList')?.classList.add('hidden');
  $('eventView')?.classList.add('hidden');
  $('publicHistoryView')?.classList.add('hidden');
  $('raceCalendarView')?.classList.remove('hidden');
  $('eventTitle').textContent='CALENDARIO GARE';
  $('eventDescription').textContent='Le prossime competizioni comunicate alla squadra.';
  refresh();
}

function closeCalendar(){
  history.replaceState({},'',location.pathname);
  $('raceCalendarView')?.classList.add('hidden');
  $('eventsList')?.classList.remove('hidden');
  $('eventTitle').innerHTML='<span>COMPETIZIONI</span> <strong>JUVENILIA</strong>';
  $('eventDescription').textContent='Seleziona una gara per visualizzare le iscrizioni.';
}

function render(){
  const host=$('raceCalendarSeason');
  const title=$('raceCalendarSeasonTitle');
  if(!host||!title)return;
  title.textContent='Calendario agonistico '+seasonLabel();
  host.replaceChildren();
  const today=new Date();today.setHours(0,0,0,0);
  const upcoming=entries.filter(item=>parseDate(item.end_date||item.start_date)>=today);
  if(!upcoming.length){
    const empty=document.createElement('p');
    empty.className='muted';
    empty.textContent='Nessuna gara futura inserita.';
    host.append(empty);
    return;
  }
  const grouped=new Map();
  upcoming.forEach(item=>{
    const key=(item.start_date||'').slice(0,7);
    if(!grouped.has(key))grouped.set(key,{label:monthLabel(item.start_date),items:[]});
    grouped.get(key).items.push(item);
  });
  [...grouped.values()].forEach(group=>{
    const column=document.createElement('section');
    column.className='season-calendar-month';
    const heading=document.createElement('h3');
    heading.textContent=group.label;
    column.append(heading);
    group.items.forEach(item=>{
      const kind=typeInfo(item.event_type);
      const card=document.createElement('article');
      card.className='season-calendar-event type-'+kind.key;
      const date=document.createElement('div');
      date.className='season-calendar-date';
      const dateInfo=dateParts(item);
      const days=document.createElement('strong');
      days.textContent=dateInfo.days;
      const month=document.createElement('span');
      month.textContent=dateInfo.month;
      date.append(days,month);
      const icon=document.createElement('span');
      icon.className='season-calendar-icon type-'+kind.key;
      icon.textContent=kind.icon;
      const body=document.createElement('div');
      body.className='season-calendar-body';
      const name=document.createElement('strong');
      name.textContent=item.title;
      const place=document.createElement('em');
      place.textContent=item.location||item.event_type||'Gara';
      const type=document.createElement('span');
      type.className='season-calendar-type';
      type.textContent=item.event_type||'Gara';
      body.append(name,place,type);
      if(item.notes){const note=document.createElement('small');note.textContent=item.notes;body.append(note)}
      card.append(date,icon,body);
      column.append(card);
    });
    host.append(column);
  });
}

function init(){
  $('openRaceCalendar')?.addEventListener('click',showCalendar);
  $('closeRaceCalendar')?.addEventListener('click',closeCalendar);
  if(location.hash.toLowerCase()==='#calendario')showCalendar();
}
init();