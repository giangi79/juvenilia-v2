import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const SUPABASE_URL=Deno.env.get('SUPABASE_URL')||'';
const BOT_TOKEN=Deno.env.get('TELEGRAM_BOT_TOKEN')||'';
const CHAT_ID=Deno.env.get('TELEGRAM_CHAT_ID')||'';
const CRON_SECRET=Deno.env.get('TELEGRAM_CRON_SECRET')||'';

function envKey(jsonName,legacyName){
  const legacy=Deno.env.get(legacyName);
  if(legacy)return legacy;
  const raw=Deno.env.get(jsonName);
  if(!raw)return '';
  try{
    const parsed=JSON.parse(raw);
    return parsed.default || Object.values(parsed)[0] || '';
  }catch{return ''}
}

const PUBLISHABLE_KEY=envKey('SUPABASE_PUBLISHABLE_KEYS','SUPABASE_ANON_KEY');
const SECRET_KEY=envKey('SUPABASE_SECRET_KEYS','SUPABASE_SERVICE_ROLE_KEY');

const admin=createClient(SUPABASE_URL,SECRET_KEY,{
  auth:{persistSession:false,autoRefreshToken:false}
});

const cors={
  'Access-Control-Allow-Origin':'*',
  'Access-Control-Allow-Headers':'authorization, x-client-info, apikey, content-type, x-cron-secret',
  'Access-Control-Allow-Methods':'POST, OPTIONS',
  'Content-Type':'application/json'
};

const CATEGORIES=['GIOVANISSIMI','ESORDIENTI','R12','RAGAZZI','ALLIEVI','JUNIOR','SENIOR'];

function json(data,status=200){
  return new Response(JSON.stringify(data),{status,headers:cors});
}

function assertTelegramConfig(){
  if(!BOT_TOKEN||!CHAT_ID)throw new Error('TELEGRAM_NOT_CONFIGURED');
}

function escapeHtml(value){
  return String(value??'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

function chunks(text,max=3900){
  const lines=String(text||'').split('\n');
  const out=[];
  let current='';
  for(const line of lines){
    const next=current?current+'\n'+line:line;
    if(next.length>max && current){
      out.push(current);
      current=line;
    }else{
      current=next;
    }
  }
  if(current)out.push(current);
  return out;
}

async function sendTelegram(text){
  assertTelegramConfig();
  let last=null;
  for(const part of chunks(text)){
    const res=await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`,{
      method:'POST',
      headers:{'Content-Type':'application/json'},
      body:JSON.stringify({
        chat_id:CHAT_ID,
        text:part,
        parse_mode:'HTML',
        disable_web_page_preview:true
      })
    });
    const data=await res.json().catch(()=>({}));
    if(!res.ok||data?.ok===false){
      throw new Error(data?.description||`Telegram HTTP ${res.status}`);
    }
    last=data;
  }
  return last;
}

async function requireAdmin(req){
  const auth=req.headers.get('authorization')||'';
  const token=auth.startsWith('Bearer ')?auth.slice(7):'';
  if(!token)return null;

  const userClient=createClient(SUPABASE_URL,PUBLISHABLE_KEY,{
    auth:{persistSession:false,autoRefreshToken:false}
  });
  const {data:{user},error}=await userClient.auth.getUser(token);
  if(error||!user)return null;

  const {data:row,error:adminError}=await admin
    .from('v2_admin_users')
    .select('user_id')
    .eq('user_id',user.id)
    .maybeSingle();

  if(adminError||!row)return null;
  return user;
}

function isCron(req){
  const supplied=req.headers.get('x-cron-secret')||'';
  return !!CRON_SECRET && supplied===CRON_SECRET;
}

function categoryOf(r){
  return String(r.category_override||r.athlete?.category||'SENZA CATEGORIA').toUpperCase();
}

function categoryRank(cat){
  const i=CATEGORIES.indexOf(String(cat||'').toUpperCase());
  return i<0?999:i;
}

async function buildSummary(eventId,categories=null,label=null){
  const {data:event,error:eventError}=await admin
    .from('v2_events')
    .select('id,title,registration_deadline')
    .eq('id',eventId)
    .single();
  if(eventError||!event)throw new Error('Gara non trovata');

  const {data:regs,error}=await admin
    .from('v2_event_registrations')
    .select('status,companion_name,race_day,category_override,athlete:v2_athletes(full_name,category,gender)')
    .eq('event_id',eventId);
  if(error)throw error;

  let rows=regs||[];
  if(Array.isArray(categories)&&categories.length){
    const allowed=new Set(categories.map(x=>String(x).toUpperCase()));
    rows=rows.filter(r=>allowed.has(categoryOf(r)));
  }

  rows.sort((a,b)=>{
    const ca=categoryOf(a),cb=categoryOf(b);
    const d=categoryRank(ca)-categoryRank(cb);
    if(d)return d;
    return String(a.athlete?.full_name||'').localeCompare(String(b.athlete?.full_name||''),'it');
  });

  const yes=rows.filter(r=>r.status==='yes');
  const no=rows.filter(r=>r.status==='no');
  const pending=rows.filter(r=>r.status==='pending');

  const lines=[
    '🏁 <b>JUVENILIA · RIEPILOGO GARA</b>',
    `🏆 <b>${escapeHtml(event.title)}</b>`,
  ];
  if(label)lines.push(`⏱ ${escapeHtml(label)}`);
  lines.push(
    '',
    '<b>Situazione iscrizioni</b>',
    `✅ Partecipa: <b>${yes.length}</b>`,
    `❌ Non partecipa: <b>${no.length}</b>`,
    `⏳ Da definire: <b>${pending.length}</b>`,
    ''
  );

  const appendGroup=(title,list)=>{
    lines.push(title);
    if(!list.length){
      lines.push('<i>Nessuno</i>');
      lines.push('');
      return;
    }
    let lastCat='';
    for(const r of list){
      const cat=categoryOf(r);
      if(cat!==lastCat){
        lines.push(`🏅 <b>${escapeHtml(cat)}</b>`);
        lastCat=cat;
      }
      let name=`• ${escapeHtml(r.athlete?.full_name||'Atleta')}`;
      if(r.race_day)name+=` · ${escapeHtml(r.race_day)}`;
      if(r.companion_name&&r.status==='yes')name+=` · acc. ${escapeHtml(r.companion_name)}`;
      lines.push(name);
    }
    lines.push('');
  };

  appendGroup('✅ <b>PARTECIPANO</b>',yes);
  appendGroup('❌ <b>NON PARTECIPANO</b>',no);
  appendGroup('⏳ <b>DA DEFINIRE</b>',pending);
  return lines.join('\n').trim();
}

async function markDeadlineSent(item){
  const payload=item.payload||{};
  if(payload.scope==='event'){
    await admin.from('v2_events')
      .update({telegram_deadline_sent_at:new Date().toISOString()})
      .eq('id',item.event_id);
  }else if(payload.scope==='timer'&&payload.timer_id){
    await admin.from('v2_event_timers')
      .update({notification_sent_at:new Date().toISOString()})
      .eq('id',payload.timer_id);
  }
}

function statusMessage(item){
  const p=item?.payload||{};
  const symbol=p.status==='yes'?'✅':'❌';
  const label=p.status==='yes'?'PARTECIPA':'NON PARTECIPA';
  return [
    '🏁 <b>JUVENILIA · ISCRIZIONI</b>',
    `🏆 <b>${escapeHtml(p.event_title||'Gara')}</b>`,
    '',
    `${symbol} <b>${label}</b>`,
    `👤 ${escapeHtml(p.athlete_name||'Atleta')}`,
    `🏅 ${escapeHtml(p.category||'Categoria')}`
  ].join('\n');
}

async function processStatusNow(eventSlug,athleteId,status){
  assertTelegramConfig();
  if(!eventSlug||!athleteId||!['yes','no'].includes(status)){
    return {sent:false,reason:'INVALID_STATUS_REQUEST'};
  }

  const {data:item,error}=await admin.rpc('v2_claim_telegram_status_now',{
    p_event_slug:eventSlug,
    p_athlete_id:athleteId,
    p_status:status
  }).maybeSingle();

  if(error)throw error;
  if(!item)return {sent:false,reason:'NO_PENDING_NOTIFICATION'};

  try{
    await sendTelegram(statusMessage(item));
    await admin.rpc('v2_finish_telegram_outbox',{p_id:item.id,p_error:null});
    return {sent:true};
  }catch(err){
    const message=String(err?.message||err).slice(0,1000);
    await admin.rpc('v2_finish_telegram_outbox',{p_id:item.id,p_error:message});
    throw err;
  }
}

async function processQueue(){
  assertTelegramConfig();

  await admin.rpc('v2_enqueue_due_telegram_deadlines');

  const {data:items,error}=await admin.rpc('v2_claim_telegram_deadline_outbox',{p_limit:50});
  if(error)throw error;

  let sent=0,failed=0;
  for(const item of items||[]){
    try{
      let text='';
      if(item.kind==='status'){
        text=statusMessage(item);
      }else if(item.kind==='deadline'){
        const p=item.payload||{};
        text=await buildSummary(
          item.event_id,
          Array.isArray(p.categories)?p.categories:null,
          p.label||'Scadenza iscrizioni'
        );
      }else{
        throw new Error('Tipo notifica non supportato');
      }

      await sendTelegram(text);
      await admin.rpc('v2_finish_telegram_outbox',{p_id:item.id,p_error:null});
      if(item.kind==='deadline')await markDeadlineSent(item);
      sent++;
    }catch(err){
      const message=String(err?.message||err).slice(0,1000);
      await admin.rpc('v2_finish_telegram_outbox',{p_id:item.id,p_error:message});
      failed++;
    }
  }
  return {sent,failed};
}

Deno.serve(async req=>{
  if(req.method==='OPTIONS')return new Response('ok',{headers:cors});
  if(req.method!=='POST')return json({error:'METHOD_NOT_ALLOWED'},405);

  try{
    const body=await req.json().catch(()=>({}));
    const action=body?.action||'';

    if(action==='process'){
      if(!isCron(req))return json({error:'CRON_UNAUTHORIZED'},401);
      const result=await processQueue();
      return json({ok:true,...result,message:`Telegram: ${result.sent} inviati, ${result.failed} errori.`});
    }

    if(action==='status_now'){
      const result=await processStatusNow(body?.event_slug,body?.athlete_id,body?.status);
      return json({ok:true,...result,message:result.sent?'Notifica Telegram inviata.':'Nessuna notifica Telegram in attesa.'});
    }

    const user=await requireAdmin(req);
    if(!user)return json({error:'ADMIN_REQUIRED'},401);

    if(action==='test'){
      assertTelegramConfig();
      await sendTelegram([
        '✅ <b>JUVENILIA · TEST TELEGRAM</b>',
        '',
        'La connessione funziona correttamente.',
        `👤 Admin: ${escapeHtml(user.email||user.id)}`
      ].join('\n'));
      return json({ok:true,message:'Messaggio di test inviato.'});
    }

    if(action==='manual_summary'){
      if(!body?.event_id)return json({error:'EVENT_REQUIRED'},400);
      const text=await buildSummary(body.event_id,null,'Riepilogo manuale');
      await sendTelegram(text);
      return json({ok:true,message:'Riepilogo Telegram inviato.'});
    }

    return json({error:'UNKNOWN_ACTION'},400);
  }catch(err){
    console.error(err);
    const message=String(err?.message||err);
    if(message==='TELEGRAM_NOT_CONFIGURED'){
      return json({error:'Telegram non configurato nei Secrets Supabase.'},503);
    }
    return json({error:message},500);
  }
});
