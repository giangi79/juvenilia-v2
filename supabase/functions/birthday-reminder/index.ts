import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const SUPABASE_URL=Deno.env.get('SUPABASE_URL')||'';
const BOT_TOKEN=Deno.env.get('TELEGRAM_BOT_TOKEN')||'';
const CHAT_ID=Deno.env.get('TELEGRAM_CHAT_ID')||'';
const CRON_SECRET=Deno.env.get('TELEGRAM_CRON_SECRET')||'';

function secretKey(){
  const legacy=Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if(legacy)return legacy;
  try{const keys=JSON.parse(Deno.env.get('SUPABASE_SECRET_KEYS')||'{}');return keys.default||Object.values(keys)[0]||''}
  catch{return ''}
}
function publicKey(){
  const legacy=Deno.env.get('SUPABASE_ANON_KEY');
  if(legacy)return legacy;
  try{const keys=JSON.parse(Deno.env.get('SUPABASE_PUBLISHABLE_KEYS')||'{}');return keys.default||Object.values(keys)[0]||''}
  catch{return ''}
}
const admin=createClient(SUPABASE_URL,secretKey(),{auth:{persistSession:false,autoRefreshToken:false}});
const escapeHtml=(value:string)=>value.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
const cors={'Access-Control-Allow-Origin':'*','Access-Control-Allow-Headers':'authorization, x-client-info, apikey, content-type, x-cron-secret','Access-Control-Allow-Methods':'POST, OPTIONS'};
const json=(value:unknown,status=200)=>new Response(JSON.stringify(value),{status,headers:{...cors,'Content-Type':'application/json'}});

async function sendTelegram(message:string){
  const {data:configuredChat,error:chatError}=await admin.rpc('v2_get_telegram_delivery_chat_id');
  if(chatError)throw chatError;
  const response=await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`,{
    method:'POST',headers:{'Content-Type':'application/json'},
    body:JSON.stringify({chat_id:configuredChat||CHAT_ID,text:message,parse_mode:'HTML',disable_web_page_preview:true})
  });
  const result=await response.json().catch(()=>({}));
  if(!response.ok||result?.ok===false)throw new Error(result?.description||`Telegram HTTP ${response.status}`);
}

async function isAdmin(req:Request){
  const header=req.headers.get('authorization')||'';
  const token=header.startsWith('Bearer ')?header.slice(7):'';
  if(!token||!publicKey())return false;
  const client=createClient(SUPABASE_URL,publicKey(),{auth:{persistSession:false,autoRefreshToken:false}});
  const {data:{user},error}=await client.auth.getUser(token);
  if(error||!user)return false;
  const {data:row,error:adminError}=await admin.from('v2_admin_users').select('user_id').eq('user_id',user.id).maybeSingle();
  return !adminError&&!!row;
}

Deno.serve(async req=>{
  if(req.method==='OPTIONS')return new Response('ok',{headers:cors});
  if(req.method!=='POST')return json({error:'METHOD_NOT_ALLOWED'},405);
  const body=await req.json().catch(()=>({}));
  if(body?.action==='test'){
    if(!await isAdmin(req))return json({error:'ADMIN_REQUIRED'},401);
    if(!BOT_TOKEN||!CHAT_ID)return json({error:'TELEGRAM_NOT_CONFIGURED'},500);
    try{
      await sendTelegram('🎉 <b>JUVENILIA · TEST COMPLEANNI</b>\n\n🎂 ATLETA DI PROVA\n\nQuesto è un messaggio di prova. Nessun promemoria reale è stato segnato come inviato.');
      return json({ok:true,message:'Messaggio di prova inviato su Telegram.'});
    }catch{return json({error:'TELEGRAM_SEND_FAILED'},502)}
  }
  if(!CRON_SECRET||req.headers.get('x-cron-secret')!==CRON_SECRET)return json({error:'UNAUTHORIZED'},401);
  if(!BOT_TOKEN||!CHAT_ID)return json({error:'TELEGRAM_NOT_CONFIGURED'},500);

  if(body?.action==='discover_channel'){
    try{
      const response=await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/getUpdates?limit=100&timeout=0`);
      const result=await response.json();
      if(!response.ok||result?.ok===false)return json({error:'TELEGRAM_UPDATES_UNAVAILABLE'},502);
      const channels=new Map<string,{id:string,title:string}>();
      for(const update of result.result||[]){
        const chat=update.channel_post?.chat||update.edited_channel_post?.chat||update.my_chat_member?.chat;
        if(chat?.type==='channel')channels.set(String(chat.id),{id:String(chat.id),title:String(chat.title||'Canale')});
      }
      return json({ok:true,channels:[...channels.values()]});
    }catch{return json({error:'TELEGRAM_UPDATES_UNAVAILABLE'},502)}
  }

  const {data:claim,error:claimError}=await admin.rpc('v2_claim_birthday_reminder');
  if(claimError)return json({error:'CLAIM_FAILED'},500);
  if(!claim)return json({ok:true,sent:0});

  const day=claim.reminder_for as string;
  const names=Array.isArray(claim.names)?claim.names.filter((n:unknown)=>typeof n==='string'):[];
  if(!names.length)return json({error:'EMPTY_REMINDER'},500);
  const lines=names.map((name:string)=>`🎂 ${escapeHtml(name)}`);
  const message=[
    '🎉 <b>JUVENILIA · COMPLEANNI DI DOMANI</b>',
    '',
    ...lines,
    '',
    names.length===1?'Ricordiamoci di fare gli auguri!':'Ricordiamoci di fare gli auguri a tutti!'
  ].join('\n');

  try{
    await sendTelegram(message);
    const {error:finishError}=await admin.rpc('v2_finish_birthday_reminder',{p_day:day,p_error:null});
    if(finishError)throw finishError;
    return json({ok:true,sent:1,count:names.length});
  }catch(error){
    await admin.rpc('v2_finish_birthday_reminder',{p_day:day,p_error:String(error).slice(0,1000)});
    return json({error:'SEND_FAILED'},500);
  }
});
