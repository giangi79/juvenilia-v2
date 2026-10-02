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
const iconFor=type=>{
  const text=String(type||'').toLocaleLowerCase('it');
  if(/campionato|italiano/.test(text))return '🇮🇹';
  if(/internazionale|europe|mondiale/.test(text))return '🌍';
  if(/regionale/.test(text))return '🏅';
  if(/raduno/.test(text))return '🛼';
  return '🏆';
};

async function refresh(){
  const {data,error}=await db.from('v2_race_calendar').select('*').order('start_date',{ascending:true});
  if(error){toast('Non è stato possibile caricare il calendario: '+error.message);return}
  entries=data||[];
  render();
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
      const card=document.createElement('article');
      card.className='season-calendar-event';
      const date=document.createElement('div');
      date.className='season-calendar-date';
      date.textContent=fmtRange(item);
      const icon=document.createElement('span');
      icon.className='season-calendar-icon';
      icon.textContent=iconFor(item.event_type);
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
}
init();