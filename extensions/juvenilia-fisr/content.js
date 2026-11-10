(() => {
  if (window.__juveniliaFISRv05) return;
  window.__juveniliaFISRv05 = true;
  const repair = value => {
    const s=String(value||'');
    if(!/[ÃÂâ][\x80-\xbf]/.test(s) && !s.includes('Ã'))return s;
    try { return new TextDecoder('utf-8',{fatal:true}).decode(Uint8Array.from([...s].map(c=>c.charCodeAt(0)))); } catch { return s.replace(/Ã€/g,'À').replace(/Ã¨/g,'è').replace(/Ã©/g,'é').replace(/Ã /g,'à').replace(/Ã²/g,'ò').replace(/Ã¹/g,'ù'); }
  };
  const normalize = s => repair(s).replace(/\s+/g, ' ').trim();
  const matchRace = href => /corsa_(?:trofeo_modulo\.php\?[^#]*id_manif=|iscrizioni\.php\?[^#]*id=)\d+/i.test(href || '');
  const done = new WeakSet();
  const allowed = u => u.protocol === 'https:' && ['www.fisr.info','fisr.info'].includes(u.hostname) && u.pathname.startsWith('/attivita/');
  const style = document.createElement('style');
  style.textContent = `#juvenilia-v05-overlay{position:fixed;inset:0;z-index:2147483647;background:#07172b99;display:flex;align-items:center;justify-content:center;font:14px Arial,sans-serif;color:#17243a}#juvenilia-v05-modal{background:#fff;width:min(940px,94vw);max-height:88vh;display:flex;flex-direction:column;border-radius:12px;box-shadow:0 15px 45px #0006;overflow:hidden}#juvenilia-v05-modal header{background:#164b9b;color:white;padding:15px;display:flex;align-items:center;justify-content:space-between;gap:10px}#juvenilia-v05-modal header button{background:transparent;color:white;font-size:24px;border:0;cursor:pointer}#juvenilia-v05-body{padding:16px;overflow:auto}#juvenilia-v05-modal button.juv-action{background:#164b9b;color:white;border:0;border-radius:7px;padding:9px 13px;cursor:pointer}#juvenilia-v05-modal button:disabled{opacity:.5}#juvenilia-v05-modal table{border-collapse:collapse;width:100%;font-size:13px}#juvenilia-v05-modal th,#juvenilia-v05-modal td{border:1px solid #dbe2ee;padding:7px;text-align:left}#juvenilia-v05-modal th{background:#e8effa;position:sticky;top:0}#juvenilia-v05-modal .juv-muted{color:#607087;font-size:12px}#juvenilia-v05-modal .juv-actions{display:flex;gap:10px;align-items:center;flex-wrap:wrap;margin:14px 0}`;
  document.documentElement.append(style);
  function extract(doc) {
    const form = doc.querySelector('form[action*="corsa_iscrizioni_store.php"]');
    if (!form) throw new Error('Modulo iscrizioni non disponibile: potrebbe essere necessario accedere al portale.');
    const gare = new Map(); let athleteCount = 0;
    for (const tr of form.querySelectorAll('tr')) {
      const tds = [...tr.children].filter(e => e.tagName === 'TD');
      if (tds.length < 6 || !/^\d+$/.test(normalize(tds[0].textContent))) continue;
      const tessera = normalize(tds[0].textContent), categoria = normalize(tds[3].textContent), sesso = normalize(tds[4].textContent);
      const boxes = [...tds[5].querySelectorAll('input[type="checkbox"][name^="cb_"]')];
      if (!boxes.length) continue;
      athleteCount++;
      for (const box of boxes) {
        const m = /^cb_(\d+)_(\d+)$/.exec(box.name);
        if (!m || m[2] !== tessera) continue;
        let label = '';
        for (let node = box.nextSibling; node && !(node.nodeType === 1 && node.matches?.('input[type="checkbox"]')); node = node.nextSibling) {
          label += node.textContent || '';
        }
        label = normalize(label.split('|')[0]);
        if (!gare.has(m[1])) gare.set(m[1], {id_gara:m[1],categoria,sesso,descrizione:label});
      }
    }
    if (!gare.size) throw new Error('Nessuna gara riconosciuta nella pagina FISR.');
    return {gare:[...gare.values()], numero_atleti_visibili:athleteCount};
  }
  function download(data) {
    const blob = new Blob([JSON.stringify(data,null,2)], {type:'application/json'});
    const url = URL.createObjectURL(blob), a = document.createElement('a');
    a.href = url; a.download = `juvenilia-fisr-${data.id_fisr}.json`; document.body.append(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  async function show(name, sourceUrl, row) {
    document.getElementById('juvenilia-v05-overlay')?.remove();
    const overlay = document.createElement('div'); overlay.id = 'juvenilia-v05-overlay';
    const modal = document.createElement('section'); modal.id = 'juvenilia-v05-modal';
    const header = document.createElement('header'), heading = document.createElement('strong'), close = document.createElement('button');
    heading.textContent = 'Juvenilia FISR · Anteprima trofeo'; close.textContent = '×'; close.setAttribute('aria-label','Chiudi');
    close.onclick = () => overlay.remove(); header.append(heading,close);
    const body = document.createElement('div'); body.id = 'juvenilia-v05-body';
    const title = document.createElement('h3'); title.textContent = name;
    const status = document.createElement('p'); status.textContent = 'Lettura delle gare FISR in corso…';
    const summary = document.createElement('p'); summary.className = 'juv-muted';
    const actions = document.createElement('div'); actions.className = 'juv-actions';
    const exportBtn = document.createElement('button'); exportBtn.className='juv-action'; exportBtn.textContent='Apri anteprima in Juvenilia'; exportBtn.disabled=true;
    const note = document.createElement('span'); note.className='juv-muted'; note.textContent='Solo lettura: nessuna casella modificata e nessuna iscrizione inviata.';
    actions.append(exportBtn,note); const results=document.createElement('div');
    body.append(title,status,summary,actions,results); modal.append(header,body); overlay.append(modal); document.body.append(overlay);
    overlay.addEventListener('click',e=>{if(e.target===overlay)overlay.remove();});
    try {
      const src = new URL(sourceUrl,location.href);
      if (!allowed(src)) throw new Error('Collegamento non autorizzato');
      const id = src.searchParams.get('id_manif') || src.searchParams.get('id');
      if (!/^\d+$/.test(id || '')) throw new Error('ID trofeo non valido');
      const entriesUrl = new URL(`corsa_iscrizioni.php?id=${id}`,src);
      const res = await fetch(entriesUrl.href,{credentials:'include'});
      if(!res.ok)throw new Error(`Risposta FISR HTTP ${res.status}`);
      const bytes = await res.arrayBuffer(); const charset = /charset=([\w-]+)/i.exec(res.headers.get('content-type')||'')?.[1] || 'windows-1252'; const html = new TextDecoder(charset).decode(bytes); const doc = new DOMParser().parseFromString(html,'text/html');
      const data = extract(doc);
      const payload = {fonte:'FISR Corsa',id_fisr:id,nome:normalize(name),campi_calendario:row.map(normalize),url_scheda:src.href,url_iscrizioni:entriesUrl.href,estratto_il:new Date().toISOString(),gare:data.gare};
      status.textContent='Lettura completata.';
      summary.textContent=`${data.gare.length} gare distinte · ${data.numero_atleti_visibili} atleti visibili nella pagina FISR`;
      const table=document.createElement('table'),thead=document.createElement('tr');
      for(const t of ['ID gara','Categoria','Sesso','Prova']){const th=document.createElement('th');th.textContent=t;thead.append(th);}table.append(thead);
      for(const g of data.gare){const tr=document.createElement('tr');for(const v of [g.id_gara,g.categoria,g.sesso,g.descrizione]){const td=document.createElement('td');td.textContent=v;tr.append(td);}table.append(tr);}
      results.append(table); exportBtn.disabled=false; exportBtn.onclick=()=>{exportBtn.disabled=true;chrome.runtime.sendMessage({type:'JUVENILIA_OPEN_PREVIEW',payload},response=>{exportBtn.disabled=false;if(chrome.runtime.lastError||!response?.ok)status.textContent='Collegamento non riuscito: '+(chrome.runtime.lastError?.message||response?.error||'Errore sconosciuto');});};
      chrome.storage.local.set({juveniliaSelected:{name,url:src.href,calendarRow:row,selectedAt:new Date().toISOString()}}).catch(()=>{});
    } catch(e) { status.textContent='Impossibile leggere le gare: '+e.message; summary.textContent='Puoi aprire la scheda FISR e controllare se la pagina iscrizioni è accessibile.'; }
  }
  function scan() {
    for (const a of document.querySelectorAll('a[href]')) {
      if(done.has(a))continue;
      if(!matchRace(a.getAttribute('href')) && !matchRace(a.href))continue;
      const tr=a.closest('tr'); if(!tr)continue;
      done.add(a);
      if(tr.querySelector('[data-juvenilia-v05]'))continue;
      const cells=[...tr.querySelectorAll(':scope > td')];
      const name=normalize(cells[1]?.textContent || a.textContent) || 'Trofeo FISR';
      const row=cells.map(c=>normalize(c.textContent));
      const btn=document.createElement('button'); btn.type='button'; btn.dataset.juveniliaV05='1';
      btn.textContent='Importa in Juvenilia';btn.style.cssText='margin:4px;padding:7px 10px;background:#164b9b;color:#fff;border:0;border-radius:6px;cursor:pointer;font:600 12px Arial';
      btn.addEventListener('click',e=>{e.preventDefault();e.stopPropagation();show(name,a.href,row);});
      (cells[cells.length-1] || a.parentElement).append(btn);
    }
  }
  scan();let timer;
  new MutationObserver(()=>{clearTimeout(timer);timer=setTimeout(scan,250);}).observe(document.documentElement,{childList:true,subtree:true});
})();
