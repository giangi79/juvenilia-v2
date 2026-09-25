import { db } from './supabase.js';
import { toast } from './ui.js';

const $=id=>document.getElementById(id);
let contacts=[];
let loading=false;
let editingId=null;

export function getSelectedWhatsappContact(){
  return contacts.find(contact=>contact.id===$('whatsappRecipient')?.value)||null;
}

function showState(message,isError=false){
  const el=$('whatsappContactsState');
  if(!el)return;
  el.textContent=message;
  el.classList.toggle('error',isError);
}

function render(){
  const select=$('whatsappRecipient'),list=$('whatsappContactsList');
  if(!select||!list)return;
  const chosen=select.value;
  select.replaceChildren(new Option(contacts.length?'Seleziona un contatto':'Aggiungi prima un contatto',''));
  contacts.forEach(contact=>select.add(new Option(`${contact.name} · ${contact.phone}`,contact.id)));
  select.value=contacts.some(contact=>contact.id===chosen)?chosen:'';

  list.replaceChildren();
  if(!contacts.length){
    const empty=document.createElement('p');empty.className='muted';empty.textContent='La rubrica è vuota. Aggiungi un contatto per inviare il riepilogo.';
    list.append(empty);return;
  }
  contacts.forEach(contact=>{
    const row=document.createElement('div');row.className='whatsapp-contact-row';
    const details=document.createElement('div');
    const name=document.createElement('strong');name.textContent=contact.name;
    const number=document.createElement('small');number.textContent=contact.phone;
    details.append(name,number);
    const actions=document.createElement('div');actions.className='actions';
    const edit=document.createElement('button');edit.type='button';edit.className='secondary';edit.textContent='Modifica';
    edit.onclick=()=>{
      editingId=contact.id;
      $('whatsappContactName').value=contact.name;
      $('whatsappContactPhone').value=contact.phone;
      $('whatsappContactSaveBtn').textContent='Salva modifiche';
      $('whatsappContactCancelBtn').classList.remove('hidden');
      $('whatsappContactName').focus();
    };
    const remove=document.createElement('button');remove.type='button';remove.className='danger';remove.textContent='Elimina';
    remove.onclick=async()=>{
      if(!confirm(`Eliminare ${contact.name} dalla rubrica WhatsApp?`))return;
      remove.disabled=true;
      const {error}=await db.from('v2_whatsapp_contacts').delete().eq('id',contact.id);
      if(error){remove.disabled=false;return toast('Errore eliminazione contatto: '+error.message)}
      if(editingId===contact.id)resetForm();
      contacts=contacts.filter(item=>item.id!==contact.id);
      render();showState('Contatto eliminato.');
    };
    actions.append(edit,remove);row.append(details,actions);list.append(row);
  });
}

function resetForm(){
  editingId=null;
  $('whatsappContactForm').reset();
  $('whatsappContactSaveBtn').textContent='Aggiungi contatto';
  $('whatsappContactCancelBtn').classList.add('hidden');
}

async function loadContacts(){
  if(loading)return;
  const {data:{session}}=await db.auth.getSession();
  if(!session)return;
  loading=true;showState('Caricamento rubrica…');
  const {data,error}=await db.from('v2_whatsapp_contacts').select('id,name,phone').order('name');
  loading=false;
  if(error){showState('Errore caricamento rubrica: '+error.message,true);return}
  contacts=data||[];render();showState('');
}

$('whatsappContactForm')?.addEventListener('submit',async event=>{
  event.preventDefault();
  const name=$('whatsappContactName').value.trim();
  const phone=$('whatsappContactPhone').value.trim().replace(/[\s().-]/g,'').replace(/^00/,'+');
  if(!name||!/\+[1-9]\d{6,14}$/.test(phone))return toast('Inserisci un nome e un numero internazionale, per esempio +393331234567');
  const button=$('whatsappContactSaveBtn');button.disabled=true;
  const query=editingId
    ? db.from('v2_whatsapp_contacts').update({name,phone}).eq('id',editingId).select('id,name,phone').single()
    : db.from('v2_whatsapp_contacts').insert({name,phone}).select('id,name,phone').single();
  const {data,error}=await query;
  button.disabled=false;
  if(error){showState('Errore salvataggio: '+error.message,true);return toast(error.code==='23505'?'Questo numero è già in rubrica':error.message)}
  if(editingId)contacts=contacts.map(contact=>contact.id===editingId?data:contact);
  else contacts.push(data);
  contacts.sort((a,b)=>a.name.localeCompare(b.name,'it'));
  resetForm();render();showState('Contatto salvato ✓');
});
$('whatsappContactCancelBtn')?.addEventListener('click',resetForm);
document.querySelector('[data-tab="exports"]')?.addEventListener('click',loadContacts);
db.auth.onAuthStateChange((event,session)=>{
  if(session&&(event==='SIGNED_IN'||event==='INITIAL_SESSION'))setTimeout(loadContacts,500);
});
