// Vista mobile a schede per Impostazioni > Quote e gara > Dettagli iscrizioni.
// Non modifica il comportamento desktop né la logica dei dati.
const style=document.createElement('style');
style.textContent=`
@media(max-width:700px){
  #advRegistrationsBody{display:block!important;width:100%!important}
  #advRegistrationsBody tr{
    display:block!important;width:100%!important;margin:0 0 14px!important;padding:0!important;
    background:#203246!important;border:1px solid #4b657b!important;border-radius:16px!important;
    overflow:hidden!important;box-shadow:0 8px 20px rgba(4,15,26,.18)!important;
  }
  #advRegistrationsBody td{
    display:grid!important;grid-template-columns:minmax(105px,38%) minmax(0,1fr)!important;
    align-items:center!important;gap:10px!important;width:100%!important;min-width:0!important;
    padding:11px 12px!important;border:0!important;border-bottom:1px solid #3e5367!important;
    background:#203246!important;color:#eef6fb!important;white-space:normal!important;
  }
  #advRegistrationsBody td:last-child{border-bottom:0!important}
  #advRegistrationsBody td::before{
    color:#9fc3df!important;font-size:.72rem!important;font-weight:900!important;
    letter-spacing:.04em!important;text-transform:uppercase!important;
  }
  #advRegistrationsBody td:nth-child(1)::before{content:'Atleta'}
  #advRegistrationsBody td:nth-child(2)::before{content:'Categoria gara'}
  #advRegistrationsBody td:nth-child(3)::before{content:'Giornata'}
  #advRegistrationsBody td:nth-child(4)::before{content:'Stato'}
  #advRegistrationsBody td:nth-child(5)::before{content:'Accompagnatore'}
  #advRegistrationsBody td:nth-child(6)::before{content:'Blocco'}
  #advRegistrationsBody td:first-child{
    display:block!important;padding:14px 12px!important;background:#274a6d!important;
    color:#9fe9f4!important;font-size:1rem!important;font-weight:900!important;
  }
  #advRegistrationsBody td:first-child::before{display:block!important;margin-bottom:4px!important}
  #advRegistrationsBody select,#advRegistrationsBody input,#advRegistrationsBody button{
    width:100%!important;max-width:100%!important;min-width:0!important;margin:0!important;
  }
  #advRegistrationsBody button{min-height:44px!important}
  #advRegistrationsBody + *{clear:both}
  #advRegistrationsBody{border:0!important}
  #advRegistrationsBody tr:hover td{background:#203246!important}
  #advRegistrationsBody tr:hover td:first-child{background:#274a6d!important}
  #advRegistrationsBody:before{display:none!important}
  #advRegistrationsBody{overflow:visible!important}
  #advRegistrationsBody tr td select.inline-select,
  #advRegistrationsBody tr td input.inline-input{font-size:16px!important}
  #advRegistrationsBody.closest{overflow:visible!important}
}
`;
document.head.append(style);

function applyMobileTable(){
  const body=document.getElementById('advRegistrationsBody');
  if(!body)return;
  const table=body.closest('table');
  const wrap=table?.closest('.table-wrap');
  if(table)table.classList.add('adv-mobile-card-table');
  if(wrap)wrap.classList.add('adv-mobile-card-wrap');
  if(!document.getElementById('advMobileCardsExtra')){
    const extra=document.createElement('style');extra.id='advMobileCardsExtra';extra.textContent=`
    @media(max-width:700px){
      .adv-mobile-card-wrap{overflow:visible!important;border:0!important;background:transparent!important;box-shadow:none!important}
      .adv-mobile-card-table{display:block!important;width:100%!important;min-width:0!important;background:transparent!important}
      .adv-mobile-card-table thead{display:none!important}
    }`;
    document.head.append(extra);
  }
}
applyMobileTable();
setTimeout(applyMobileTable,300);
setTimeout(applyMobileTable,1000);
document.querySelector('[data-settings-panel="advanced"]')?.addEventListener('click',()=>setTimeout(applyMobileTable,50));
