const $=id=>document.getElementById(id);

function buildSeasonUI(){
  const tabs=$('tabs');
  const eventTab=$('tab-event');
  const athletesTab=$('tab-athletes');
  if(!tabs||!eventTab||!athletesTab||$('tab-seasons'))return;

  const seasonButton=document.createElement('button');
  seasonButton.type='button';
  seasonButton.dataset.tab='seasons';
  seasonButton.innerHTML='<i class="fas fa-calendar-days"></i> Stagioni';
  tabs.querySelector('[data-tab="athletes"]')?.insertAdjacentElement('beforebegin',seasonButton);

  const section=document.createElement('section');
  section.id='tab-seasons';
  section.className='tab card hidden';
  section.innerHTML=`
    <div class="seasons-heading">
      <div><h2>Stagioni sportive</h2><p class="muted">Prepara in anticipo la rosa della prossima stagione senza modificare quella attuale.</p></div>
    </div>
    <div class="season-create-card">
      <h3>Crea una nuova stagione</h3>
      <div class="form-grid">
        <label>Nome stagione<input id="newSeasonName" placeholder="2026/2027" inputmode="numeric"></label>
        <label>Copia la rosa da<select id="newSeasonCopyFrom"><option value="">Nessuna — stagione vuota</option></select></label>
        <label>Data inizio<input id="newSeasonStart" type="date"></label>
        <label>Data fine<input id="newSeasonEnd" type="date"></label>
      </div>
      <div class="actions"><button id="createSeasonBtn" type="button"><i class="fas fa-copy"></i> Crea stagione e copia rosa</button></div>
    </div>
    <div id="seasonEditCard" class="season-create-card hidden">
      <h3>Modifica stagione</h3>
      <input id="editSeasonId" type="hidden">
      <div class="form-grid">
        <label>Nome stagione<input id="editSeasonName" placeholder="2026/2027" inputmode="numeric"></label>
        <label>Data inizio<input id="editSeasonStart" type="date"></label>
        <label>Data fine<input id="editSeasonEnd" type="date"></label>
      </div>
      <div class="actions">
        <button id="saveSeasonBtn" type="button"><i class="fas fa-floppy-disk"></i> Salva modifiche</button>
        <button id="cancelSeasonEditBtn" class="secondary" type="button">Annulla</button>
      </div>
    </div>
    <div id="seasonsList" class="seasons-list"></div>`;
  eventTab.insertAdjacentElement('afterend',section);

  const firstEventLabel=$('eventSelect')?.closest('label');
  if(firstEventLabel){
    const label=document.createElement('label');
    label.innerHTML='Stagione della gara<select id="eventSeasonInput"></select><small class="field-help">Dopo la creazione della gara la stagione non può essere cambiata.</small>';
    firstEventLabel.insertAdjacentElement('afterend',label);
  }

  const heading=athletesTab.querySelector('h2');
  if(heading){
    heading.textContent='Rosa atleti';
    const picker=document.createElement('div');
    picker.className='athlete-season-picker';
    picker.innerHTML='<label>Rosa della stagione<select id="athleteSeasonSelect"></select></label><span id="athleteSeasonState" class="season-state"></span>';
    heading.insertAdjacentElement('afterend',picker);
    const note=document.createElement('p');
    note.id='athleteSeasonNote';
    note.className='muted';
    note.textContent='Categoria e presenza sono specifiche della stagione selezionata.';
    picker.insertAdjacentElement('afterend',note);
  }
}

buildSeasonUI();
