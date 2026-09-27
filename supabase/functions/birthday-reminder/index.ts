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
const admin=createClient(SUPABASE_URL,secretKey(),{auth:{persistSession:false,autoRefreshToken:false}});
const escapeHtml=(value:string)=>value.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
const json=(value:unknown,status=200)=>new Response(JSON.stringify(value),{status,headers:{'Content-Type':'application/json'}});

Deno.serve(async req=>{
  if(req.method!=='POST')return json({error:'METHOD_NOT_ALLOWED'},405);
  if(!CRON_SECRET||req.headers.get('x-cron-secret')!==CRON_SECRET)return json({error:'UNAUTHORIZED'},401);
  if(!BOT_TOKEN||!CHAT_ID)return json({error:'TELEGRAM_NOT_CONFIGURED'},500);

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
    const response=await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`,{
      method:'POST',headers:{'Content-Type':'application/json'},
      body:JSON.stringify({chat_id:CHAT_ID,text:message,parse_mode:'HTML',disable_web_page_preview:true})
    });
    const result=await response.json().catch(()=>({}));
    if(!response.ok||result?.ok===false)throw new Error(result?.description||`Telegram HTTP ${response.status}`);
    const {error:finishError}=await admin.rpc('v2_finish_birthday_reminder',{p_day:day,p_error:null});
    if(finishError)throw finishError;
    return json({ok:true,sent:1,count:names.length});
  }catch(error){
    await admin.rpc('v2_finish_birthday_reminder',{p_day:day,p_error:String(error).slice(0,1000)});
    return json({error:'SEND_FAILED'},500);
  }
});
