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
  if(/internazionale|europe|mondiale/.test(text))return {key:'international',icon:'fa-earth-europe'};
  if(/regionale/.test(text))return {key:'regional',icon:'fa-medal'};
  if(/nazionale|italiano/.test(text))return {key:'national',icon:'italy-flag'};
  if(/raduno/.test(text))return {key:'meeting',icon:'fa-person-skating'};
  if(/amichevole/.test(text))return {key:'friendly',icon:'fa-handshake'};
  if(/trofeo/.test(text))return {key:'trophy',icon:'fa-trophy'};
  return {key:'race',icon:'fa-flag-checkered'};
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
      if(kind.icon==='italy-flag'){
        const flag=document.createElement('span');
        flag.className='season-calendar-italy-flag';
        flag.setAttribute('aria-label','Italia');
        icon.append(flag);
      }else{
        const symbol=document.createElement('i');
        symbol.className='fas '+kind.icon;
        symbol.setAttribute('aria-hidden','true');
        icon.append(symbol);
      }
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

function upcomingEntries(){
  const today=new Date();today.setHours(0,0,0,0);
  return entries.filter(item=>parseDate(item.end_date||item.start_date)>=today);
}

function pdfColor(key){
  return ({
    national:[216,71,63],international:[86,105,201],regional:[27,156,181],
    trophy:[214,154,39],meeting:[149,92,197],friendly:[219,107,159],race:[72,168,104]
  })[key]||[72,168,104];
}

function downloadCalendarPdf(){
  const JsPDF=window.jspdf?.jsPDF;
  if(!JsPDF){toast('Il generatore PDF non è ancora pronto. Riprova tra un istante.');return}
  const items=upcomingEntries();
  if(!items.length){toast('Non ci sono gare future da scaricare.');return}
  const doc=new JsPDF({orientation:'landscape',unit:'mm',format:'a4'});
  const width=doc.internal.pageSize.getWidth();
  let y=17;
  const nextPage=()=>{
    doc.addPage();y=17;
    doc.setFillColor(23,59,104);doc.rect(0,0,width,11,'F');
    doc.setTextColor(255,255,255);doc.setFontSize(9);doc.text('JUVENILIA RACING TEAM',12,7.3);
  };
  doc.setFillColor(23,59,104);doc.rect(0,0,width,11,'F');
  doc.setTextColor(255,255,255);doc.setFontSize(9);doc.text('JUVENILIA RACING TEAM',12,7.3);
  doc.setTextColor(22,32,42);doc.setFont('helvetica','bold');doc.setFontSize(20);
  doc.text('CALENDARIO AGONISTICO '+seasonLabel(),12,y);
  y+=8;doc.setFont('helvetica','normal');doc.setFontSize(10);
  doc.setTextColor(88,104,120);doc.text('Appuntamenti futuri comunicati alla squadra',12,y);y+=9;
  let activeMonth='';
  items.forEach(item=>{
    const month=monthLabel(item.start_date);
    if(month!==activeMonth){
      if(y>178)nextPage();
      activeMonth=month;
      doc.setFillColor(23,105,170);doc.roundedRect(12,y-5,48,7,1,1,'F');
      doc.setTextColor(255,255,255);doc.setFont('helvetica','bold');doc.setFontSize(9);doc.text(month.toUpperCase(),15,y);
      y+=7;
    }
    if(y>184)nextPage();
    const kind=typeInfo(item.event_type),color=pdfColor(kind.key);
    doc.setFillColor(247,249,251);doc.roundedRect(12,y-3,width-24,15,1.5,1.5,'F');
    doc.setFillColor(...color);doc.roundedRect(12,y-3,5,15,1.5,1.5,'F');
    doc.setTextColor(22,32,42);doc.setFont('helvetica','bold');doc.setFontSize(10);
    doc.text(fmtRange(item),21,y+2);
    doc.setFontSize(10);doc.text(item.title||'Gara',51,y+2);
    doc.setFont('helvetica','normal');doc.setFontSize(8.5);doc.setTextColor(88,104,120);
    const details=[item.event_type,item.location].filter(Boolean).join(' · ');
    doc.text(details,51,y+7);
    if(item.notes){doc.setFontSize(7.5);doc.text(item.notes,51,y+10.5,{maxWidth:width-67});}
    y+=18;
  });
  const pages=doc.getNumberOfPages();
  for(let page=1;page<=pages;page++){
    doc.setPage(page);doc.setTextColor(100,110,120);doc.setFontSize(7);
    doc.text('Calendario Juvenilia · Pagina '+page+' di '+pages,width-12,203,{align:'right'});
  }
  doc.save('Calendario_Juvenilia_'+seasonLabel().replace('/','-')+'.pdf');
}

function init(){
  $('openRaceCalendar')?.addEventListener('click',showCalendar);
  $('closeRaceCalendar')?.addEventListener('click',closeCalendar);
  $('downloadRaceCalendar')?.addEventListener('click',async()=>{
    const button=$('downloadRaceCalendar');
    button.disabled=true;
    await refresh();
    button.disabled=false;
    downloadCalendarPdf();
  });
  if(location.hash.toLowerCase()==='#calendario')showCalendar();
}
init();