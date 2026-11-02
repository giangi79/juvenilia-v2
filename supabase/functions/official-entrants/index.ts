Deno.serve(async req=>{
const cors={'Access-Control-Allow-Origin':'*','Access-Control-Allow-Headers':'authorization, x-client-info, apikey, content-type','Access-Control-Allow-Methods':'POST, OPTIONS'};
if(req.method==='OPTIONS')return new Response('ok',{headers:cors});
if(req.method!=='POST')return new Response('Method not allowed',{status:405,headers:cors});
try{const body=await req.json();const id=String(body.id||'');const mode=body.mode;
if(!/^[0-9]{4}$/.test(id)||!['categoria','societa'].includes(mode))return new Response('Invalid request',{status:400,headers:cors});
const path=mode==='categoria'?'manifestazione_categ.php?id='+id:'manifestazione_societa.php?short&id='+id;
const response=await fetch('https://attivita.rollergames.it/corsa/'+path,{signal:AbortSignal.timeout(12000),redirect:'error'});
if(!response.ok)throw Error('Fonte non disponibile');
const raw=await response.arrayBuffer();if(raw.byteLength>2000000)throw Error('Risposta troppo grande');
const html=new TextDecoder('utf-8').decode(raw);
return new Response(JSON.stringify({html}),{headers:{...cors,'Content-Type':'application/json','Cache-Control':'no-store'}});
}catch{return new Response(JSON.stringify({error:'Elenco ufficiale non disponibile'}),{status:502,headers:{...cors,'Content-Type':'application/json'}})}
});