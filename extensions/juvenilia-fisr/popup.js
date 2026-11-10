const $=id=>document.getElementById(id);
const norm=s=>(s||'').replace(/\s+/g,' ').trim();
let selected,extracted;
const status=s=>$('status').textContent=s;
const parse=html=>new DOMParser().parseFromString(html,'text/html');
const cells=tr=>[...tr.children].filter(e=>/^(TD|TH)$/.test(e.tagName)).map(e=>norm(e.textContent));
const getId=url=>{const u=new URL(url);return u.searchParams.get('id_manif')||u.searchParams.get('id');};
const validUrl=url=>{const u=new URL(url);if(u.protocol!=='https:'||!['www.fisr.info','fisr.info'].includes(u.hostname)||!u.pathname.startsWith('/attivita/'))throw Error('Indirizzo non autorizzato');return u;};
async function read(url){const u=validUrl(url);const res=await fetch(u.href,{credentials:'include'});if(!res.ok)throw Error('HTTP '+res.status);return parse(await res.text());}
function fromProgram(doc){
 const races=[],seen=new Set();
 for(const table of doc.querySelectorAll('table')){
  let headers=null;
  for(const tr of table.querySelectorAll('tr')){
   const c=cells(tr),low=c.map(x=>x.toLowerCase());
   if(low.some(x=>x.includes('categoria'))&&low.some(x=>x.includes('sesso'))&&low.some(x=>x.includes('distanza'))){headers=low;continue;}
   if(!headers)continue;
   const at=k=>{const i=headers.findIndex(h=>h.includes(k));return i<0?'':c[i]||''};
   const r={categoria:at('categoria'),sesso:at('sesso'),distanza:at('distanza'),tipo_gara:at('specialit')||at('tipo')};
   if(!r.categoria||!/^(m|f|maschile|femminile)$/i.test(r.sesso)||!r.distanza)continue;
   const key=JSON.stringify(r);if(!seen.has(key)){seen.add(key);races.push(r);}
  }
 }
 return races;
}
function fromEntries(doc){
 const form=doc.querySelector('form[action*="corsa_iscrizioni_store.php"]');
 if(!form)throw Error('Modulo iscrizioni non presente. Verifica di aver effettuato l’accesso FISR.');
 const gare=new Map(),atleti=[];
 for(const tr of form.querySelectorAll('tr')){
  const c=cells(tr),boxes=[...tr.querySelectorAll('input[type="checkbox"][name^="cb_"]')];
  if(c.length<6||!boxes.length)continue;
  const tessera=c[0];if(!/^\d+$/.test(tessera))continue;
  const atleta={tessera,cognome:c[1],nome:c[2],categoria:c[3],sesso:c[4],gare:[]};
  for(const box of boxes){
   const m=/^cb_(\d+)_(\d+)$/.exec(box.name);if(!m||m[2]!==tessera)continue;
   let label='';let node=box.nextSibling;
   while(node&&node.nodeType!==1){label+=node.textContent||'';node=node.nextSibling;}
   label=norm(label.replace(/^\s*[|\-]+/,'').replace(/[|\-]+\s*$/,''));
   const g={id_gara:m[1],descrizione:label,categoria:atleta.categoria,sesso:atleta.sesso};
   atleta.gare.push({...g,selezionata:box.checked});
   if(!gare.has(m[1]))gare.set(m[1],g);
  }
  atleti.push(atleta);
 }
 if(!atleti.length)throw Error('Nessuna casella gara trovata nella pagina iscrizioni.');
 return {gare:[...gare.values()],atleti,numero_atleti:atleti.length,numero_gare:gare.size};
}
function render(){
 $('results').replaceChildren();
 const races=extracted.gare||[];
 $('summary').textContent=`${races.length} gare rilevate · ${extracted.atleti?.length||0} atleti leggibili`;
 if(!races.length){status('Nessuna gara riconosciuta. Puoi leggere la pagina iscrizioni oppure esportare il testo del programma.');return;}
 const table=document.createElement('table'),head=document.createElement('tr');
 for(const t of ['ID gara','Categoria','Sesso','Prova']){const th=document.createElement('th');th.textContent=t;head.append(th);}table.append(head);
 for(const g of races){const tr=document.createElement('tr');for(const v of [g.id_gara||'—',g.categoria,g.sesso,g.descrizione||[g.distanza,g.tipo_gara].filter(Boolean).join(' · ')]){const td=document.createElement('td');td.textContent=v||'';tr.append(td);}table.append(tr);}
 $('results').append(table);
}
async function init(){selected=(await chrome.storage.local.get('juveniliaSelected')).juveniliaSelected;$('read').disabled=!selected;$('readEntries').disabled=!selected;if(!selected)return;$('name').textContent=selected.name;const a=document.createElement('a');a.href=selected.url;a.target='_blank';a.rel='noopener noreferrer';a.textContent='Apri scheda FISR';$('link').append(a);status('Trofeo selezionato. Puoi leggere la scheda e le iscrizioni.');}
$('read').onclick=async()=>{if(!selected)return;$('read').disabled=true;status('Lettura scheda...');try{const doc=await read(selected.url);const text=norm(doc.body?.textContent);const pos=text.search(/ART\.?\s*10\s*[-–:]?\s*PROGRAMMA GARE/i);extracted={fonte:'FISR Corsa',id_fisr:getId(selected.url),nome:selected.name,url:selected.url,campi_calendario:selected.calendarRow||[],gare:fromProgram(doc),programma_testo:pos>=0?text.slice(pos,pos+18000).split(/ART\.?\s*11\b/i)[0]:'',estratto_il:new Date().toISOString()};render();$('export').disabled=false;status('Scheda letta. Le gare non strutturate possono essere recuperate dalla pagina iscrizioni.');}catch(e){status('Errore: '+e.message);}finally{$('read').disabled=false;}};
$('readEntries').onclick=async()=>{if(!selected)return;$('readEntries').disabled=true;$('entriesStatus').textContent='Lettura iscrizioni in corso...';try{
 const id=getId(selected.url);if(!/^\d+$/.test(id||''))throw Error('ID trofeo mancante');
 const url=`https://www.fisr.info/attivita/corsa_iscrizioni.php?id=${id}`;
 const data=fromEntries(await read(url));
 extracted={...(extracted||{fonte:'FISR Corsa',id_fisr:id,nome:selected.name,url:selected.url,campi_calendario:selected.calendarRow||[]}),gare:data.gare,atleti:data.atleti,fonte_gare:'pagina iscrizioni FISR',url_iscrizioni:url,estratto_il:new Date().toISOString()};
 render();$('export').disabled=false;$('entriesStatus').textContent=`Letti ${data.numero_atleti} atleti e ${data.numero_gare} gare distinte. Nessuna iscrizione inviata.`;status('Controlla i dati prima dell’importazione futura.');
 }catch(e){$('entriesStatus').textContent='Impossibile leggere iscrizioni: '+e.message;}finally{$('readEntries').disabled=false;}};
$('export').onclick=()=>{if(!extracted)return;const blob=new Blob([JSON.stringify(extracted,null,2)],{type:'application/json'}),u=URL.createObjectURL(blob),a=document.createElement('a');a.href=u;a.download=`juvenilia-fisr-${extracted.id_fisr||'trofeo'}.json`;a.click();setTimeout(()=>URL.revokeObjectURL(u),3000);};
init().catch(e=>status(e.message));
