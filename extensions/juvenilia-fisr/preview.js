(async () => {
 const $ = id => document.getElementById(id);
 try {
  const {juveniliaPreviewPayload:p} = await chrome.storage.local.get('juveniliaPreviewPayload');
  if (!p || !Array.isArray(p.gare)) throw new Error('Nessun trofeo trasferito. Seleziona un trofeo dal calendario FISR.');
  $('name').textContent=p.nome||'Trofeo FISR';
  const saved=await chrome.storage.local.get('juveniliaAdminUrl');
  $('destination').value=saved.juveniliaAdminUrl||'';
  $('openJuvenilia').onclick=async()=>{
    try{
      const target=new URL($('destination').value.trim());
      if(target.protocol!=='https:' || !/\/admin\.html$/i.test(target.pathname) || target.username || target.password)throw Error('Inserisci l’indirizzo HTTPS completo che termina con admin.html');
      const data={v:1,id_fisr:String(p.id_fisr||''),nome:p.nome||'',campi_calendario:p.campi_calendario||[],gare:p.gare};
      const bytes=new TextEncoder().encode(JSON.stringify(data));
      let binary='';for(const b of bytes)binary+=String.fromCharCode(b);
      target.hash='fisr-import='+encodeURIComponent(btoa(binary));
      if(target.href.length>18000)throw Error('Dati troppo lunghi per il collegamento: serve un canale dedicato.');
      await chrome.storage.local.set({juveniliaAdminUrl:target.origin+target.pathname});
      await chrome.tabs.create({url:target.href});
      $('handoffStatus').textContent='Juvenilia aperto. Accedi come amministratore e conferma i dati.';
    }catch(e){$('handoffStatus').textContent='Errore: '+e.message;}
  };
  $('status').textContent=`${p.gare.length} gare distinte · ID trofeo FISR ${p.id_fisr||'—'}`;
  const fields=['Data','Evento','Località','Organizzatore','Scadenza iscrizioni','Termine depennamenti'];
  (p.campi_calendario||[]).slice(0,6).forEach((value,i)=>{if(!value)return;const d=document.createElement('p');const b=document.createElement('strong');b.textContent=(fields[i]||'Dato')+': ';d.append(b,document.createTextNode(value));$('details').append(d)});
  for(const g of p.gare){const tr=document.createElement('tr');for(const value of [g.id_gara,g.categoria,g.sesso,g.descrizione]){const td=document.createElement('td');td.textContent=value??'';tr.append(td)}$('races').append(tr)}
 } catch(e){$('name').textContent='Impossibile aprire l’anteprima';$('status').textContent=e.message;}
})();
