import { db } from './supabase.js';
const $=id=>document.getElementById(id),params=new URLSearchParams(location.search),id=params.get('id')||'';
let mode=params.get('vista')==='societa'?'societa':'categoria',groups=[],request=0;
function sourceUrl(){return mode==='categoria'?'https://attivita.rollergames.it/corsa/manifestazione_categ.php?id='+id:'https://attivita.rollergames.it/corsa/manifestazione_societa.php?short&id='+id}
function parse(html){
 const doc=new DOMParser().parseFromString(html,'text/html'),out=[];let group=null;
 const race=doc.querySelector('body > h3');$('race').textContent=race?.textContent?.replace(/\s+/g,' ').trim()||'Elenco ufficiale FISR';
 for(const tr of doc.querySelectorAll('table tr')){
   const cells=[...tr.children].filter(c=>c.tagName==='TD'||c.tagName==='TH');
   const heading=cells.length===1?cells[0].querySelector('h3'):null;
   if(heading){group={title:heading.textContent.trim(),rows:[]};out.push(group);continue}
   if(!group)continue;
   const values=cells.map(c=>c.textContent.replace(/\s+/g,' ').trim());
   if(values.length<(mode==='categoria'?7:9)||/^(atleta|num|ok)$/i.test(values[1]||'')||/^(num|ok)$/i.test(values[0]||'')&&values[1]?.toLowerCase()==='atleta')continue;
   const category=mode==='categoria'?group.title.replace(/\s*\([0-9]+\)\s*$/,'').replace(/\s+[MF]\s*$/i,'').trim():values[4];
   const gender=mode==='categoria'?(group.title.replace(/\s*\([0-9]+\)\s*$/,'').match(/\s+([MF])\s*$/i)?.[1]||'').toUpperCase():String(values[5]||'').trim().toUpperCase();
   const races=String(mode==='categoria'?values[4]:values[6]).split(',').map(x=>x.trim()).filter(Boolean);
   const club=mode==='categoria'?String(values[3]||'').trim():group.title.replace(/\s*\([0-9]+\)\s*$/,'').trim();
   group.rows.push({name:values[1],category,gender,races,club,details:mode==='categoria'?[values[0]?'N. '+values[0]:'',values[3],races.length?'Gare: '+races.join(', '):'']:[values[0]?'N. '+values[0]:'',values[4],values[5],races.length?'Gare: '+races.join(', '):'']});
 }
 return out.filter(g=>g.rows.length);
}
function updateFilters(){
 const all=groups.flatMap(g=>g.rows);
 const categories=[...new Set(all.map(r=>r.category).filter(Boolean))].sort((a,b)=>a.localeCompare(b,'it'));
 const category=$('categoryFilter'),previousCategory=category.value;
 category.replaceChildren(new Option('Tutte le categorie',''));
 categories.forEach(value=>category.add(new Option(value,value)));
 if(categories.includes(previousCategory))category.value=previousCategory;
 const clubs=[...new Set(all.map(r=>r.club).filter(Boolean))].sort((a,b)=>a.localeCompare(b,'it',{sensitivity:'base'}));
 const club=$('clubFilter'),previousClub=club.value;
 club.replaceChildren(new Option('Tutte le società',''));
 clubs.forEach(value=>club.add(new Option(value,value)));
 if(clubs.includes(previousClub))club.value=previousClub;
 updateRaceFilter();
}
function updateRaceFilter(){
 const category=$('categoryFilter').value,gender=$('genderFilter').value,club=$('clubFilter').value;
 const races=[...new Set(groups.flatMap(g=>g.rows).filter(r=>(!category||r.category===category)&&(!gender||r.gender===gender)&&(!club||r.club===club)).flatMap(r=>r.races))].sort((a,b)=>a.localeCompare(b,'it',{numeric:true}));
 const select=$('raceFilter'),previous=select.value;
 select.replaceChildren(new Option('Tutte le gare',''));
 races.forEach(value=>select.add(new Option(value,value)));
 if(races.includes(previous))select.value=previous;
}
function render(){const query=$('search').value.trim().toLocaleLowerCase('it'),root=$('results');root.replaceChildren();let count=0;
 groups.forEach(group=>{const rows=group.rows.filter(r=>(!$('categoryFilter').value||r.category===$('categoryFilter').value)&&(!$('genderFilter').value||r.gender===$('genderFilter').value)&&(!$('raceFilter').value||r.races.includes($('raceFilter').value))&&(!$('clubFilter').value||r.club===$('clubFilter').value)&&(group.title+' '+r.name+' '+r.details.join(' ')).toLocaleLowerCase('it').includes(query));if(!rows.length)return;count+=rows.length;const section=document.createElement('section');section.className='group';const title=document.createElement('h2');title.textContent=group.title.replace(/\s*\([0-9]+\)\s*$/,'')+' ('+rows.length+')';section.append(title);rows.forEach(row=>{const div=document.createElement('div');div.className='row';const name=document.createElement('strong');name.textContent=row.name;const detail=document.createElement('span');detail.textContent=row.details.filter(Boolean).join(' · ');div.append(name,detail);section.append(div)});root.append(section)});
 $('status').textContent=count?count+' iscritti visualizzati':'Nessun iscritto trovato.';
}
async function load(){const current=++request;$('results').replaceChildren();$('status').textContent='Caricamento elenco ufficiale…';$('cat').classList.toggle('active',mode==='categoria');$('club').classList.toggle('active',mode==='societa');$('source').href=sourceUrl();if(!/^[0-9]{4}$/.test(id)){$('status').textContent='Numero gara non valido.';return}
 try{const {data,error}=await db.functions.invoke('official-entrants',{body:{id,mode}});if(current!==request)return;if(error||!data?.html)throw Error();groups=parse(data.html);updateFilters();render()}catch{if(current===request)$('status').textContent='Impossibile caricare gli iscritti. Puoi aprire la pagina ufficiale.'}}
$('cat').onclick=()=>{mode='categoria';history.replaceState({},'', '?id='+encodeURIComponent(id)+'&vista=categoria');load()};
$('club').onclick=()=>{mode='societa';history.replaceState({},'', '?id='+encodeURIComponent(id)+'&vista=societa');load()};
$('resetFilters').addEventListener('click',()=>{$('search').value='';$('categoryFilter').value='';$('genderFilter').value='';$('raceFilter').value='';$('clubFilter').value='';updateRaceFilter();render()});
$('search').addEventListener('input',render);$('categoryFilter').addEventListener('change',()=>{updateRaceFilter();render()});$('genderFilter').addEventListener('change',()=>{updateRaceFilter();render()});$('raceFilter').addEventListener('change',render);$('clubFilter').addEventListener('change',()=>{updateRaceFilter();render()});load();
let pullStart=0,pullDistance=0,pullActive=false;
const hint=document.createElement('div');hint.className='pull-refresh-hint';hint.setAttribute('aria-live','polite');document.body.append(hint);
const atTop=()=>Math.max(0,window.scrollY||0,document.documentElement.scrollTop||0,document.body.scrollTop||0)<=1;
window.addEventListener('touchstart',event=>{pullActive=atTop()&&event.touches.length===1;pullDistance=0;if(pullActive)pullStart=event.touches[0].clientY},{passive:true});
window.addEventListener('touchmove',event=>{if(!pullActive||event.touches.length!==1)return;pullDistance=event.touches[0].clientY-pullStart;if(pullDistance<=0){pullActive=false;hint.classList.remove('visible');return}hint.textContent=pullDistance>=78?'Rilascia per aggiornare':'Trascina per aggiornare';hint.classList.add('visible');if(pullDistance>=78&&event.cancelable)event.preventDefault()},{passive:false});
window.addEventListener('touchend',()=>{const refresh=pullActive&&pullDistance>=78&&atTop();pullActive=false;pullDistance=0;hint.classList.remove('visible');if(refresh)location.reload()},{passive:true});
window.addEventListener('touchcancel',()=>{pullActive=false;pullDistance=0;hint.classList.remove('visible')},{passive:true});
