import { db } from './supabase.js';

const $=id=>document.getElementById(id);
const DAY=86400000;
let loaded=false;

function romeToday(){
  const parts=new Intl.DateTimeFormat('en-CA',{
    timeZone:'Europe/Rome',year:'numeric',month:'2-digit',day:'2-digit'
  }).formatToParts(new Date()).reduce((out,part)=>{out[part.type]=part.value;return out},{});
  return new Date(Date.UTC(Number(parts.year),Number(parts.month)-1,Number(parts.day)));
}

function birthdayInfo(birthDate,today){
  const match=String(birthDate||'').match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if(!match)return null;
  const birthYear=Number(match[1]),month=Number(match[2])-1,day=Number(match[3]);
  let year=today.getUTCFullYear();
  let next=new Date(Date.UTC(year,month,day));
  if(next<today){year++;next=new Date(Date.UTC(year,month,day))}
  const days=Math.round((next-today)/DAY);
  return {next,days,age:year-birthYear};
}

function proximityLabel(days){
  if(days===0)return 'Oggi';
  if(days===1)return 'Domani';
  return 'Tra '+days+' giorni';
}

function setStats(rows){
  const stats=$('birthdayCalendarStats');
  stats.replaceChildren();
  for(const [value,label] of [
    [rows.filter(row=>row.days===0).length,'Oggi'],
    [rows.filter(row=>row.days<=7).length,'Nei prossimi 7 giorni'],
    [rows.filter(row=>row.days<=30).length,'Nei prossimi 30 giorni']
  ]){
    const box=document.createElement('div');box.className='birthday-calendar-stat';
    const strong=document.createElement('strong');strong.textContent=String(value);
    const span=document.createElement('span');span.textContent=label;
    box.append(strong,span);stats.append(box);
  }
}

function render(rows){
  const days=Number($('birthdayCalendarRange').value||365);
  const visible=rows.filter(row=>row.days<=days);
  const body=$('birthdayCalendarBody');body.replaceChildren();
  $('birthdayCalendarState').textContent=visible.length
    ?visible.length+' compleanni visualizzati · rosa attiva della stagione attuale'
    :'Nessun compleanno nel periodo selezionato.';
  if(!visible.length){
    const tr=document.createElement('tr'),td=document.createElement('td');
    td.colSpan=5;td.className='empty-state';td.textContent='Nessun compleanno nel periodo selezionato.';
    tr.append(td);body.append(tr);return;
  }
  const dateFormat=new Intl.DateTimeFormat('it-IT',{day:'2-digit',month:'long'});
  for(const row of visible){
    const tr=document.createElement('tr');
    if(row.days<=7)tr.className='birthday-soon';
    const values=[
      dateFormat.format(row.next),
      row.full_name,
      row.category||'—',
      row.age+' anni',
      proximityLabel(row.days)
    ];
    values.forEach((value,index)=>{
      const td=document.createElement('td');td.textContent=value;
      if(index===4){
        const level=row.days<=1?'birthday-now':row.days<=7?'birthday-week':'birthday-later';
        td.className='birthday-distance '+level;
      }
      tr.append(td);
    });
    body.append(tr);
  }
}

async function loadCalendar(){
  const refresh=$('birthdayCalendarRefresh');
  refresh.disabled=true;$('birthdayCalendarState').textContent='Caricamento compleanni…';
  try{
    const {data:season,error:seasonError}=await db.from('v2_seasons')
      .select('id,name').eq('is_current',true).maybeSingle();
    if(seasonError)throw seasonError;
    if(!season){
      setStats([]);render([]);$('birthdayCalendarState').textContent='Nessuna stagione attuale configurata.';return;
    }
    const {data:roster,error:rosterError}=await db.from('v2_season_athletes')
      .select('athlete_id,category').eq('season_id',season.id).eq('is_active',true);
    if(rosterError)throw rosterError;
    const ids=(roster||[]).map(row=>row.athlete_id);
    if(!ids.length){setStats([]);render([]);return}
    const {data:profiles,error:profilesError}=await db.from('v2_athletes')
      .select('id,full_name,birth_date').in('id',ids).not('birth_date','is',null);
    if(profilesError)throw profilesError;
    const categoryById=new Map((roster||[]).map(row=>[row.athlete_id,row.category]));
    const today=romeToday();
    const rows=(profiles||[]).map(profile=>{
      const info=birthdayInfo(profile.birth_date,today);
      return info?{...profile,...info,category:categoryById.get(profile.id)||''}:null;
    }).filter(Boolean).sort((a,b)=>a.days-b.days||a.full_name.localeCompare(b.full_name,'it'));
    setStats(rows);render(rows);loaded=true;
  }catch(error){
    setStats([]);$('birthdayCalendarBody').replaceChildren();
    $('birthdayCalendarState').textContent='Impossibile caricare il calendario: '+error.message;
  }finally{refresh.disabled=false}
}

document.querySelector('[data-tab="birthdays"]')?.addEventListener('click',()=>{if(!loaded)loadCalendar()});
$('birthdayCalendarRefresh')?.addEventListener('click',loadCalendar);
$('birthdayCalendarRange')?.addEventListener('change',()=>{loaded=false;loadCalendar()});
document.addEventListener('juvenilia:athletes-changed',()=>{loaded=false});
