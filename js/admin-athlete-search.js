(()=>{
  const clean=value=>String(value||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLocaleLowerCase('it').trim();
  const sections=[
    {id:'athleteSearchAthletes',section:'athletes',root:'tab-athletes',lists:[['#athletesBody tr',0],['#birthdayImportPreview tbody tr',0]]},
    {id:'athleteSearchBirthdays',section:'birthdays',root:'tab-birthdays',lists:[['#birthdayCalendarBody tr',1]]},
    {id:'athleteSearchRegistrations',section:'registrations',root:'tab-registrations',lists:[['#registrationsBody tr',1],['#fisrAthleteProves .fisr-athlete-row','summary']]},
    {id:'athleteSearchAdvanced',section:'advanced',root:'tab-advanced',lists:[['#advRegistrationsBody tr',0]]}
  ];
  for(const config of sections){
    const input=document.getElementById(config.id),root=document.getElementById(config.root);
    if(!input||!root)continue;
    const bar=input.closest('.admin-athlete-search'),count=bar.querySelector('.admin-athlete-search-count');
    let queued=false;
    function apply(){
      queued=false;
      const query=clean(input.value);let visible=0,total=0;
      config.lists.forEach(([selector,column],listIndex)=>{
        root.querySelectorAll(selector).forEach(row=>{
          const name=typeof column==='number'?row.children[column]:row.querySelector(column);
          if(!name||row.querySelector('.empty-state'))return;
          const matched=!query||clean(name.textContent).includes(query);
          row.classList.toggle('admin-athlete-search-hidden',!matched);
          if(listIndex===0){total++;if(matched)visible++}
        });
      });
      const message=query?(visible+' di '+total+' atleti'+(config.section==='registrations'?' · I comandi “tutti” riguardano tutta la gara':'')):'';
      if(count.textContent!==message)count.textContent=message;
    }
    const update=()=>{
      apply();
      document.dispatchEvent(new CustomEvent('juvenilia:athlete-search-change',{detail:{section:config.section}}));
    };
    input.addEventListener('input',update);
    bar.querySelector('button').addEventListener('click',()=>{input.value='';update();input.focus()});
    new MutationObserver(records=>{
      if(records.every(record=>bar.contains(record.target)))return;
      if(!queued){queued=true;queueMicrotask(apply)}
    }).observe(root,{childList:true,subtree:true});
    apply();
  }
})();