// Importazione FISR v0.9: solo dati pubblici di gara, mai credenziali o tessere atleti.
const KEY='juvenilia_fisr_pending_v1';
function parsePayload(){
 const hash=location.hash.slice(1);
 if(!hash.startsWith('fisr-import='))return null;
 history.replaceState(null,'',location.pathname+location.search);
 const encoded=decodeURIComponent(hash.slice('fisr-import='.length));
 const raw=atob(encoded);
 const bytes=Uint8Array.from(raw,c=>c.charCodeAt(0));
 const data=JSON.parse(new TextDecoder().decode(bytes));
 if(data.v!==1||!/^\d{1,12}$/.test(data.id_fisr)||!Array.isArray(data.gare)||data.gare.length>500)throw Error('Dati FISR non validi');
 if(!data.gare.every(g=>/^\d{1,12}$/.test(String(g.id_gara))&&['M','F'].includes(g.sesso)))throw Error('Elenco gare FISR non valido');
 return data;
}
let data=null;
try{data=parsePayload();if(data)sessionStorage.setItem(KEY,JSON.stringify(data));else data=JSON.parse(sessionStorage.getItem(KEY)||'null');}catch(e){console.warn('Importazione FISR:',e);}
if(data){
 const panel=document.createElement('section');panel.className='card';panel.id='fisrDirectPanel';panel.style.cssText='margin:14px 0;border:2px solid #2a6ab3;padding:18px';
 const heading=document.createElement('h2');heading.textContent='Importazione diretta FISR';
 const summary=document.createElement('p');summary.textContent=`${data.nome} · ID ${data.id_fisr} · ${data.gare.length} prove per categoria e sesso`;
 const detail=document.createElement('p');detail.textContent=(Array.isArray(data.campi_calendario)?data.campi_calendario:[]).slice(0,6).join(' · ');
 const table=document.createElement('details');const caption=document.createElement('summary');caption.textContent='Visualizza tutte le prove FISR';table.append(caption);
 const list=document.createElement('div');list.style.cssText='max-height:230px;overflow:auto';
 for(const g of data.gare){const line=document.createElement('div');line.textContent=`${g.id_gara} · ${g.categoria} · ${g.sesso} · ${g.descrizione}`;list.append(line)}table.append(list);
 const confirm=document.createElement('button');confirm.type='button';confirm.textContent='Prepara gara nel gestionale';
 const cancel=document.createElement('button');cancel.type='button';cancel.textContent='Annulla';cancel.className='secondary';cancel.style.marginLeft='8px';
 const status=document.createElement('p');status.textContent='Nessun salvataggio automatico. Verifica date e categorie prima di salvare.';
 const fields=Array.isArray(data.campi_calendario)?data.campi_calendario:[];
 const year=new Date().getFullYear();
 const parseDate=value=>{const m=/^(\d{1,2})\/(\d{1,2})(?:\/(\d{2,4}))?$/.exec(String(value||'').trim());if(!m)return '';const y=m[3]?Number(m[3].length===2?'20'+m[3]:m[3]):year;const d=new Date(y,Number(m[2])-1,Number(m[1]));return d.getFullYear()===y&&d.getMonth()===Number(m[2])-1&&d.getDate()===Number(m[1])?`${y}-${String(m[2]).padStart(2,'0')}-${String(m[1]).padStart(2,'0')}`:''};
 confirm.onclick=()=>{
  const categoryMap={GI:'GIOVANISSIMI',ES:'ESORDIENTI',R1:'R12',RA:'RAGAZZI',AL:'ALLIEVI',JU:'JUNIOR',SE:'SENIOR'};
  const categories=[...new Set(data.gare.map(g=>categoryMap[g.categoria]).filter(Boolean))];
  const draft={title:data.nome,start_date:parseDate(fields[0]),end_date:'',location:fields[2]||'',categories,notes:`Fonte: FISR · Trofeo ${data.id_fisr}\nOrganizzatore: ${fields[3]||'non indicato'}\nScadenza iscrizioni: ${fields[4]||'da verificare'}\nProve FISR: ${data.gare.length}`,fisr:{id_fisr:data.id_fisr,gare:data.gare}};
  document.querySelector('[data-tab="event"]')?.click();
  document.dispatchEvent(new CustomEvent('juvenilia:create-from-calendar',{detail:draft}));
  sessionStorage.removeItem(KEY);panel.remove();
 };
 cancel.onclick=()=>{sessionStorage.removeItem(KEY);panel.remove()};
 panel.append(heading,summary,detail,table,confirm,cancel,status);
 const mount=()=>{const app=document.getElementById('adminApp');if(app&&!app.classList.contains('hidden')){app.prepend(panel);return true}return false};
 if(!mount()){const observer=new MutationObserver(()=>{if(mount())observer.disconnect()});observer.observe(document.body,{subtree:true,attributes:true,attributeFilter:['class']})}
}
