import * as db from './db.js';
import {groups,uid,num,repsText,dayKey,suggestWeight,antecedents,canWarmup,recentExercises,excludedIDs} from './model.js';
import {exportData,prepareImport,importData} from './transfer.js';
import * as cloud from './cloud.js';
import {icon,muscleIcon} from './icons.js';

const app=document.querySelector('#app'),nav=document.querySelector('#nav'),foot=document.querySelector('#foot'),modal=document.querySelector('#modal');
let exercises=[],sessions=[],draft=null,tab='home',view=null,selection=null,layout='grid',filter='Todos',search='',persisted=false,waitingWorker=null;
let editing=null;                                  // saved session receiving exercises by hand
let pick={group:null,complement:'Ninguno'};        // muscle selection before a workout starts
let histMonth=new Date(new Date().getFullYear(),new Date().getMonth(),1),histDay=null;
let lastKey=null,pendingImport=null;

const STATIONS=[['sala1','Sala 1'],['sala2','Sala 2'],['sala3','Sala 3']];
const FEELINGS=['Fácil','Perfecto','Demasiado'];
const TABS=[['home','house','Inicio'],['history','calendar','Historial'],['catalog','dumbbell','Ejercicios'],['settings','gear','Ajustes']];
const MAIN_GROUPS=['Pecho','Espalda','Hombro','Pierna'];
const WORKOUT_VIEWS=['groups','select','grip','setup','active','rating','session:draft'];

/* ---------- small helpers ---------- */
const esc=x=>String(x??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const date=d=>new Date(d).toLocaleDateString('es-ES',{day:'2-digit',month:'2-digit',year:'numeric'});
const shortDate=d=>new Date(d).toLocaleDateString('es-ES',{day:'2-digit',month:'2-digit',year:'2-digit'});
const longDate=d=>new Date(d).toLocaleDateString('es-ES',{day:'numeric',month:'long'});
const clock=d=>new Date(d).toLocaleTimeString('es-ES',{hour:'2-digit',minute:'2-digit'});
const plural=(n,one,many)=>`${n} ${n===1?one:many}`;
const decimal=v=>Number(String(v).trim().replace(',','.'));
const addDays=(d,n)=>{const x=new Date(d);x.setDate(x.getDate()+n);return x;};
const stationName=v=>STATIONS.find(s=>s[0]===(v||'sala1'))?.[1]||v;
const minutes=s=>Math.round(s.entries.reduce((n,e)=>n+(e.seconds||0),0)/60);
function ago(iso){if(!iso)return 'todavía nunca';const m=Math.round((Date.now()-new Date(iso))/60000);if(m<1)return 'ahora mismo';if(m<60)return `hace ${m} min`;const h=Math.round(m/60);if(h<24)return `hace ${h} h`;return date(iso)+' '+clock(iso);}
function daysAgo(iso){if(!iso)return 'Sin registros';const n=Math.round((new Date(dayKey(new Date()))-new Date(dayKey(iso)))/86400000);return n<=0?'Hoy':n===1?'Ayer':`Hace ${n} días`;}
function toast(message){const el=document.querySelector('#notice');el.textContent=message;clearTimeout(toast.timer);toast.timer=setTimeout(()=>el.textContent='',4500);}

/* ---------- building blocks ---------- */
const btn=(label,action,cls='')=>`<button type="button" class="${cls}" data-action="${action}">${label}</button>`;
const iconBtn=(name,action,label)=>`<button type="button" class="icon-btn" data-action="${action}" aria-label="${label}">${icon(name)}</button>`;
const back=(label,action)=>`<button type="button" class="link back" data-action="${action}">${icon('chevron-left')}${esc(label)}</button>`;
const topbar=(left='',right='')=>`<div class="topbar">${left||'<span></span>'}${right||'<span></span>'}</div>`;
const thumb=(e,cls='')=>`<span class="thumb ${cls}">${e.image?`<img src="${esc(e.image)}" alt="" loading="lazy">`:muscleIcon(e.group)}</span>`;
const chevron=()=>icon('chevron-right','chev');
const section=(title,body,note='')=>`${title?`<h2 class="section">${esc(title)}</h2>`:''}<div class="list">${body}</div>${note?`<p class="footnote">${note}</p>`:''}`;
const row=(label,control,cls='')=>`<div class="row ${cls}"><span class="row-label">${label}</span>${control}</div>`;
// Radio-based segmented control for forms.
const seg=(name,options,current)=>`<div class="seg" role="radiogroup">${options.map(([v,l])=>`<label><input type="radio" name="${name}" value="${esc(v)}" ${v===current?'checked':''}><span>${esc(l)}</span></label>`).join('')}</div>`;
// Button-based segmented control for screens that keep their own state.
const segButtons=options=>`<div class="seg">${options.map(([action,label,on])=>`<button type="button" data-action="${esc(action)}" class="${on?'on':''}" aria-pressed="${on}">${label}</button>`).join('')}</div>`;
const toggle=(name,checked,id='')=>`<input type="checkbox" class="switch" name="${name}" ${id?`id="${id}"`:''} ${checked?'checked':''}>`;
const stepper=(name,value,min,max,attrs='',cls='')=>`<div class="stepper ${cls}" ${attrs}><button type="button" data-step="-1" aria-label="Menos">${icon('minus')}</button><input name="${name}" type="number" inputmode="numeric" min="${min}" max="${max}" value="${value}"><button type="button" data-step="1" aria-label="Más">${icon('plus')}</button></div>`;
const sheetBar=(title,submit='Guardar')=>`<header class="sheet-bar">${btn('Cancelar','close','link')}<h2>${esc(title)}</h2>${submit?`<button type="submit" class="link strong">${submit}</button>`:'<span></span>'}</header>`;

function show(html,{footer='',bar=true,cls=''}={}){
 app.className=cls;app.innerHTML=html;foot.innerHTML=footer;
 nav.innerHTML=bar?TABS.map(([id,ic,label])=>`<button type="button" data-tab="${id}" class="${tab===id?'active':''}" aria-current="${tab===id?'page':'false'}">${icon(ic)}<span>${label}</span></button>`).join(''):'';
 document.body.dataset.chrome=footer?'foot':bar?'nav':'none';
 const key=view||tab;if(key!==lastKey){scrollTo(0,0);lastKey=key;}
 try{sessionStorage.setItem('gym11-nav',JSON.stringify({tab,view,editing,filter}));}catch{}
}
// After a reload (iOS may restart the app in the background) go back to the same screen.
function restorePlace(){
 let saved;try{saved=JSON.parse(sessionStorage.getItem('gym11-nav')||'null');}catch{}
 if(!saved)return;
 if(TABS.some(t=>t[0]===saved.tab))tab=saved.tab;
 editing=saved.editing||null;if(['Todos',...groups].includes(saved.filter))filter=saved.filter;
 view=saved.view||null;
 if(view==='groups'){if(draft)view=null;}
 else if(WORKOUT_VIEWS.includes(view)){if(!draft)view=null;else{selection=draft.selection||null;if(view!=='session:draft')view=selection&&['grip','setup','active','rating'].includes(draft.phase)?draft.phase:'select';}}
 else if(view==='pick'&&!sessions.some(x=>x.id===editing))view=null;
}
function openDialog(html){modal.innerHTML=`<div class="grabber" aria-hidden="true"></div>${html}`;if(!modal.open)modal.showModal();modal.scrollTop=0;}
function close(){if(modal.open)modal.close();}

async function load(){exercises=await db.all('exercises');sessions=(await db.all('sessions')).sort((a,b)=>new Date(b.date)-new Date(a.date));draft=(await db.get('drafts','active'))?.value||null;}
async function saveDraft(){if(draft)await db.put('drafts',{id:'active',value:draft});}
async function saveSelection(){if(draft){draft.selection=selection;draft.phase=view;await saveDraft();}}
function reorder(s){const order={};s.entries.forEach(e=>e.order=order[e.exercise.group]=(order[e.exercise.group]||0)+1);}
function currentSession(){if(view==='pick')return sessions.find(s=>s.id===editing);return view==='session:draft'?draft:sessions.find(s=>s.id===view?.slice(8));}
async function persistSession(s){if(s===draft)await saveDraft();else{s.editedAfterImport=true;await db.put('sessions',s);}}
const allowsComplement=g=>!['Pierna','Glúteo'].includes(g);
const defaultComplement=g=>g==='Pecho'?'Tríceps':g==='Espalda'?'Bíceps':'Ninguno';
const lastFor=g=>sessions.find(s=>s.groups.includes(g)&&s.entries.some(e=>e.exercise.group===g));

/* ---------- router ---------- */
function render(){
 if(view==='groups')return renderGroups();
 if(view==='select')return renderLibrary('workout');
 if(view==='pick')return renderLibrary('pick');
 if(view==='grip')return renderGrip();
 if(view==='setup')return renderSetup();
 if(view==='active')return renderActive();
 if(view==='rating')return renderRating();
 if(view?.startsWith('session:'))return renderSession(view.slice(8));
 if(view?.startsWith('exercise:'))return renderExercise(view.slice(9));
 if(tab==='catalog')return renderLibrary('tab');
 if(tab==='history')return renderHistory();
 if(tab==='settings')return renderSettings();
 renderHome();
}

/* ---------- home ---------- */
const miniBars=(counts,color)=>`<div class="minibars">${counts.map((c,i)=>`<i style="height:${c?9+Math.min(c,3)*5:6}px;${c?`background:${color};opacity:${(.55+i*.06).toFixed(2)}`:''}"></i>`).join('')}</div>`;
function sessionCard(s){return `<button type="button" class="card session" data-session="${esc(s.id)}"><span class="session-top">${s.groups.map(g=>muscleIcon(g)).join('')}<strong>${esc(s.groups.join(' + ')||s.historicalTitle||'Entreno')}</strong><small>${shortDate(s.date)}</small></span><span class="session-bottom"><small>${plural(s.entries.length,'ejercicio','ejercicios')}${minutes(s)?` · ${minutes(s)} min efectivos`:''}</small>${chevron()}</span></button>`;}
function renderHome(){
 const now=new Date(),today=dayKey(now),start=new Date(now.getFullYear(),now.getMonth(),now.getDate());
 const done=sessions.filter(s=>s.entries.length||s.historicalTitle),days=new Set(done.map(s=>dayKey(s.date)));
 const perDay=new Map();done.forEach(s=>{const k=dayKey(s.date);perDay.set(k,(perDay.get(k)||0)+Math.max(s.entries.length,1));});
 const monday=addDays(start,-((now.getDay()+6)%7));
 let streak=0,cursor=days.has(today)?start:addDays(start,-1);while(days.has(dayKey(cursor))){streak++;cursor=addDays(cursor,-1);}
 const fourWeeks=done.filter(s=>new Date(s.date)>=addDays(start,-27)).length;
 const weekly=Array.from({length:8},(_,i)=>{const a=addDays(monday,(i-7)*7),b=addDays(a,7);return done.filter(s=>new Date(s.date)>=a&&new Date(s.date)<b).length;});
 const daily=Array.from({length:8},(_,i)=>done.filter(s=>dayKey(s.date)===dayKey(addDays(start,i-7))).length);
 const monthLength=new Date(now.getFullYear(),now.getMonth()+1,0).getDate(),latest=done[0];
 const name=cloud.profile()?.firstName;
 show(`<header class="hero"><img src="assets/home-hero.jpg" alt=""><div class="hero-text"><div class="eyebrow">${esc(now.toLocaleDateString('es-ES',{weekday:'long',day:'numeric',month:'long'}))}</div><h1>${name?`Hola, ${esc(name)}`:'Hoy toca entrenar'}</h1><p>Disciplina hoy<br>para un mejor mañana.</p></div></header>
<div class="home-panel">
<section class="week card raised" aria-label="Esta semana">${['L','M','X','J','V','S','D'].map((letter,i)=>{const k=dayKey(addDays(monday,i)),isToday=k===today,isDone=days.has(k);return `<div class="${isToday?'today':''}"><small>${letter}</small><span class="dot ${isDone?'done':''}">${isDone?icon('check'):isToday?letter:''}</span></div>`;}).join('')}</section>
<button type="button" class="card month" data-tab="history"><span class="between"><strong>Tu actividad este mes</strong>${chevron()}</span><span class="monthbars">${Array.from({length:monthLength},(_,i)=>{const c=perDay.get(dayKey(new Date(now.getFullYear(),now.getMonth(),i+1)))||0;return `<i class="${c?'on':''}" style="height:${c?Math.min(54,15+c*7):7}px"></i>`;}).join('')}</span><span class="between muted"><small>1</small><small>${esc(now.toLocaleDateString('es-ES',{month:'long'}))}</small><small>${monthLength}</small></span></button>
<button type="button" class="primary" data-action="${draft?'resume':'start'}">${icon('play')}${draft?'Continuar entrenamiento':'Empezar entrenamiento'}</button>
<div class="stats"><div class="card raised stat"><span class="badge-icon blue">${icon('dumbbell')}</span><b>${fourWeeks}</b><strong>entrenos</strong><small>últimas 4 semanas</small>${miniBars(weekly,'var(--accent)')}</div><div class="card raised stat"><span class="badge-icon orange">${icon('flame')}</span><b>${streak}</b><strong>${streak===1?'día':'días'}</strong><small>racha actual</small>${miniBars(daily,'var(--orange)')}</div></div>
${latest?`<button type="button" class="card last" data-session="${esc(latest.id)}"><span class="badge-icon blue big">${icon('history')}</span><span class="grow"><small>Último entreno</small><strong>${esc(latest.groups.join(' + ')||latest.historicalTitle||'Entreno')}</strong><small>${esc(longDate(latest.date))}</small></span>${chevron()}</button>`:''}
</div>`,{cls:'flush'});
}

/* ---------- workout: muscle group ---------- */
function defaultGroup(){const mains=MAIN_GROUPS,last=g=>sessions.find(s=>s.groups[0]===g)?.date||'';return [...mains].sort((a,b)=>last(a)<last(b)?-1:last(a)>last(b)?1:0)[0];}
function renderGroups(){
 if(!pick.group){pick.group=defaultGroup();pick.complement=defaultComplement(pick.group);}
 const g=pick.group,last=lastFor(g),lastEntries=last?.entries.filter(e=>e.exercise.group===g)||[];
 const label=g+(allowsComplement(g)&&pick.complement!=='Ninguno'?' + '+pick.complement:'');
 show(`${topbar(back('Atrás','home'))}<h1>Elige grupo muscular</h1>
<div class="grid">${MAIN_GROUPS.map(x=>`<button type="button" class="card group ${x===g?'on':''}" data-group="${esc(x)}" aria-pressed="${x===g}"><span class="between top">${muscleIcon(x)}<small>${exercises.filter(e=>e.group===x&&!e.deleted).length}</small></span><strong>${esc(x)}</strong><small>${esc(daysAgo(lastFor(x)?.date))}</small></button>`).join('')}</div>
<div class="grid minor">${groups.filter(x=>!MAIN_GROUPS.includes(x)).map(x=>`<button type="button" class="card group small ${x===g?'on':''}" data-group="${esc(x)}" aria-pressed="${x===g}">${muscleIcon(x)}<strong>${esc(x)}</strong></button>`).join('')}</div>
${allowsComplement(g)?`<h2 class="section">Complemento</h2>${segButtons(['Tríceps','Bíceps','Ninguno'].filter(x=>x!==g).map(x=>['complement:'+x,x,pick.complement===x]))}`:''}
<div class="card last static"><span class="muted">${icon('history')}</span><span class="grow"><small>Última vez · ${esc(g)}</small>${last?`<strong>${esc(new Date(last.date).toLocaleDateString('es-ES',{day:'numeric',month:'long',year:'numeric'}))}</strong><small>${plural(lastEntries.length,'ejercicio','ejercicios')}${lastEntries.some(e=>e.sets)?` · ${lastEntries.reduce((n,e)=>n+(e.sets||0),0)} series`:''}</small>`:'<strong>Todavía sin entrenos registrados</strong>'}</span></div>`,
 {bar:false,footer:`<button type="button" class="primary" data-action="group-start">Empezar ${esc(label)}${icon('arrow-right')}</button>`});
}

/* ---------- exercise library: tab, workout selection, add to past workout ---------- */
function exerciseCard(e,mode){
 const attr=mode==='pick'?'pick':mode==='workout'?'choose':'exercise',done=mode==='workout'&&draft.entries.some(x=>x.exercise.id===e.id);
 if(layout==='list')return `<button type="button" class="card ex-row" data-${attr}="${esc(e.id)}">${thumb(e)}<span class="grow"><strong>${esc(e.name)}</strong><small>${esc(e.group)}</small></span>${done?icon('check-circle','accent'):chevron()}</button>`;
 return `<button type="button" class="card ex-card" data-${attr}="${esc(e.id)}">${thumb(e)}${done?`<span class="done-mark">${icon('check')}</span>`:''}<strong>${esc(e.name)}</strong><small>${esc(e.group)}</small></button>`;
}
function renderLibrary(mode){
 const inWorkout=mode==='workout',picking=mode==='pick';
 const list=recentExercises(exercises.filter(e=>!e.deleted),sessions).filter(e=>(filter==='Todos'||e.group===filter)&&e.name.toLocaleLowerCase().includes(search.toLocaleLowerCase()));
 const s=picking?currentSession():null;
 const head=inWorkout?`${topbar(back('Inicio','home'),iconBtn('plus','new-exercise','Nuevo ejercicio'))}<h1>Elige ejercicio</h1>`
  :picking?`${topbar(back('Entreno','back-to-session'),iconBtn('plus','new-exercise','Nuevo ejercicio'))}<h1>Añadir ejercicio</h1><p class="muted sub">${esc(s.groups.join(' + '))} · ${esc(date(s.date))} · ${plural(s.entries.length,'ejercicio','ejercicios')}</p>`
  :`<div class="title-row"><h1>Ejercicios</h1>${iconBtn('plus','new-exercise','Nuevo ejercicio')}</div>`;
 const filters=inWorkout?segButtons([...draft.groups,'Todos'].map(g=>['filter:'+g,esc(g),filter===g]))
  :`<div class="chips" id="chips">${['Todos',...groups].map(g=>`<button type="button" data-action="filter:${esc(g)}" class="${filter===g?'on':''}">${esc(g)}</button>`).join('')}</div>`;
 show(`${head}<label class="search">${icon('search')}<input id="search" type="search" placeholder="Buscar ejercicio" value="${esc(search)}" aria-label="Buscar ejercicio" autocomplete="off" autocorrect="off" spellcheck="false"></label>${filters}
<div class="between meta-line"><small class="muted">${inWorkout?`${esc(draft.groups.join(' + '))} · ${plural(draft.entries.length,'hecho','hechos')}`:`${plural(list.length,'ejercicio','ejercicios')} · recientes primero`}</small>${segButtons([['layout:grid',icon('grid'),layout==='grid'],['layout:list',icon('list'),layout==='list']]).replace('class="seg"','class="seg compact" aria-label="Presentación"')}</div>
<div class="${layout==='grid'?'grid':'stack'}">${list.map(e=>exerciseCard(e,mode)).join('')}</div>${list.length?'':`<div class="empty">${icon('dumbbell')}<strong>No hay ejercicios</strong><p>Prueba con otro nombre o añade uno con +.</p></div>`}`,
 {bar:!inWorkout,footer:inWorkout?`<button type="button" class="done-row" data-action="summary"><span>Ejercicios hechos (${draft.entries.length})</span>${icon('chevron-up')}</button><button type="button" class="primary" data-action="finish-workout" ${draft.entries.length?'':'disabled'}>Finalizar</button>`:''});
}
async function choose(id){
 const exercise=exercises.find(e=>e.id===id);
 selection={exercise,grip:exercise.grips[0]||null,cableStation:'sala1',weight:0,sets:4,reps:exercise.name.startsWith('Curl 15')?15:exercise.name.startsWith('Curl 21')?21:10,toFailure:false,unilateral:exercise.name==='Extensión unilateral con strap',isWarmup:false,dropset:false};
 selection.weight=suggestWeight(sessions,exercise,selection.grip);
 view=exercise.grips.length>1?'grip':'setup';await saveSelection();render();
}

/* ---------- workout: grip, setup, active, rating ---------- */
function renderGrip(){const e=selection.exercise;show(`${topbar(back('Ejercicios','select'))}<h1>${e.name==='Press francés'?'Elige equipo':'Elige agarre'}</h1><p class="muted sub">${esc(e.name)}</p><div class="stack">${e.grips.map(g=>`<button type="button" class="card grip" data-action="grip:${esc(g)}"><strong>${esc(g)}</strong>${icon('arrow-right','muted')}</button>`).join('')}</div>`,{bar:false});}
function priorCard(){
 const e=selection.exercise,excluded=excludedIDs(sessions),prior=antecedents(sessions,e,selection.grip,selection.cableStation),last=prior.find(p=>p.weight>0&&!excluded.has(p.id))||prior[0];
 if(!last)return `<div class="card prior static"><small class="muted">Sin registros previos. Ajusta tu peso inicial.</small></div>`;
 return `<button type="button" class="card prior" data-action="prior"><span class="between"><small class="muted with-icon">${icon('history')}Última sesión registrada</small><strong>${num(last.weight)} kg · ${repsText(last)}</strong></span><span class="between"><small class="muted">Posición</small><small class="accent">${last.order}.º de ${esc(last.exercise.group.toLowerCase())}${last.feeling?' · '+esc(last.feeling):''}</small></span><span class="between"><small class="muted">Toca para ver sesiones anteriores</small>${chevron()}</span></button>`;
}
function renderSetup(){
 const e=selection.exercise,fixed=e.name.startsWith('Curl 15')?15:e.name.startsWith('Curl 21')?21:null;
 const customSets=![3,4,5].includes(selection.sets),customReps=!selection.toFailure&&![6,8,10,12].includes(selection.reps);
 show(`<div class="setup-photo">${e.image?`<img src="${esc(e.image)}" alt="">`:muscleIcon(e.group)}<div class="float-bar">${iconBtn('chevron-left','select','Volver a los ejercicios')}</div><span class="pill">${icon('dumbbell')}${esc(e.group)}</span></div>
<div class="pad">
<div class="setup-head"><div class="grow"><h1>${esc(e.name)}</h1>${selection.grip?`<button type="button" class="link grip-link" data-action="${e.grips.length>1?'regrip':'noop'}">Agarre: ${esc(selection.grip)}${e.grips.length>1?' · Cambiar':''}</button>`:''}</div><label class="mini-toggle"><small>Unilateral</small>${toggle('unilateral',selection.unilateral,'unilateral')}</label></div>
${e.usesCable?`<section class="card block"><div class="caption">Polea</div>${segButtons(STATIONS.map(([v,l])=>['station:'+v,l,selection.cableStation===v]))}</section>`:''}
<section class="card block"><div class="between caption"><span>Series objetivo</span><span class="plain">${plural(selection.sets,'serie programada','series programadas')}</span></div><div class="choices">${[3,4,5].map(n=>btn(n,'sets:'+n,selection.sets===n?'on':'')).join('')}${btn(customSets?selection.sets:'Otro','custom:sets',customSets?'on':'')}</div></section>
<section class="card block"><div class="caption">Repeticiones por serie</div>${fixed?`<strong>${fixed} repeticiones · ${fixed===15?'5 + 5 + 5':'7 + 7 + 7'}</strong>`:`<div class="choices">${[6,8,10,12].map(n=>btn(`${n}<small>reps</small>`,'reps:'+n,!selection.toFailure&&selection.reps===n?'on':'')).join('')}${btn(customReps?`${selection.reps}<small>reps</small>`:'Otro','custom:reps',customReps?'on':'')}</div><div class="choices">${btn('Al fallo','failure',selection.toFailure?'on':'')}</div>`}</section>
<section class="list"><label class="row"><span class="row-label">Dropset</span>${toggle('dropset',selection.dropset,'dropset')}</label>${canWarmup(sessions,draft)?`<label class="row"><span class="row-label">Calentamiento / fatiga previa</span>${toggle('warmup',selection.isWarmup,'warmup')}</label>`:''}</section>${canWarmup(sessions,draft)?`<p class="footnote">Si lo activas, los siguientes ejercicios de ${esc(e.group.toLowerCase())} de hoy no se usarán como referencia de peso. Este primer ejercicio sí contará.</p>`:''}
${priorCard()}</div>`,{bar:false,cls:'flush',footer:`<button type="button" class="primary" data-action="begin">Empezar ejercicio${icon('play')}</button>`});
}
function renderActive(){
 const e=selection.exercise,detail=[selection.grip,e.usesCable?'Polea · '+stationName(selection.cableStation):null].filter(Boolean).join(' · ');
 show(`${topbar(back('Ajustes del ejercicio','setup'))}<div class="active-view"><div class="timer" id="timer" aria-label="Tiempo efectivo">0:00</div><h1>${esc(e.name)}</h1>${detail?`<small class="muted">${esc(detail)}</small>`:''}<p class="muted">${plural(selection.sets,'serie','series')} · ${selection.toFailure?'al fallo':selection.reps+' repeticiones'}</p>
<div class="weight"><div class="col">${[5,1,.25].map(n=>btn('+'+num(n),'weight:'+n)).join('')}</div><label class="weight-value"><input id="weight" inputmode="decimal" value="${num(selection.weight)}" aria-label="Peso en kilos"><span>kg</span></label><div class="col">${[5,1,.25].map(n=>btn('−'+num(n),'weight:'+(-n))).join('')}</div></div></div>${priorCard()}`,
 {bar:false,footer:`<button type="button" class="primary check" data-action="rate" aria-label="Terminar ejercicio">${icon('check')}</button>`});
 updateTimer();
}
function updateTimer(){const el=document.querySelector('#timer');if(el&&selection?.started){const sec=Math.max(0,Math.floor((Date.now()-selection.started)/1000));el.textContent=`${Math.floor(sec/60)}:${String(sec%60).padStart(2,'0')}`;}}
setInterval(updateTimer,1000);
function renderRating(){show(`<div class="rating"><button type="button" class="icon-btn white" data-action="active" aria-label="Volver al ejercicio">${icon('chevron-left')}</button><div class="rating-body"><h1>¿Qué tal el peso?</h1><p class="muted">${esc(selection.exercise.name)} · ${num(selection.weight)} kg</p>${[['Fácil','smile','easy'],['Perfecto','check-circle','perfect'],['Demasiado','alert-circle','hard']].map(([f,ic,cls])=>`<button type="button" class="mood ${cls}" data-action="feeling:${f}">${icon(ic)}${f}</button>`).join('')}</div></div>`,{bar:false});}
function showPrior(){
 const e=selection.exercise,excluded=excludedIDs(sessions),prior=antecedents(sessions,e,selection.grip,selection.cableStation);
 openDialog(`<header class="sheet-bar"><span></span><h2>Anteriores</h2>${btn('Listo','close','link strong')}</header><div class="list">${prior.map(p=>`<div class="row tall"><span class="grow"><strong>${p.weight>0?num(p.weight)+' kg':'Peso sin anotar'}</strong><small>${[p.toFailure||p.reps?repsText(p):null,`${p.order}.º de ${esc(p.exercise.group.toLowerCase())}`,p.feeling?esc(p.feeling):null].filter(Boolean).join(' · ')}</small>${p.isWarmup?'<small>Calentamiento · conserva su referencia de peso</small>':''}${excluded.has(p.id)?'<small>Fatiga previa · no usado como referencia de peso</small>':''}</span><small class="muted">${shortDate(p.date)}</small></div>`).join('')}</div>`);
}
function numberSheet(kind){const reps=kind==='reps';openDialog(`<form id="number-form">${sheetBar(reps?'Repeticiones por serie':'Series','Listo')}<input type="hidden" name="kind" value="${kind}"><div class="big-stepper">${stepper('value',selection[kind]||(reps?10:4),1,reps?100:20)}<small class="muted">${reps?'repeticiones':'series'}</small></div></form>`);}

/* ---------- sessions ---------- */
function entryRow(e){
 const ex=exercises.find(x=>x.id===e.exercise.id)||e.exercise,extra=[e.grip,ex.usesCable&&e.cableStation&&e.cableStation!=='sala1'?'Polea · '+stationName(e.cableStation):null,e.unilateral?'Unilateral':null,e.dropset?'Dropset':null].filter(Boolean).join(' · ');
 return `<button type="button" class="row entry" data-edit-entry="${esc(e.id)}">${thumb(ex)}<span class="grow"><strong>${esc(e.exercise.name)}</strong><small>${e.weight?num(e.weight):'—'} kg · ${repsText(e)} · ${e.sets||'—'} series</small>${extra?`<small class="accent">${esc(extra)}</small>`:''}${e.isWarmup?'<small class="accent">Calentamiento / fatiga previa</small>':''}<small class="faint">${[`${e.order}.º de ${esc(e.exercise.group.toLowerCase())}`,e.seconds?Math.round(e.seconds)+' s efectivos':null,e.feeling?esc(e.feeling):null].filter(Boolean).join(' · ')}</small></span>${chevron()}</button>`;
}
function renderSession(id){
 const isDraft=id==='draft',s=isDraft?draft:sessions.find(x=>x.id===id);if(!s){view=null;return render();}
 const sets=s.entries.reduce((n,e)=>n+(e.sets||0),0);
 show(`${topbar(back(isDraft?'Ejercicios':'Historial',isDraft?'select':'history'),isDraft?'':btn('Editar','edit-session','link'))}<h1>${isDraft?'Ejercicios hechos':'Tu entreno'}</h1>
<div class="summary"><small class="muted">${date(s.date)}</small><div class="summary-title">${s.groups.map(g=>muscleIcon(g)).join('')}<strong>${esc(s.groups.join(' + ')||s.historicalTitle||'Entreno')}</strong></div><small class="muted">${plural(s.entries.length,'ejercicio','ejercicios')}${minutes(s)?` · ${minutes(s)} min efectivos`:''}</small></div>
<div class="list">${s.entries.map(entryRow).join('')||`<div class="row"><span class="muted">${isDraft?'Los ejercicios que registres aparecerán aquí.':'Este entreno todavía no tiene ejercicios.'}</span></div>`}${isDraft?'':`<button type="button" class="row action" data-action="add-to-session">${icon('plus')}Añadir ejercicio</button>`}</div>
${s.historicalNotes?.length?section('Otras anotaciones originales',s.historicalNotes.map(n=>`<div class="row"><span>${esc(n)}</span></div>`).join('')):''}
<div class="list">${btn(isDraft?'Descartar sesión':'Eliminar entreno',isDraft?'discard':'delete-session','row danger center')}</div>`,
 {bar:!isDraft,footer:isDraft?`<button type="button" class="primary" data-action="finish-workout" ${s.entries.length?'':'disabled'}>Finalizar sesión</button><small class="muted foot-note">${sets} series totales registradas</small>`:''});
}
function renderHistory(){
 const y=histMonth.getFullYear(),m=histMonth.getMonth(),length=new Date(y,m+1,0).getDate(),lead=(new Date(y,m,1).getDay()+6)%7;
 const counts=new Map();sessions.forEach(s=>{const k=dayKey(s.date);counts.set(k,(counts.get(k)||0)+1);});
 const listed=histDay?sessions.filter(s=>dayKey(s.date)===histDay):sessions;
 const monthName=histMonth.toLocaleDateString('es-ES',{month:'long',year:'numeric'});
 show(`<div class="title-row"><h1>Historial</h1>${iconBtn('plus','new-past','Añadir entreno pasado')}</div>
<section class="card calendar"><div class="between">${iconBtn('chevron-left','month:-1','Mes anterior')}<strong>${esc(monthName.charAt(0).toUpperCase()+monthName.slice(1))}</strong>${iconBtn('chevron-right','month:1','Mes siguiente')}</div><div class="cal-grid">${['L','M','X','J','V','S','D'].map(d=>`<small>${d}</small>`).join('')}${'<span></span>'.repeat(lead)}${Array.from({length},(_,i)=>{const k=dayKey(new Date(y,m,i+1)),c=counts.get(k)||0;return `<button type="button" data-day="${k}" class="${c?'has':''} ${histDay===k?'on':''}" aria-pressed="${histDay===k}" aria-label="${i+1}, ${plural(c,'entreno','entrenos')}">${i+1}<i></i></button>`;}).join('')}</div></section>
<div class="between list-head"><h2>${histDay?'Entrenos del día':'Todos los entrenos'}</h2>${histDay?btn('Ver todos','all-days','link'):`<small class="muted">${sessions.length}</small>`}</div>
${listed.length?`<div class="stack">${listed.map(sessionCard).join('')}</div>`:`<div class="empty">${icon('calendar')}<strong>${histDay?'Sin entrenos este día':'Tu historia empieza aquí'}</strong><p>${histDay?'Puedes añadir uno a mano con +.':'Los entrenos aparecerán al finalizar una sesión.'}</p></div>`}`);
}
function renderExercise(id){
 const e=exercises.find(x=>x.id===id);if(!e){view=null;return render();}
 const history=sessions.flatMap(s=>s.entries.filter(x=>x.exercise.id===e.id||x.exercise.name===e.name).map(x=>({...x,date:s.date})));
 show(`${topbar(back('Ejercicios','catalog'),btn('Editar','edit-exercise','link'))}<div class="photo-card">${e.image?`<img src="${esc(e.image)}" alt="">`:muscleIcon(e.group)}</div><h1>${esc(e.name)}</h1><p class="muted sub with-icon">${muscleIcon(e.group,'inline')}${esc(e.group)}${e.grips.length?` · ${esc(e.grips.join(', '))}`:''}</p>
${history.length?section('Tu historial',history.map(x=>`<div class="row tall"><span class="grow"><strong>${x.weight?num(x.weight):'—'} kg · ${repsText(x)} · ${x.sets||'—'} series</strong>${x.grip||x.feeling?`<small>${[x.grip,x.feeling].filter(Boolean).map(esc).join(' · ')}</small>`:''}</span><small class="muted">${shortDate(x.date)}</small></div>`).join('')):`<div class="empty">${icon('history')}<strong>Todavía no lo has registrado</strong><p>Aparecerá aquí cuando lo hagas en un entreno.</p></div>`}`);
}

/* ---------- settings and login ---------- */
const cloudText=()=>{const st=cloud.state();if(st.pending)return st.error?'Cambios sin subir todavía. Se subirán solos cuando haya conexión.':'Guardando en la nube…';return 'Sincronizado: '+ago(st.lastAt);};
function renderSettings(){
 const p=cloud.profile();
 show(`<h1>Ajustes</h1>
${p?section('Tu perfil',`<div class="row"><span class="badge-icon blue">${esc(p.firstName.charAt(0))}</span><span class="grow"><strong>${esc(p.name)}</strong><small id="cloud-status">${esc(cloudText())}</small></span></div><button type="button" class="row" data-action="restore-list"><span class="row-label">Recuperar una copia anterior</span>${chevron()}</button>${btn('Cerrar sesión','logout','row danger')}`,'Tus datos se sincronizan solos: entrando con tu nombre ves lo mismo en cualquier dispositivo. Sin internet puedes seguir usándola y los cambios se suben al volver la conexión.'):''}
${waitingWorker?section('Actualización',`<button type="button" class="row action" data-action="update">${icon('check-circle')}Actualizar ahora</button>`,'Hay una versión nueva de Gym11 lista para instalar.'):''}
${section('Copias en archivo',`<button type="button" class="row" data-action="export"><span class="row-label">Exportar copia JSON</span>${chevron()}</button><label class="row"><span class="row-label">Importar copia…</span>${chevron()}<input type="file" id="import" accept=".json,application/json" hidden></label>`,'La importación se confirma antes de guardar y evita duplicados. También acepta la exportación de la app de Swift y el histórico de Notas.')}
${section('Esta app',`<div class="row"><span class="row-label">Sin conexión</span><small class="muted" id="offline-status">Comprobando…</small></div><button type="button" class="row" data-action="persist"><span class="row-label">Almacenamiento protegido</span><small class="muted">${persisted?'Concedido':'Solicitar'}</small></button><a class="row" href="https://repdb.co" target="_blank" rel="noopener"><span class="row-label">Ilustraciones de RepDB</span>${chevron()}</a>`,'Para instalarla: Safari → Compartir → Añadir a pantalla de inicio.')}`);
 checkOffline();
}
function renderLogin(){app.className='';foot.innerHTML='';nav.innerHTML='';document.body.dataset.chrome='none';app.innerHTML=`<div class="login"><img src="assets/icon-192.png" alt="" width="84" height="84"><h1>¿Quién eres?</h1><p class="muted">Escribe tu nombre y la inicial de tu apellido. Tus pesos se guardan en tu perfil y se sincronizan con la nube.</p><form id="login-form"><div class="list"><label class="row"><input name="who" placeholder="Ej.: Alex F" aria-label="Nombre e inicial del apellido" autocomplete="off" autocapitalize="words" autocorrect="off" spellcheck="false" required maxlength="60"></label></div><button type="submit" class="primary">Entrar</button></form><small class="muted">La primera vez necesitas conexión a internet.</small></div>`;}

/* ---------- sheets (forms) ---------- */
// Shared fields for a recorded exercise. `entry` is null when adding by hand.
function entryFields(ex,entry){
 const grip=entry?entry.grip:ex.grips[0]||null,failure=!!entry?.toFailure;
 return `${ex.grips.length||ex.usesCable||entry?.grip?`<div class="list">${ex.grips.length?`<div class="row wrap"><span class="row-label">Agarre</span>${seg('grip',[...new Set([...ex.grips,...(grip?[grip]:[])])].map(g=>[g,g]),grip)}</div>`:entry?row('Agarre o variante',`<input name="grip" value="${esc(entry.grip||'')}" placeholder="Ninguno">`):''}${ex.usesCable?`<div class="row wrap"><span class="row-label">Polea</span>${seg('station',STATIONS,entry?.cableStation||'sala1')}</div>`:''}</div>`:''}
<div class="list">${row('Peso',`<span class="unit"><input name="weight" inputmode="decimal" required value="${num(entry?entry.weight:suggestWeight(sessions,ex,grip))}"><small>kg</small></span>`)}${row('Series',stepper('sets',entry?entry.sets:4,0,100))}${row('Repeticiones',stepper('reps',entry?entry.reps:10,0,1000,'data-reps',failure?'off':''))}<label class="row"><span class="row-label">Al fallo</span>${toggle('failure',failure)}</label></div>
<div class="list"><label class="row"><span class="row-label">Unilateral</span>${toggle('unilateral',entry?.unilateral)}</label><label class="row"><span class="row-label">Dropset</span>${toggle('dropset',entry?.dropset)}</label>${entry?row('Tiempo efectivo',`<span class="unit"><input name="seconds" inputmode="numeric" value="${Math.round(entry.seconds||0)}"><small>s</small></span>`):''}</div>
<h2 class="section">¿Qué tal el peso?</h2>${seg('feeling',[['','Sin valorar'],...FEELINGS.map(f=>[f,f])],entry?.feeling||'')}`;
}
function readEntry(f,ex,old){
 const weight=decimal(f.get('weight')),sets=Number(f.get('sets')),reps=Number(f.get('reps')),seconds=f.has('seconds')?Number(f.get('seconds')):old?.seconds||0;
 if(![weight,sets,reps,seconds].every(n=>Number.isFinite(n)&&n>=0)||!Number.isInteger(sets)||!Number.isInteger(reps)||weight>10000)throw new Error('Revisa el peso, las series y las repeticiones.');
 return {weight,sets,reps:f.has('failure')?0:reps,toFailure:f.has('failure'),unilateral:f.has('unilateral'),dropset:f.has('dropset'),grip:String(f.get('grip')||'').trim()||null,cableStation:ex?.usesCable?(f.get('station')||old?.cableStation||'sala1'):old?.cableStation||null,seconds,feeling:f.get('feeling')||''};
}
const exerciseOptions=current=>groups.map(g=>{const list=exercises.filter(e=>e.group===g&&(!e.deleted||e.id===current));return list.length?`<optgroup label="${esc(g)}">${list.map(e=>`<option value="${esc(e.id)}" ${e.id===current?'selected':''}>${esc(e.name)}</option>`).join('')}</optgroup>`:'';}).join('');
function entryEditor(entry){const ex=exercises.find(e=>e.id===entry.exercise.id)||{...entry.exercise,grips:[],usesCable:false};openDialog(`<form id="entry-form">${sheetBar('Editar ejercicio')}<input name="id" type="hidden" value="${esc(entry.id)}"><div class="list">${row('Ejercicio',`<select name="exercise">${exerciseOptions(entry.exercise.id)}</select>`)}</div>${entryFields(ex,entry)}<div class="list">${btn('Quitar ejercicio','remove-entry','row danger center')}</div></form>`);}
function manualEntryEditor(ex){openDialog(`<form id="manual-form">${sheetBar(ex.name,'Añadir')}<input name="exercise" type="hidden" value="${esc(ex.id)}"><p class="muted center">${esc(date(currentSession().date))}</p>${entryFields(ex,null)}</form>`);}
function sessionForm(s=null){
 const day=s?s.date:addDays(new Date(),-1);
 openDialog(`<form id="${s?'session-form':'past-form'}">${sheetBar(s?'Editar entreno':'Entreno pasado',s?'Guardar':'Crear')}<div class="list">${row('Fecha',`<input name="date" type="date" value="${dayKey(day)}" max="${dayKey(new Date())}" required>`)}</div><h2 class="section">Grupos</h2><div class="checks">${groups.map(g=>`<label><input type="checkbox" name="groups" value="${esc(g)}" ${s?.groups.includes(g)?'checked':''}><span>${muscleIcon(g)}${esc(g)}</span></label>`).join('')}</div>${s?'':'<p class="footnote">Después podrás añadir sus ejercicios uno a uno.</p>'}</form>`);
}
function exerciseEditor(ex=null){
 openDialog(`<form id="exercise-form">${sheetBar(ex?'Editar ejercicio':'Nuevo ejercicio')}<input name="id" type="hidden" value="${esc(ex?.id||'')}"><div class="list">${row('Nombre',`<input name="name" required maxlength="120" value="${esc(ex?.name||'')}" placeholder="Obligatorio">`)}${row('Grupo',`<select name="group">${groups.map(g=>`<option ${g===(ex?.group||(filter!=='Todos'?filter:draft?.groups[0]))?'selected':''}>${g}</option>`).join('')}</select>`)}</div>
<div class="list">${row('Agarres',`<input name="grips" value="${esc(ex?.grips?.join(', ')||'')}" placeholder="Neutro, Abierto…">`)}<label class="row"><span class="row-label">Usa polea (3 salas)</span>${toggle('cable',ex?.usesCable)}</label></div><p class="footnote">Separa los agarres con comas. Con polea, el peso de referencia se guarda por sala.</p>
<div class="list"><label class="row"><span class="row-label">Foto</span><input name="image" type="file" accept="image/png,image/jpeg,image/webp"></label></div>${ex?`<p class="footnote">Se conserva la foto actual si no eliges otra.</p><div class="list">${btn('Archivar ejercicio','archive-exercise','row danger center')}</div>`:''}</form>`);
}

/* ---------- actions ---------- */
async function action(a){
 if(!a||a==='noop')return;
 if(['home','history','catalog','settings'].includes(a)){tab=a;view=null;render();return;}
 if(a==='close'){close();return;}
 if(a.startsWith('layout:')){layout=a.slice(7);await db.put('settings',{id:'layout',value:layout});render();return;}
 if(a.startsWith('filter:')){const left=document.querySelector('#chips')?.scrollLeft;filter=a.slice(7);render();const chips=document.querySelector('#chips');if(chips&&left!=null)chips.scrollLeft=left;return;}
 if(a.startsWith('month:')){histMonth=new Date(histMonth.getFullYear(),histMonth.getMonth()+Number(a.slice(6)),1);histDay=null;render();return;}
 if(a==='all-days'){histDay=null;render();return;}
 if(a==='start'){pick={group:null,complement:'Ninguno'};view='groups';render();return;}
 if(a==='resume'){selection=draft.selection||null;view=selection&&['grip','setup','active','rating'].includes(draft.phase)?draft.phase:'select';filter=[...draft.groups,'Todos'].includes(filter)?filter:draft.groups[0];render();return;}
 if(a.startsWith('complement:')){pick.complement=a.slice(11);render();return;}
 if(a==='group-start'){const g=pick.group;if(draft&&draft.entries.length&&!confirm('Ya hay un entrenamiento en curso. ¿Descartarlo y empezar otro?'))return;draft={id:uid(),date:new Date().toISOString(),groups:[g,...(allowsComplement(g)&&pick.complement!=='Ninguno'?[pick.complement]:[])],entries:[],phase:'select'};await saveDraft();filter=g;search='';view='select';render();return;}
 if(a==='summary'){view='session:draft';render();return;}
 if(a==='select'){view='select';selection=null;if(draft){draft.selection=null;draft.phase='select';await saveDraft();}render();return;}
 if(a==='regrip'){view='grip';await saveSelection();render();return;}
 if(a.startsWith('grip:')){selection.grip=a.slice(5);selection.weight=suggestWeight(sessions,selection.exercise,selection.grip,selection.cableStation);view='setup';await saveSelection();render();return;}
 if(a.startsWith('station:')){selection.cableStation=a.slice(8);selection.weight=suggestWeight(sessions,selection.exercise,selection.grip,selection.cableStation);await saveSelection();render();return;}
 if(a==='new-exercise'){exerciseEditor();return;}
 if(a==='edit-exercise'){exerciseEditor(exercises.find(e=>e.id===view.slice(9)));return;}
 if(a==='archive-exercise'){if(confirm('¿Archivar este ejercicio? Sus registros se conservarán.')){const ex=exercises.find(e=>e.id===modal.querySelector('[name=id]').value);await db.put('exercises',{...ex,deleted:true});close();await load();view=null;render();}return;}
 if(a.startsWith('weight:')){selection.weight=Math.max(0,Math.round((selection.weight+Number(a.slice(7)))*100)/100);const input=document.querySelector('#weight');if(input)input.value=num(selection.weight);await saveSelection();return;}
 if(a.startsWith('sets:')){selection.sets=Number(a.slice(5));await saveSelection();render();return;}
 if(a.startsWith('reps:')){selection.reps=Number(a.slice(5));selection.toFailure=false;await saveSelection();render();return;}
 if(a.startsWith('custom:')){numberSheet(a.slice(7));return;}
 if(a==='failure'){selection.toFailure=true;await saveSelection();render();return;}
 if(a==='prior'){showPrior();return;}
 if(a==='begin'){if(!selection.started)selection.started=Date.now();view='active';await saveSelection();render();return;}
 if(a==='setup'||a==='active'){view=a;await saveSelection();render();return;}
 if(a==='rate'){if(!Number.isFinite(selection.weight)||selection.weight<0)throw new Error('Introduce un peso válido.');selection.ended=Date.now();view='rating';await saveSelection();render();return;}
 if(a.startsWith('feeling:')){const e=selection.exercise,warmup=selection.isWarmup&&canWarmup(sessions,draft);draft.entries.push({id:uid(),exercise:{id:e.id,name:e.name,group:e.group},weight:selection.weight,reps:selection.toFailure?0:selection.reps,sets:selection.sets,toFailure:selection.toFailure,unilateral:selection.unilateral,dropset:selection.dropset,isWarmup:warmup,grip:selection.grip,cableStation:e.usesCable?selection.cableStation:null,seconds:Math.max(0,(selection.ended-selection.started)/1000),feeling:a.slice(8),order:draft.entries.filter(x=>x.exercise.group===e.group).length+1});selection=null;draft.selection=null;draft.phase='select';await saveDraft();view='select';render();return;}
 if(a==='finish-workout'){if(!draft.entries.length){toast('Añade al menos un ejercicio.');return;}if(!confirm('¿Finalizar entreno?\nSe guardarán los ejercicios de esta sesión en tu historial.'))return;const saved={...draft};delete saved.selection;delete saved.phase;await db.transaction(['sessions','drafts'],tx=>{tx.objectStore('sessions').put({...saved,updatedAt:new Date().toISOString()});tx.objectStore('drafts').delete('active');});await load();view='session:'+saved.id;tab='history';render();toast('Entreno guardado.');return;}
 if(a==='discard'){if(confirm('¿Descartar esta sesión sin guardar?')){await db.remove('drafts','active');draft=null;selection=null;view=null;tab='home';render();}return;}
 if(a==='delete-session'){const s=currentSession();if(confirm('¿Eliminar este entreno?\nSe eliminará de tu historial y de las estadísticas. Esta acción no se puede deshacer.')){await db.remove('sessions',s.id);await load();view=null;render();}return;}
 if(a==='new-past'){sessionForm();return;}
 if(a==='edit-session'){sessionForm(currentSession());return;}
 if(a==='add-to-session'){editing=currentSession().id;filter='Todos';search='';view='pick';render();return;}
 if(a==='back-to-session'){view='session:'+editing;render();return;}
 if(a==='remove-entry'){const s=currentSession(),id=modal.querySelector('[name=id]').value;if(confirm('¿Quitar este ejercicio?')){s.entries=s.entries.filter(e=>e.id!==id);reorder(s);await persistSession(s);close();render();}return;}
 if(a==='export'){const data=await exportData(),blob=new Blob([JSON.stringify(data,null,2)],{type:'application/json'}),url=URL.createObjectURL(blob),link=document.createElement('a');link.href=url;link.download='gym11-'+dayKey(new Date())+'.json';link.click();setTimeout(()=>URL.revokeObjectURL(url),30000);toast('Guarda la copia en Archivos.');return;}
 if(a==='persist'){persisted=(await db.persistence()).persistent;render();toast(persisted?'Almacenamiento protegido concedido.':'Safari no lo ha concedido. Tus datos siguen sincronizados con la nube.');return;}
 if(a==='confirm-import'){const count=await importData(pendingImport,{overwrite:modal.querySelector('#overwrite').checked});pendingImport=null;close();await load();toast(`${plural(count,'entreno importado','entrenos importados')}`);render();return;}
 if(a==='restore-list'){const list=await cloud.listBackups();if(!list.length){toast('Todavía no hay copias en la nube.');return;}openDialog(`<header class="sheet-bar"><span></span><h2>Recuperar una copia</h2>${btn('Cerrar','close','link strong')}</header><p class="footnote">Elige una copia para volver a ese momento. Se sustituirán los datos actuales en todos tus dispositivos; la versión de ahora se conserva en esta lista.</p><div class="list">${list.slice(0,30).map(b=>`<button type="button" class="row" data-action="restore:${esc(b.at)}"><span class="grow"><strong>${esc(date(b.at))} · ${clock(b.at)}</strong>${b.sessions!=null?`<small>${plural(b.sessions,'entreno','entrenos')}</small>`:''}</span>${chevron()}</button>`).join('')}</div>`);return;}
 if(a.startsWith('restore:')){if(draft){toast('Termina o descarta la sesión antes de recuperar una copia.');return;}if(!confirm('¿Sustituir tus datos por esa copia?'))return;const n=await cloud.restore(a.slice(8));close();await load();tab='home';view=null;toast(`Copia recuperada: ${plural(n,'entreno','entrenos')}.`);render();return;}
 if(a==='logout'){if(draft){toast('Termina o descarta la sesión antes de cerrar sesión.');return;}if(!confirm('Tus datos quedan guardados en la nube y se borrarán de este dispositivo. Podrás recuperarlos entrando con tu nombre. ¿Cerrar sesión?'))return;await cloud.logout();await load();tab='home';view=null;renderLogin();return;}
 if(a==='update'){if(draft){toast('Termina o descarta la sesión antes de actualizar.');return;}waitingWorker?.postMessage({type:'SKIP_WAITING'});return;}
}
async function handleChange(el){
 if(el.id==='import'){const file=el.files[0];if(!file)return;if(file.size>80*1024*1024)throw new Error('La copia supera 80 MB.');pendingImport=await prepareImport(JSON.parse(await file.text()));openDialog(`<header class="sheet-bar">${btn('Cancelar','close','link')}<h2>Importar copia</h2>${btn('Importar','confirm-import','link strong')}</header><div class="list"><div class="row"><span class="row-label">Contenido</span><small class="muted">${plural(pendingImport.sessions.length,'entreno','entrenos')} · ${pendingImport.exercises.length} ejercicios</small></div><label class="row"><span class="row-label">Reemplazar los repetidos</span>${toggle('overwrite',false,'overwrite')}</label></div><p class="footnote">Desactivado: se conservan los entrenos que ya tienes con el mismo identificador.</p>`);return;}
 if(el.name==='failure'&&el.form){el.form.querySelector('[data-reps]')?.classList.toggle('off',el.checked);return;}
 if(!selection||el.closest('dialog'))return;
 if(el.id==='weight'){const value=decimal(el.value);if(!Number.isFinite(value)||value<0||value>10000){el.value=num(selection.weight);throw new Error('Introduce un peso entre 0 y 10.000 kg.');}selection.weight=value;el.value=num(value);}
 for(const [id,key] of [['unilateral','unilateral'],['dropset','dropset'],['warmup','isWarmup']])if(el.id===id)selection[key]=el.checked;
 await saveSelection();
}
async function submit(form){
 const f=new FormData(form);
 // Read the attribute: an <input name="id"> inside the form shadows form.id.
 const formId=form.getAttribute('id');
 if(formId==='number-form'){const kind=f.get('kind'),v=Number(f.get('value'));if(!Number.isInteger(v)||v<1||v>(kind==='reps'?1000:100))throw new Error('Número no válido.');selection[kind]=v;if(kind==='reps')selection.toFailure=false;await saveSelection();close();render();return;}
 if(formId==='exercise-form'){
  const id=f.get('id')||uid(),old=exercises.find(e=>e.id===id),name=f.get('name').trim(),group=f.get('group');
  if(!name)throw new Error('Escribe un nombre.');
  if(exercises.some(e=>e.id!==id&&!e.deleted&&e.group===group&&e.name.toLocaleLowerCase()===name.toLocaleLowerCase()))throw new Error('Ese ejercicio ya existe.');
  let image=old?.image||null;const file=f.get('image');
  if(file?.size){if(file.size>3*1024*1024)throw new Error('Usa una imagen de menos de 3 MB.');image=await new Promise((resolve,reject)=>{const r=new FileReader();r.onload=()=>resolve(r.result);r.onerror=reject;r.readAsDataURL(file);});}
  await db.put('exercises',{id,name,group,grips:f.get('grips').split(',').map(g=>g.trim()).filter(Boolean),usesCable:f.has('cable'),image,deleted:false});
  close();await load();if(view==='select'&&!old)await choose(id);else render();return;}
 if(formId==='past-form'||formId==='session-form'){
  const day=f.get('date'),picked=f.getAll('groups');if(!day)throw new Error('Elige una fecha.');if(!picked.length)throw new Error('Marca al menos un grupo.');
  const when=new Date(day+'T12:00:00').toISOString();
  if(formId==='past-form'){const s={id:uid(),date:when,groups:picked,entries:[],manual:true};await db.put('sessions',s);await load();editing=s.id;tab='history';filter=picked[0];search='';view='pick';close();render();toast('Entreno creado. Añade sus ejercicios.');return;}
  const s=currentSession();s.date=when;s.groups=picked;await persistSession(s);await load();close();render();return;}
 if(formId==='manual-form'){
  const s=currentSession(),ex=exercises.find(e=>e.id===f.get('exercise'));
  s.entries.push({id:uid(),exercise:{id:ex.id,name:ex.name,group:ex.group},isWarmup:false,order:0,...readEntry(f,ex,null)});
  reorder(s);await persistSession(s);await load();close();view='session:'+s.id;render();toast(`${ex.name} añadido.`);return;}
 if(formId==='entry-form'){
  const s=currentSession(),e=s.entries.find(x=>x.id===f.get('id')),ex=exercises.find(x=>x.id===e.exercise.id);
  Object.assign(e,readEntry(f,ex,e));
  const exId=f.get('exercise');if(exId&&exId!==e.exercise.id){const next=exercises.find(x=>x.id===exId);if(next){e.exercise={id:next.id,name:next.name,group:next.group};if(next.grips.length&&!next.grips.includes(e.grip))e.grip=null;reorder(s);}}
  await persistSession(s);if(s!==draft)await load();close();render();}
}

/* ---------- login, sync and events ---------- */
async function afterLogin(res){
 await load();tab='home';view=null;render();
 const name=cloud.profile().firstName;
 const r=await cloud.sync().catch(e=>{toast(e.message);return 'error';});
 if(r==='error')return;
 await load();render();
 toast(r==='downloaded'||r==='merged'?`Hola de nuevo, ${name}. ${plural(sessions.length,'entreno recuperado','entrenos recuperados')}.`:res.created?`Perfil creado. ¡Hola, ${name}!`:`¡Hola, ${name}!`);
}
async function safe(fn){try{await fn();}catch(e){console.error(e);toast(e.message||'No se ha podido guardar. Conserva la pantalla e inténtalo otra vez.');}}
app.addEventListener('submit',e=>{if(e.target.id!=='login-form')return;e.preventDefault();const f=new FormData(e.target),b=e.target.querySelector('button');safe(async()=>{b.disabled=true;try{const res=await cloud.login(String(f.get('who')));await afterLogin(res);}finally{b.disabled=false;}});});
db.onChange(stores=>{if(stores.some(s=>s!=='drafts'))cloud.schedule();});
cloud.setGuard(()=>!modal.open&&!WORKOUT_VIEWS.includes(view)&&!['INPUT','TEXTAREA','SELECT'].includes(document.activeElement?.tagName));
cloud.onPull(async()=>{await load();if((view?.startsWith('session:')||view==='pick')&&!currentSession())view=null;if(view?.startsWith('exercise:')&&!exercises.some(e=>e.id===view.slice(9)))view=null;render();});
setInterval(()=>{if(document.visibilityState==='visible')cloud.flush();},120000);
cloud.onStatus(()=>{const el=document.querySelector('#cloud-status');if(el)el.textContent=cloudText();});
addEventListener('online',()=>cloud.flush());
document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='visible')cloud.flush();});

document.addEventListener('click',ev=>{
 if(ev.target===modal){close();return;}                      // tap outside the sheet
 const b=ev.target.closest('button');if(!b||(b.type==='submit'&&b.closest('form')))return;
 safe(async()=>{
  const d=b.dataset;
  if(d.step){const input=b.parentElement.querySelector('input'),min=Number(input.min||0),max=Number(input.max||1e6);input.value=Math.min(max,Math.max(min,(Number(input.value)||0)+Number(d.step)));return;}
  if(d.tab){tab=d.tab;view=null;render();}
  else if(d.group){pick.group=d.group;pick.complement=defaultComplement(d.group);render();}
  else if(d.day){histDay=histDay===d.day?null:d.day;render();}
  else if(d.choose)await choose(d.choose);
  else if(d.pick)manualEntryEditor(exercises.find(e=>e.id===d.pick));
  else if(d.session){tab='history';view='session:'+d.session;render();}
  else if(d.exercise){view='exercise:'+d.exercise;render();}
  else if(d.editEntry)entryEditor(currentSession().entries.find(e=>e.id===d.editEntry));
  else await action(d.action);
 });
});
document.addEventListener('change',e=>safe(()=>handleChange(e.target)));
document.addEventListener('input',e=>{if(e.target.id==='search'){search=e.target.value;const start=e.target.selectionStart;render();const input=document.querySelector('#search');input.focus();input.setSelectionRange(start,start);}});
modal.addEventListener('submit',e=>{e.preventDefault();safe(()=>submit(e.target));});

async function checkOffline(){const el=document.querySelector('#offline-status');if(!el)return;let ready=false;for(const name of await caches.keys())if(name.startsWith('gym11-')){const cache=await caches.open(name);if(await cache.match(new URL('./offline-ready',location.href)))ready=true;}if(document.querySelector('#offline-status'))document.querySelector('#offline-status').textContent=ready?'Lista':'Preparando…';}
async function registerWorker(){if(!('serviceWorker'in navigator))return;const reg=await navigator.serviceWorker.register('./sw.js');const found=()=>{if(reg.waiting){waitingWorker=reg.waiting;toast('Nueva versión disponible. Puedes actualizar desde Ajustes.');if(tab==='settings'&&!view)render();}};found();reg.addEventListener('updatefound',()=>reg.installing?.addEventListener('statechange',found));let refreshing=false;navigator.serviceWorker.addEventListener('controllerchange',()=>{if(!refreshing){refreshing=true;location.reload();}});navigator.serviceWorker.addEventListener('message',()=>checkOffline());reg.update().catch(()=>{});}
safe(async()=>{await db.init();await load();layout=(await db.get('settings','layout'))?.value||'grid';if(cloud.profile()){restorePlace();render();cloud.flush();}else renderLogin();persisted=(await db.persistence()).persistent;await registerWorker().catch(e=>console.warn('Service worker:',e));});
