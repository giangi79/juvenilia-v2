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
   const races=String(mode==='categoria'?values[4]:values[6]).split(',').map(x=>x.trim()).filter(Boolean);
   group.rows.push({name:values[1],category,races,details:mode==='categoria'?[values[0]?'N. '+values[0]:'',values[3],races.length?'Gare: '+races.join(', '):'']:[values[0]?'N. '+values[0]:'',values[4],values[5],races.length?'Gare: '+races.join(', '):'']});
 }
 return out.filter(g=>g.rows.length);
}
function updateFilters(){
 const categories=[...new Set(groups.flatMap(g=>g.rows.map(r=>r.category)).filter(Boolean))].sort((a,b)=>a.localeCompare(b,'it'));
 const races=[...new Set(groups.flatMap(g=>g.rows.flatMap(r=>r.races)))].sort((a,b)=>a.localeCompare(b,'it',{numeric:true}));
 [['categoryFilter',categories,'Tutte le categorie'],['raceFilter',races,'Tutte le gare']].forEach(([id,values,label])=>{
   const select=$(id),previous=select.value;select.replaceChildren(new Option(label,''));
   values.forEach(value=>select.add(new Option(value,value)));
   if(values.includes(previous))select.value=previous;
 });
}
function render(){const query=$('search').value.trim().toLocaleLowerCase('it'),root=$('results');root.replaceChildren();let count=0;
 groups.forEach(group=>{const rows=group.rows.filter(r=>(!$('categoryFilter').value||r.category===$('categoryFilter').value)&&(!$('raceFilter').value||r.races.includes($('raceFilter').value))&&(group.title+' '+r.name+' '+r.details.join(' ')).toLocaleLowerCase('it').includes(query));if(!rows.length)return;count+=rows.length;const section=document.createElement('section');section.className='group';const title=document.createElement('h2');title.textContent=group.title;section.append(title);rows.forEach(row=>{const div=document.createElement('div');div.className='row';const name=document.createElement('strong');name.textContent=row.name;const detail=document.createElement('span');detail.textContent=row.details.filter(Boolean).join(' · ');div.append(name,detail);section.append(div)});root.append(section)});
 $('status').textContent=count?count+' iscritti visualizzati':'Nessun iscritto trovato.';
}
async function load(){const current=++request;$('results').replaceChildren();$('status').textContent='Caricamento elenco ufficiale…';$('cat').classList.toggle('active',mode==='categoria');$('club').classList.toggle('active',mode==='societa');$('source').href=sourceUrl();if(!/^[0-9]{4}$/.test(id)){$('status').textContent='Numero gara non valido.';return}
 try{const {data,error}=await db.functions.invoke('official-entrants',{body:{id,mode}});if(current!==request)return;if(error||!data?.html)throw Error();groups=parse(data.html);updateFilters();render()}catch{if(current===request)$('status').textContent='Impossibile caricare gli iscritti. Puoi aprire la pagina ufficiale.'}}
$('cat').onclick=()=>{mode='categoria';history.replaceState({},'', '?id='+encodeURIComponent(id)+'&vista=categoria');load()};
$('club').onclick=()=>{mode='societa';history.replaceState({},'', '?id='+encodeURIComponent(id)+'&vista=societa');load()};
$('search').addEventListener('input',render);$('categoryFilter').addEventListener('change',render);$('raceFilter').addEventListener('change',render);load();