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

async function logoDataUrl(){
  try{
    const response=await fetch('assets/juvenilia-logo-orizzontale.png');
    if(!response.ok)throw new Error('logo non disponibile');
    const blob=await response.blob();
    return await new Promise((resolve,reject)=>{
      const reader=new FileReader();
      reader.onload=()=>resolve(reader.result);
      reader.onerror=reject;
      reader.readAsDataURL(blob);
    });
  }catch{return null}
}

async function downloadCalendarPdf(){
  const JsPDF=window.jspdf?.jsPDF;
  if(!JsPDF){toast('Il generatore PDF non è ancora pronto. Riprova tra un istante.');return}
  const items=upcomingEntries();
  if(!items.length){toast('Non ci sono gare future da scaricare.');return}
  const doc=new JsPDF({orientation:'landscape',unit:'mm',format:'a4'});
  const width=doc.internal.pageSize.getWidth(),height=doc.internal.pageSize.getHeight();
  const groups=new Map();
  items.forEach(item=>{
    const key=(item.start_date||'').slice(0,7);
    if(!groups.has(key))groups.set(key,{label:monthLabel(item.start_date),items:[]});
    groups.get(key).items.push(item);
  });
  const columns=[[],[],[]];
  [...groups.values()].forEach((group,index)=>columns[index%3].push(group));
  const logo=await logoDataUrl();
  doc.setFillColor(23,59,104);doc.rect(0,0,width,13,'F');
  if(logo)doc.addImage(logo,'PNG',12,2,49,8);
  doc.setTextColor(22,32,42);doc.setFont('helvetica','bold');doc.setFontSize(18);doc.text('CALENDARIO AGONISTICO '+seasonLabel(),12,23);
  doc.setFont('helvetica','normal');doc.setFontSize(8);doc.setTextColor(88,104,120);
  doc.text('Appuntamenti futuri comunicati alla squadra',12,28);
  const gap=6,left=10,top=36,columnWidth=(width-left*2-gap*2)/3;
  columns.forEach((column,columnIndex)=>{
    let y=top,x=left+columnIndex*(columnWidth+gap);
    column.forEach(group=>{
      doc.setFillColor(23,105,170);doc.roundedRect(x,y-4,columnWidth,6,1,1,'F');
      doc.setTextColor(255,255,255);doc.setFont('helvetica','bold');doc.setFontSize(7.4);
      doc.text(group.label.toUpperCase(),x+3,y);
      y+=5;
      group.items.forEach(item=>{
        const kind=typeInfo(item.event_type),color=pdfColor(kind.key),dateInfo=dateParts(item);
        const title=doc.splitTextToSize(String(item.title||'Gara'),columnWidth-30).slice(0,2);
        const details=doc.splitTextToSize([item.event_type,item.location].filter(Boolean).join(' · '),columnWidth-30).slice(0,1);
        const rowHeight=Math.max(12,6+title.length*3.1+(details.length?2.8:0));
        if(y+rowHeight>height-10)return;
        doc.setFillColor(247,249,251);doc.roundedRect(x,y-2,columnWidth,rowHeight,1,1,'F');
        doc.setFillColor(...color);doc.roundedRect(x,y-2,3.2,rowHeight,1,1,'F');
        doc.setTextColor(22,32,42);doc.setFont('helvetica','bold');doc.setFontSize(7.2);
        doc.text(dateInfo.days,x+5,y+2);
        doc.setFontSize(5.8);doc.setTextColor(88,104,120);doc.text(dateInfo.month,x+5,y+5.2);
        doc.setTextColor(22,32,42);doc.setFont('helvetica','bold');doc.setFontSize(7);
        doc.text(title,x+24,y+1.8);
        if(details.length){doc.setFont('helvetica','normal');doc.setFontSize(5.8);doc.setTextColor(88,104,120);doc.text(details,x+24,y+2.3+title.length*3.1);}
        y+=rowHeight+2;
      });
      y+=3;
    });
  });
  doc.setTextColor(100,110,120);doc.setFontSize(6.5);
  doc.text('Calendario Juvenilia · pagina unica A4 orizzontale',width-12,height-5,{align:'right'});
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
    await downloadCalendarPdf();
  });
  if(location.hash.toLowerCase()==='#calendario')showCalendar();
}
init();