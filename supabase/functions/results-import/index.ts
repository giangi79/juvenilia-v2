import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const SUPABASE_URL=Deno.env.get('SUPABASE_URL')||'';

function envKey(jsonName:string,legacyName:string){
  const legacy=Deno.env.get(legacyName); if(legacy)return legacy;
  const raw=Deno.env.get(jsonName); if(!raw)return '';
  try{const parsed=JSON.parse(raw);return parsed.default||Object.values(parsed)[0]||''}catch{return ''}
}

const PUBLISHABLE_KEY=envKey('SUPABASE_PUBLISHABLE_KEYS','SUPABASE_ANON_KEY');
const SECRET_KEY=envKey('SUPABASE_SECRET_KEYS','SUPABASE_SERVICE_ROLE_KEY');
const admin=createClient(SUPABASE_URL,SECRET_KEY,{auth:{persistSession:false,autoRefreshToken:false}});
const cors={
  'Access-Control-Allow-Origin':'*',
  'Access-Control-Allow-Headers':'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods':'POST, OPTIONS',
  'Content-Type':'application/json'
};

const json=(data:unknown,status=200)=>new Response(JSON.stringify(data),{status,headers:cors});

async function requireAdmin(req:Request){
  const auth=req.headers.get('authorization')||'';
  const token=auth.startsWith('Bearer ')?auth.slice(7):'';
  if(!token)return null;
  const client=createClient(SUPABASE_URL,PUBLISHABLE_KEY,{auth:{persistSession:false,autoRefreshToken:false}});
  const {data:{user},error}=await client.auth.getUser(token);
  if(error||!user)return null;
  const {data}=await admin.from('v2_admin_users').select('user_id').eq('user_id',user.id).maybeSingle();
  return data?user:null;
}

function decodeHtml(value:string){
  const named:Record<string,string>={amp:'&',lt:'<',gt:'>',quot:'"',apos:"'",nbsp:' ',agrave:'à',egrave:'è',eacute:'é',igrave:'ì',ograve:'ò',ugrave:'ù'};
  return value.replace(/&(#x?[0-9a-f]+|[a-z]+);/gi,(_,key)=>{
    if(key[0]==='#'){
      const hex=key[1]?.toLowerCase()==='x';
      const n=parseInt(key.slice(hex?2:1),hex?16:10);
      return Number.isFinite(n)?String.fromCodePoint(n):' ';
    }
    return named[key.toLowerCase()]??' ';
  });
}

function textOf(html:string){
  return decodeHtml(html
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi,' ')
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi,' ')
    .replace(/<br\s*\/?\s*>/gi,' | ')
    .replace(/<[^>]+>/g,' '))
    .replace(/\s+/g,' ').trim();
}

function normalize(value:string){
  return textOf(value).normalize('NFD').replace(/[\u0300-\u036f]/g,'')
    .toUpperCase().replace(/[^A-Z0-9]+/g,' ').replace(/\s+/g,' ').trim();
}

function pageTitle(html:string,url:string){
  const match=html.match(/<title\b[^>]*>([\s\S]*?)<\/title>/i);
  return textOf(match?.[1]||'')||new URL(url).pathname.split('/').pop()||'Risultati';
}

function rowsOf(html:string){
  const rows:{cells:string[],text:string}[]=[];
  for(const row of html.matchAll(/<tr\b[^>]*>([\s\S]*?)<\/tr>/gi)){
    const cells=[...row[1].matchAll(/<t[dh]\b[^>]*>([\s\S]*?)<\/t[dh]>/gi)].map(x=>textOf(x[1])).filter(Boolean);
    const text=cells.join(' | ');
    if(cells.length&&text)rows.push({cells,text});
  }
  if(rows.length)return rows;
  return html.split(/<br\s*\/?\s*>|\r?\n/gi).map(textOf).filter(x=>x.length>5).map(text=>({cells:[text],text}));
}

function linksOf(html:string,current:string,rootDir:string){
  const out:string[]=[];
  for(const match of html.matchAll(/(?:href|src)\s*=\s*["']([^"'#]+)["']/gi)){
    try{
      const u=new URL(match[1],current);u.hash='';
      if(u.protocol!=='https:'||u.hostname!=='attivita.rollergames.it')continue;
      if(!u.pathname.startsWith(rootDir))continue;
      if(/\.(?:css|js|png|jpe?g|gif|svg|ico|zip|xls[x]?|doc[x]?)$/i.test(u.pathname))continue;
      out.push(u.href);
    }catch{/* collegamento non valido */}
  }
  return [...new Set(out)];
}

function athleteMatches(row:string,name:string){
  const hay=normalize(row),tokens=normalize(name).split(' ').filter(x=>x.length>1);
  return tokens.length>=2&&tokens.every(token=>hay.includes(token));
}

function isJuveniliaResult(cells:string[]){
  return cells.some(cell=>normalize(cell).split(' ').includes('JUVENILIA'));
}

function conciseResult(title:string,cells:string[],fallback:string){
  if(normalize(title).includes('CLASSIFICA FINALE')){
    const position=String(cells[0]||'').trim();
    if(/^\d+$/.test(position))return `${position}°`;
  }
  return fallback;
}

async function fetchPage(url:string){
  const response=await fetch(url,{headers:{'user-agent':'Juvenilia-Risultati/1.0','accept':'text/html,application/xhtml+xml'}});
  if(!response.ok)throw new Error(`HTTP ${response.status}`);
  const type=response.headers.get('content-type')||'';
  if(!type.includes('html')&&!/\.html?$/i.test(new URL(url).pathname))return null;
  const html=await response.text();
  return html.slice(0,2_000_000);
}

Deno.serve(async(req:Request)=>{
  if(req.method==='OPTIONS')return new Response('ok',{headers:cors});
  if(req.method!=='POST')return json({error:'METHOD_NOT_ALLOWED'},405);
  if(!(await requireAdmin(req)))return json({error:'NOT_AUTHORIZED'},401);
  try{
    const body=await req.json();
    const eventId=String(body?.event_id||'');
    const sourceUrl=String(body?.source_url||'').trim();
    const root=new URL(sourceUrl);
    if(root.protocol!=='https:'||root.hostname!=='attivita.rollergames.it')return json({error:'Sono ammessi solo link HTTPS di attivita.rollergames.it'},400);
    const rootDir=root.pathname.slice(0,root.pathname.lastIndexOf('/')+1);

    const [{data:event,error:eventError},{data:regs,error:regsError}]=await Promise.all([
      admin.from('v2_events').select('id,title').eq('id',eventId).single(),
      admin.from('v2_event_registrations').select('athlete_id,category_override,athlete:v2_athletes(full_name,category)').eq('event_id',eventId).eq('status','yes')
    ]);
    if(eventError||!event)return json({error:'Gara non trovata'},404);
    if(regsError)throw regsError;

    const athletes=(regs||[]).filter((r:any)=>r.athlete).map((r:any)=>({
      athlete_id:r.athlete_id,
      full_name:r.athlete.full_name,
      category:r.category_override||r.athlete.category||''
    }));
    const found=new Map<string,any[]>();
    for(const athlete of athletes)found.set(athlete.athlete_id,[]);
    const queue=[root.href],visited=new Set<string>();
    const errors:{url:string,error:string}[]=[];
    const MAX_PAGES=80;

    while(queue.length&&visited.size<MAX_PAGES){
      const url=queue.shift()!;
      if(visited.has(url))continue;
      visited.add(url);
      try{
        const html=await fetchPage(url);if(!html)continue;
        const title=pageTitle(html,url);
        if(normalize(title).includes('FORMULA TIEZZI'))continue;
        for(const row of rowsOf(html)){
          if(!isJuveniliaResult(row.cells))continue;
          for(const athlete of athletes){
            if(!athleteMatches(row.text,athlete.full_name))continue;
            const list=found.get(athlete.athlete_id)!;
            const key=`${url}|${normalize(row.text)}`;
            if(!list.some(x=>x.key===key))list.push({key,source_page:url,page_title:title,result_cells:row.cells,result_text:conciseResult(title,row.cells,row.text)});
          }
        }
        for(const link of linksOf(html,url,rootDir))if(!visited.has(link)&&!queue.includes(link))queue.push(link);
      }catch(error){errors.push({url,error:error instanceof Error?error.message:String(error)})}
    }

    const matches=athletes.map(a=>({...a,results:(found.get(a.athlete_id)||[]).map(({key,...x})=>x)}));
    await admin.from('v2_events').update({results_url:root.href}).eq('id',eventId);
    return json({
      event,
      source_url:root.href,
      pages_scanned:visited.size,
      athletes_total:athletes.length,
      athletes_matched:matches.filter(x=>x.results.length).length,
      matches:matches.filter(x=>x.results.length),
      unmatched:matches.filter(x=>!x.results.length).map(({athlete_id,full_name,category})=>({athlete_id,full_name,category})),
      warnings:errors.slice(0,10)
    });
  }catch(error){return json({error:error instanceof Error?error.message:String(error)},500)}
});
