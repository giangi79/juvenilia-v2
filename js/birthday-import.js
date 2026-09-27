import { db } from './supabase.js';
import { toast } from './ui.js';

const $=id=>document.getElementById(id);
const normalize=value=>String(value||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toUpperCase().replace(/[^A-Z0-9]+/g,' ').trim().replace(/\s+/g,' ');
const dateFromItalian=value=>{
  const match=String(value||'').trim().match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if(!match)return null;
  const [,d,m,y]=match,iso=`${y}-${m.padStart(2,'0')}-${d.padStart(2,'0')}`;
  const date=new Date(`${iso}T00:00:00Z`);
  return date.getUTCFullYear()===Number(y)&&date.getUTCMonth()+1===Number(m)&&date.getUTCDate()===Number(d)?iso:null;
};
let ready=[];
function setSummary(rows){
  const target=$('birthdayImportPreview');target.replaceChildren();
  const counts=document.createElement('p');counts.textContent=`${rows.length} nominativi · ${ready.length} pronti · ${rows.length-ready.length} da verificare o già presenti.`;target.append(counts);
  const wrap=document.createElement('div');wrap.className='table-wrap';const table=document.createElement('table');
  const head=document.createElement('thead');head.innerHTML='<tr><th>Atleta nel file</th><th>Data</th><th>Esito</th></tr>';table.append(head);
  const body=document.createElement('tbody');rows.forEach(row=>{const tr=document.createElement('tr');
    for(const value of [row.name,row.date||'—',row.reason]){const td=document.createElement('td');td.textContent=value;tr.append(td)}
    tr.lastChild.className=row.athlete?'import-ok':'import-skip';body.append(tr)});table.append(body);wrap.append(table);target.append(wrap);
  $('birthdayImportApply').classList.toggle('hidden',!ready.length);
}
$('birthdayFile').addEventListener('change',async event=>{
  ready=[];$('birthdayImportApply').classList.add('hidden');$('birthdayImportPreview').replaceChildren();
  const file=event.target.files?.[0];if(!file)return;
  if(!window.XLSX){toast('Lettore Excel non disponibile. Serve una connessione per caricare la libreria XLSX.');return}
  try{
    const book=window.XLSX.read(await file.arrayBuffer(),{type:'array',cellDates:false});
    const rows=window.XLSX.utils.sheet_to_json(book.Sheets[book.SheetNames[0]],{header:1,raw:false,defval:''});
    const headerIndex=rows.findIndex(row=>['Nome','Cognome','Nato il'].every(label=>row.some(cell=>normalize(cell)===normalize(label))));
    if(headerIndex<0)throw Error('Non trovo le colonne Nome, Cognome e Nato il.');
    const header=rows[headerIndex].map(normalize);const columns=['NOME','COGNOME','NATO IL','SESSO'].map(name=>header.indexOf(name));
    const extracted=rows.slice(headerIndex+1).filter(row=>row[columns[0]]&&row[columns[1]]).map(row=>{
      const [first,last,rawDate,gender]=columns.map(index=>index>=0?row[index]:'');
      return {name:`${last} ${first}`.trim(),alternate:`${first} ${last}`.trim(),date:dateFromItalian(rawDate),gender:normalize(gender)};
    });
    const unique=new Map();
    for(const row of extracted){
      const key=normalize(row.name),previous=unique.get(key);
      if(!previous)unique.set(key,row);
      else if(previous.date!==row.date||previous.gender!==row.gender)previous.conflictingDuplicate=true;
    }
    const source=[...unique.values()];
    const [{data:athletes,error},{data:roster,error:rosterError}]=await Promise.all([
      db.from('v2_athletes').select('id,full_name,gender,birth_date'),
      db.from('v2_season_athletes').select('athlete_id')
    ]);
    if(error||rosterError)throw error||rosterError;
    const rosterIds=new Set((roster||[]).map(row=>row.athlete_id));
    const reviewed=source.map(row=>{
      const matches=(athletes||[]).filter(a=>rosterIds.has(a.id)&&[row.name,row.alternate].some(name=>normalize(name)===normalize(a.full_name))&&(!row.gender||!a.gender||normalize(a.gender)===row.gender));
      let reason='';
      if(row.conflictingDuplicate)reason='Duplicati con dati diversi: verifica';
      else if(!row.date)reason='Data non valida';
      else if(!matches.length)reason='Atleta non presente nelle rose';
      else if(matches.length>1)reason='Più atleti corrispondono: verifica';
      else if(matches[0].birth_date)reason=matches[0].birth_date===row.date?'Già presente':'Data diversa: verifica';
      else reason='Pronto';
      return {...row,reason,athlete:reason==='Pronto'?matches[0]:null};
    });
    const targets=new Map();reviewed.forEach(row=>{if(row.athlete)targets.set(row.athlete.id,(targets.get(row.athlete.id)||0)+1)});
    reviewed.forEach(row=>{if(row.athlete&&targets.get(row.athlete.id)>1){row.athlete=null;row.reason='Abbinamento duplicato: verifica'}});
    ready=reviewed.filter(row=>row.athlete);
    setSummary(reviewed);
  }catch(error){$('birthdayImportPreview').textContent=`Impossibile leggere il file: ${error.message}`}
});
$('birthdayImportApply').addEventListener('click',async()=>{
  if(!ready.length||!confirm(`Inserire ${ready.length} date di nascita? Le altre righe saranno ignorate.`))return;
  const button=$('birthdayImportApply');button.disabled=true;let saved=0,failed=0;
  for(const row of ready){const {data,error}=await db.from('v2_athletes').update({birth_date:row.date}).eq('id',row.athlete.id).is('birth_date',null).select('id');if(error||!data?.length)failed++;else saved++}
  ready=[];button.classList.add('hidden');button.disabled=false;
  $('birthdayImportPreview').textContent=`Completato: ${saved} aggiornati, ${failed} non aggiornati. Ricarica il file per vedere lo stato attuale.`;
  toast(`${saved} compleanni inseriti${failed?`, ${failed} da verificare`:''}`);
  document.dispatchEvent(new CustomEvent('juvenilia:athletes-changed'));
  location.reload();
});
