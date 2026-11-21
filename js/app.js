import * as db from './db.js';
import {groups,uid,num,repsText,dayKey,suggestWeight,antecedents,recentExercises,unilateralMode,weightAdvice} from './model.js';
import {exportData,prepareImport,importData} from './transfer.js';
import * as cloud from './cloud.js';
import {icon,muscleIcon} from './icons.js';

const app=document.querySelector('#app'),nav=document.querySelector('#nav'),foot=document.querySelector('#foot'),modal=document.querySelector('#modal');
let exercises=[],sessions=[],draft=null,tab='home',view=null,selection=null,layout='grid',filter='Todos',search='',persisted=false,waitingWorker=null;
let editing=null;                                  // saved session receiving exercises by hand
let pick=[];                                       // muscle groups chosen for today, in tap order
let histMonth=new Date(new Date().getFullYear(),new Date().getMonth(),1),histDay=null;
let lastKey=null,pendingImport=null;

const STATIONS=[['sala1','Sala 1'],['sala2','Sala 2'],['sala3','Sala 3']];
const FEELINGS=['Fácil','Perfecto','Demasiado'];
// Dropset details: which sets carry the drop and how much the weight comes down.
// The recorded weight is always the starting one, so dropsets don't change the weight advice.
const DS_SETS=[['last','Última serie'],['all','Todas las series']];
const DS_DROP=[['half','A la mitad'],['quarter','Un 25 %'],['free','A ojo']];
const dsDefault=()=>({sets:'last',drop:'half'});
const dsText=d=>d?`Dropset ${d.sets==='all'?'en todas':'en la última'}${d.drop==='half'?' · a la mitad':d.drop==='quarter'?' · −25 %':''}`:'Dropset';
const TABS=[['home','house','Inicio'],['history','calendar','Historial'],['catalog','dumbbell','Ejercicios']];  // Ajustes opens from the gear on Inicio
const MAIN_GROUPS=['Pecho','Espalda','Hombro','Pierna'];
const MAX_PICK=4;                                  // quick-access tabs during a workout
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
const back=(label,action)=>`<button type="button" class="link back" data-back data-action="${action}">${icon('chevron-left')}${esc(label)}</button>`;
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

/* ---------- screen stack: iOS-style push/pop and swipe from the edge to go back ----------
   A web app has no native navigation stack, so we keep one: each screen remembers the one
   before it (and a snapshot of it) to animate going forward/back and to show it underneath
   while dragging from the left edge. */
let navStack=[],skipTransition=false;
const isRoot=k=>['home','history','catalog'].includes(k);
const reducedMotion=()=>matchMedia('(prefers-reduced-motion: reduce)').matches;
function navDirection(key){
 if(key===lastKey)return null;
 if(lastKey==null||(isRoot(key)&&isRoot(lastKey))){navStack=[{key}];return 'none';}   // first screen or switching tabs
 const i=navStack.findIndex(e=>e.key===key);
 if(i>=0){navStack=navStack.slice(0,i+1);return 'back';}
 if(isRoot(key)){navStack=[{key}];return 'back';}                                      // e.g. discarding a workout
 navStack.push({key});return 'forward';
}
function show(html,opts={}){
 const key=view||tab,top=navStack[navStack.length-1];
 if(top&&key!==lastKey){top.html=app.innerHTML;top.cls=app.className;top.scroll=scrollY;}
 const dir=navDirection(key),paint=()=>{paintScreen(html,opts);opts.after?.();};   // after: DOM work on the new screen
 if((dir==='forward'||dir==='back')&&!skipTransition&&document.startViewTransition&&!reducedMotion()){
  document.documentElement.dataset.nav=dir;
  document.startViewTransition(paint).finished.finally(()=>{delete document.documentElement.dataset.nav;});
 }else paint();
 skipTransition=false;
}
function paintScreen(html,{footer='',bar=true,cls=''}={}){
 app.className=cls;app.innerHTML=html;foot.innerHTML=footer;
 updateNav(bar);updateResume(bar);
 document.body.dataset.chrome=footer?'foot':bar?'nav':'none';
 const key=view||tab;if(key!==lastKey){scrollTo(0,0);lastKey=key;nav.classList.remove('compact');resumeBar.classList.remove('compact');lastScrollY=0;}
 try{sessionStorage.setItem('gym11-nav',JSON.stringify({tab,view,editing,filter,pick}));}catch{}
}
// Swipe from the left edge: the screen follows the finger with the previous one underneath.
let edge=null;
const underlay=document.createElement('div');underlay.className='underlay';underlay.setAttribute('aria-hidden','true');underlay.inert=true;
function edgeStart(){
 const prev=navStack[navStack.length-2];
 underlay.innerHTML=prev?.html?`<main class="${prev.cls||''}" style="transform:translateY(${-(prev.scroll||0)}px)">${prev.html}</main>`:'';
 underlay.querySelectorAll('[id]').forEach(el=>el.removeAttribute('id'));
 document.body.append(underlay);document.body.classList.add('edge-swiping');
}
function edgeMove(dx){
 const p=Math.min(1,dx/innerWidth);
 for(const el of [app,foot])el.style.transform=`translateX(${dx}px)`;
 underlay.style.transform=`translateX(${-28*(1-p)}%)`;underlay.style.setProperty('--dim',(.12*(1-p)).toFixed(3));
}
function edgeEnd(go,btn){
 const done=()=>{for(const el of [app,foot]){el.style.transition='';el.style.transform='';}underlay.style.transition='';underlay.style.transform='';underlay.remove();document.body.classList.remove('edge-swiping');};
 for(const el of [app,foot,underlay])el.style.transition='transform .26s cubic-bezier(.2,.9,.3,1)';
 if(!go){edgeMove(0);setTimeout(done,270);return;}
 edgeMove(innerWidth);
 setTimeout(()=>{const before=lastKey;skipTransition=true;btn.click();const t0=Date.now();
  (function wait(){if(lastKey!==before||Date.now()-t0>600){skipTransition=false;requestAnimationFrame(done);}else requestAnimationFrame(wait);})();},260);
}
document.addEventListener('touchstart',e=>{
 const t=e.touches[0];if(e.touches.length>1||modal.open||t.clientX>24)return;
 const btn=app.querySelector('[data-back]');if(!btn)return;
 edge={x0:t.clientX,y0:t.clientY,t0:Date.now(),dx:0,on:false,btn};
},{passive:true});
document.addEventListener('touchmove',e=>{
 if(!edge)return;const t=e.touches[0],dx=t.clientX-edge.x0,dy=t.clientY-edge.y0;
 if(!edge.on){if(Math.abs(dy)>10&&Math.abs(dy)>Math.abs(dx)){edge=null;return;}if(dx<8)return;edge.on=true;edgeStart();}
 e.preventDefault();edge.dx=Math.max(0,dx);edgeMove(edge.dx);
},{passive:false});
document.addEventListener('touchend',()=>{
 if(!edge)return;const s=edge;edge=null;if(!s.on)return;
 edgeEnd(s.dx>innerWidth*.35||(s.dx>50&&s.dx/Math.max(1,Date.now()-s.t0)>.65),s.btn);   // far enough, or a quick flick
});
document.addEventListener('touchcancel',()=>{if(edge?.on)edgeEnd(false,edge.btn);edge=null;});
// After a reload (iOS may restart the app in the background) go back to the same screen.
function restorePlace(){
 let saved;try{saved=JSON.parse(sessionStorage.getItem('gym11-nav')||'null');}catch{}
 if(!saved)return;
 if(TABS.some(t=>t[0]===saved.tab))tab=saved.tab;
 if(saved.tab==='settings'){tab='home';saved.view='settings';}
 editing=saved.editing||null;if(Array.isArray(saved.pick))pick=saved.pick.filter(g=>groups.includes(g)).slice(0,MAX_PICK);if(['Todos',...groups].includes(saved.filter))filter=saved.filter;
 view=saved.view||null;
 if(view==='groups'){if(draft)view=null;}
 else if(WORKOUT_VIEWS.includes(view)){if(!draft)view=null;else{selection=draft.selection||null;if(view!=='session:draft')view=selection&&['grip','setup','active','rating'].includes(draft.phase)?draft.phase:'select';}}
 else if(view==='pick'&&!sessions.some(x=>x.id===editing))view=null;
}
// Bottom sheet. Focus goes to the sheet itself (not its first button, which showed a focus
// ring on "Cancelar"), the page behind stops scrolling, and dragging down closes it.
// Tab bar is built once and kept. The selection works like the iOS 26 tab bar: on a switch
// (or when you press and drag) the highlight lifts into a glass lens that magnifies the icons
// under it, travels on a spring and drops back into a pill. It keeps its shape while moving
// (no stretch, no bar swell: together with the lens that read as the old effect).
// Physics from the web recreations of the native bar: spring k=380, c=26 (slight overshoot).
// Positions come from layout boxes.
const lens={x:0,v:0,to:0,lift:0,lv:0,hold:false,raf:0,last:0,drag:null,ready:false};
const navButtons=()=>[...nav.querySelectorAll('button[data-tab]')];
const tabCenter=b=>b.offsetLeft+b.offsetWidth/2;
function updateNav(bar){
 nav.hidden=!bar;if(!bar)return;
 if(!nav.querySelector('.nav-pill')){
  const items=TABS.map(([id,ic])=>`<span class="nav-copy-item" data-for="${id}">${icon(ic)}</span>`).join('');
  nav.innerHTML=`<span class="nav-pill" aria-hidden="true"><span class="nav-copy">${items}</span></span>`+TABS.map(([id,ic,label])=>`<button type="button" data-tab="${id}" aria-label="${label}">${icon(ic)}<span class="sr-only">${label}</span></button>`).join('');
  lens.ready=false;
 }
 let active=null;
 navButtons().forEach(b=>{const on=b.dataset.tab===tab;b.classList.toggle('active',on);b.setAttribute('aria-current',on?'page':'false');if(on)active=b;});
 nav.querySelectorAll('.nav-copy-item').forEach(s=>s.classList.toggle('active',s.dataset.for===tab));
 if(!active)return;
 const to=tabCenter(active);
 if(!lens.ready||reducedMotion()){lens.x=lens.to=to;lens.v=0;lens.lift=0;lens.ready=true;drawLens();return;}
 if(lens.drag)return;                                 // the finger is in charge
 if(Math.abs(to-lens.to)>1){lens.to=to;lens.hold=true;startLens();}
 else{lens.to=to;drawLens();}
}
function startLens(){if(!lens.raf){lens.last=performance.now();lens.raf=requestAnimationFrame(stepLens);}}
function stepLens(now){
 let dt=Math.min(.032,(now-lens.last)/1000);lens.last=now;
 const k=lens.drag?900:380,c=lens.drag?55:26;          // the finger: snappier, a little liquid lag
 for(const h of [dt/2,dt/2]){
  lens.v+=(-k*(lens.x-lens.to)-c*lens.v)*h;lens.x+=lens.v*h;
  const lt=lens.hold?1:0;lens.lv+=(-520*(lens.lift-lt)-30*lens.lv)*h;lens.lift+=lens.lv*h;
 }
 if(!lens.drag&&Math.abs(lens.x-lens.to)<1.5&&Math.abs(lens.v)<40)lens.hold=false;   // arrived: drop the lens
 const done=!lens.hold&&!lens.drag&&Math.abs(lens.x-lens.to)<.3&&Math.abs(lens.v)<2&&Math.abs(lens.lift)<.004&&Math.abs(lens.lv)<.05;
 if(done){lens.x=lens.to;lens.v=0;lens.lift=0;lens.lv=0;}
 drawLens();
 lens.raf=done?0:requestAnimationFrame(stepLens);
}
function drawLens(){
 const pill=nav.querySelector('.nav-pill'),b=navButtons()[0];if(!pill||!b)return;
 const lift=Math.max(0,Math.min(1.15,lens.lift));
 const bw=b.offsetWidth,bh=b.offsetHeight,top=b.offsetTop;
 const w=bw*(1+.14*lift),h=bh*(1+.28*lift);
 const lx=lens.x-w/2,ly=top+bh/2-h/2,M=1+.24*lift;
 pill.style.width=w+'px';pill.style.height=h+'px';pill.style.borderRadius=h/2+'px';
 pill.style.transform=`translate(${lx}px,${ly}px)`;
 pill.style.setProperty('--lift',Math.min(1,lift).toFixed(3));
 const copy=pill.firstElementChild,cy=top+bh/2;
 copy.style.width=nav.clientWidth+'px';copy.style.height=nav.clientHeight+'px';
 copy.style.transform=`translate(${-lx+lens.x-M*lens.x}px,${-ly+cy-M*cy}px) scale(${M})`;
}
// Press and drag along the bar, like iOS: the lens follows the finger and lands on the nearest tab.
nav.addEventListener('pointerdown',e=>{
 if(!e.isPrimary||!lens.ready||reducedMotion())return;
 const d=lens.drag={id:e.pointerId,x0:e.clientX,on:false,idx:-1,moved:false};
 d.timer=setTimeout(()=>beginDrag(e.clientX),250);
});
function navX(clientX){return clientX-nav.getBoundingClientRect().left;}
function beginDrag(clientX){
 const d=lens.drag;if(!d||d.on)return;d.on=true;clearTimeout(d.timer);
 try{nav.setPointerCapture(d.id);}catch{}
 lens.hold=true;followFinger(clientX);haptic();startLens();
}
function followFinger(clientX){
 const bs=navButtons(),lo=tabCenter(bs[0]),hi=tabCenter(bs[bs.length-1]);let x=navX(clientX)/(nav.getBoundingClientRect().width/nav.offsetWidth);
 if(x<lo)x=lo-Math.sqrt(lo-x)*3;else if(x>hi)x=hi+Math.sqrt(x-hi)*3;   // rubber band past the ends
 lens.to=x;
 const idx=nearestTab(x);if(idx!==lens.drag.idx){if(lens.drag.idx>=0)haptic();lens.drag.idx=idx;}
}
function nearestTab(x){const bs=navButtons();let best=0;bs.forEach((b,i)=>{if(Math.abs(tabCenter(b)-x)<Math.abs(tabCenter(bs[best])-x))best=i;});return best;}
nav.addEventListener('pointermove',e=>{
 const d=lens.drag;if(!d||e.pointerId!==d.id)return;
 if(!d.on&&Math.abs(e.clientX-d.x0)>8)beginDrag(e.clientX);
 if(d.on){d.moved=true;followFinger(e.clientX);startLens();}
});
function endDrag(e,cancel){
 const d=lens.drag;if(!d||e.pointerId!==d.id)return;clearTimeout(d.timer);lens.drag=null;
 if(!d.on)return;                                     // a plain tap: the click switches tabs
 nav.dataset.dragged='1';setTimeout(()=>delete nav.dataset.dragged,350);
 const bs=navButtons(),idx=cancel?bs.findIndex(b=>b.dataset.tab===tab):nearestTab(lens.x+lens.v*.08);
 lens.to=tabCenter(bs[idx]);lens.hold=true;startLens();
 if(!cancel&&bs[idx].dataset.tab!==tab){tab=bs[idx].dataset.tab;view=null;render();}
}
nav.addEventListener('pointerup',e=>endDrag(e,false));
nav.addEventListener('pointercancel',e=>endDrag(e,true));
nav.addEventListener('click',e=>{if(nav.dataset.dragged){e.stopPropagation();e.preventDefault();}},true);
// While a workout is on, a second floating bar sits right above the tab bar to go back to it.
const resumeBar=document.createElement('button');resumeBar.type='button';resumeBar.id='resume-bar';resumeBar.dataset.action='resume';resumeBar.hidden=true;document.body.append(resumeBar);
function updateResume(bar){
 const on=!!(bar&&draft);resumeBar.hidden=!on;document.body.classList.toggle('has-resume',on);if(!on)return;
 const sub=selection?.started?`A medias: ${selection.exercise.name}`:draft.entries.length?plural(draft.entries.length,'ejercicio hecho','ejercicios hechos'):draft.groups.join(' + ');
 resumeBar.innerHTML=`<span class="resume-icon">${icon('play')}</span><span class="grow"><strong>Continuar entrenamiento</strong><small>${esc(sub)}</small></span><span class="resume-time" data-since="${new Date(draft.date).getTime()}">${sinceText(new Date(draft.date).getTime())}</span>`;
}
addEventListener('resize',()=>{if(!nav.hidden&&nav.querySelector('.nav-pill')){lens.ready=false;updateNav(true);}});
// Like Instagram: scrolling down shrinks the tab bar out of the way, scrolling up brings it back.
let lastScrollY=0;
addEventListener('scroll',()=>{
 const y=scrollY,dy=y-lastScrollY;if(Math.abs(dy)<6)return;
 nav.classList.toggle('compact',dy>0&&y>40&&y+innerHeight<document.documentElement.scrollHeight-4);resumeBar.classList.toggle('compact',nav.classList.contains('compact'));
 lastScrollY=y;
},{passive:true});
function openDialog(html){
 modal.innerHTML=`<div class="grabber" aria-hidden="true"></div>${html}`;
 if(!modal.open)modal.showModal();
 modal.tabIndex=-1;modal.focus({preventScroll:true});modal.scrollTop=0;
 document.documentElement.classList.add('sheet-open');
}
function close(){if(modal.open)modal.close();}
modal.addEventListener('close',()=>{document.documentElement.classList.remove('sheet-open');modal.style.transform='';modal.style.transition='';});
let sheetDrag=null;
modal.addEventListener('touchstart',e=>{
 if(modal.scrollTop>0||e.target.closest('input:not([type=checkbox]):not([type=radio]),select,textarea'))return;
 sheetDrag={y:e.touches[0].clientY,t:Date.now(),dy:0};
},{passive:true});
modal.addEventListener('touchmove',e=>{
 if(!sheetDrag)return;
 const dy=e.touches[0].clientY-sheetDrag.y;
 if(dy<=0){if(sheetDrag.dy){sheetDrag.dy=0;modal.style.transform='';}return;}   // scrolling the sheet's content up
 if(modal.scrollTop>0){sheetDrag=null;return;}
 e.preventDefault();sheetDrag.dy=dy;modal.style.transition='none';modal.style.transform=`translateY(${dy}px)`;
},{passive:false});
modal.addEventListener('touchend',()=>{
 if(!sheetDrag)return;const {dy,t}=sheetDrag;sheetDrag=null;if(!dy)return;
 const fast=dy/Math.max(1,Date.now()-t)>.6;modal.style.transition='transform .22s ease-out';
 if(dy>120||(fast&&dy>40)){modal.style.transform='translateY(110%)';setTimeout(close,200);}else modal.style.transform='';
});

async function load(){exercises=await db.all('exercises');sessions=(await db.all('sessions')).sort((a,b)=>new Date(b.date)-new Date(a.date));draft=(await db.get('drafts','active'))?.value||null;}
async function saveDraft(){if(draft)await db.put('drafts',{id:'active',value:draft});}
async function saveSelection(){if(draft){draft.selection=selection;draft.phase=view;await saveDraft();}}
function reorder(s){const order={};s.entries.forEach(e=>e.order=order[e.exercise.group]=(order[e.exercise.group]||0)+1);}
function currentSession(){if(view==='pick')return sessions.find(s=>s.id===editing);return view==='session:draft'?draft:sessions.find(s=>s.id===view?.slice(8));}
async function persistSession(s){if(s===draft)await saveDraft();else{s.editedAfterImport=true;await db.put('sessions',s);}}
// Groups actually trained: the planned ones that got exercises (in the chosen order),
// then any other group in the order its first exercise was done.
function trainedGroups(s){const done=s.entries.map(e=>e.exercise.group);return [...new Set([...s.groups.filter(g=>done.includes(g)),...done])];}
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
 if(view==='settings')return renderSettings();
 if(tab==='catalog')return renderLibrary('tab');
 if(tab==='history')return renderHistory();
 renderHome();
}

/* ---------- home ---------- */
const miniBars=(counts,color)=>`<div class="minibars">${counts.map((c,i)=>`<i style="height:${c?9+Math.min(c,3)*5:6}px;${c?`background:${color};opacity:${(.55+i*.06).toFixed(2)}`:''}"></i>`).join('')}</div>`;
function sessionCard(s){return `<button type="button" class="card session" data-session="${esc(s.id)}"><span class="session-top">${s.groups.map(g=>muscleIcon(g)).join('')}<strong>${esc(s.groups.join(' + ')||s.historicalTitle||'Entreno')}</strong><small>${shortDate(s.date)}</small></span><span class="session-bottom"><small>${plural(s.entries.length,'ejercicio','ejercicios')}${minutes(s)?` · ${minutes(s)} min efectivos`:''}</small>${chevron()}</span></button>`;}
// Home cover note: workouts so far this month.
function monthNote(done,now){const n=done.filter(s=>{const d=new Date(s.date);return d.getMonth()===now.getMonth()&&d.getFullYear()===now.getFullYear();}).length;return n?`Llevas ${n} ${n===1?'entreno':'entrenos'} este mes.`:'Todavía no has entrenado este mes.';}
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
 const dateText=now.toLocaleDateString('es-ES',{weekday:'long',day:'numeric',month:'long'}),note=monthNote(done,now);
 show(`<header class="cover"><div class="cover-top"><p class="cover-date">${esc(dateText.charAt(0).toUpperCase()+dateText.slice(1))}</p>${iconBtn('gear','settings','Ajustes')}</div><h1>${name?`Hola, ${esc(name)}.`:'Hola.'}</h1><p class="cover-note">${esc(note)}</p></header>
<div class="home-panel">
<section class="week card raised" aria-label="Esta semana">${['L','M','X','J','V','S','D'].map((letter,i)=>{const k=dayKey(addDays(monday,i)),isToday=k===today,isDone=days.has(k);return `<div class="${isToday?'today':''}"><small>${letter}</small><span class="dot ${isDone?'done':''}">${isDone?icon('check'):isToday?letter:''}</span></div>`;}).join('')}</section>
${draft?`<div class="workout-clock" role="timer" aria-label="Tiempo de entreno"><small>Entrenando · ${esc(draft.groups.join(' + '))}</small><b data-since="${new Date(draft.date).getTime()}">${sinceText(new Date(draft.date).getTime())}</b></div>`:`<button type="button" class="primary" data-action="start">${icon('play')}Empezar entrenamiento</button>`}
<button type="button" class="card month" data-tab="history"><span class="between"><strong>Tu actividad este mes</strong>${chevron()}</span><span class="monthbars">${Array.from({length:monthLength},(_,i)=>{const c=perDay.get(dayKey(new Date(now.getFullYear(),now.getMonth(),i+1)))||0;return `<i class="${c?'on':''}" style="height:${c?Math.min(54,15+c*7):7}px"></i>`;}).join('')}</span><span class="between muted"><small>1</small><small>${esc(now.toLocaleDateString('es-ES',{month:'long'}))}</small><small>${monthLength}</small></span></button>
<div class="stats"><div class="card raised stat"><span class="badge-icon blue">${icon('dumbbell')}</span><b>${fourWeeks}</b><strong>entrenos</strong><small>últimas 4 semanas</small>${miniBars(weekly,'var(--accent)')}</div><div class="card raised stat"><span class="badge-icon orange">${icon('flame')}</span><b>${streak}</b><strong>${streak===1?'día':'días'}</strong><small>racha actual</small>${miniBars(daily,'var(--orange)')}</div></div>
${latest?`<button type="button" class="card last" data-session="${esc(latest.id)}"><span class="badge-icon blue big">${icon('history')}</span><span class="grow"><small>Último entreno</small><strong>${esc(latest.groups.join(' + ')||latest.historicalTitle||'Entreno')}</strong><small>${esc(longDate(latest.date))}</small></span>${chevron()}</button>`:''}
</div>`,{cls:'home-page'});
}

/* ---------- workout: muscle group ---------- */
function groupCard(x,small){
 const n=pick.indexOf(x)+1,on=n>0;
 return small?`<button type="button" class="card group small ${on?'on':''}" data-group="${esc(x)}" aria-pressed="${on}">${on?`<span class="order">${n}</span>`:''}${muscleIcon(x)}<strong>${esc(x)}</strong></button>`
  :`<button type="button" class="card group ${on?'on':''}" data-group="${esc(x)}" aria-pressed="${on}"><span class="between top">${muscleIcon(x)}${on?`<span class="order">${n}</span>`:`<small>${exercises.filter(e=>e.group===x&&!e.deleted).length}</small>`}</span><strong>${esc(x)}</strong><small>${esc(daysAgo(lastFor(x)?.date))}</small></button>`;
}
function renderGroups(){
 show(`${topbar(back('Atrás','home'))}<h1>¿Qué toca hoy?</h1><p class="muted sub">Toca los grupos en el orden que quieras, hasta ${MAX_PICK}. Serán tus accesos rápidos durante el entreno.</p>
<div class="grid">${MAIN_GROUPS.map(x=>groupCard(x,false)).join('')}</div>
<div class="grid minor">${groups.filter(x=>!MAIN_GROUPS.includes(x)).map(x=>groupCard(x,true)).join('')}</div>
<p class="footnote">Si haces un ejercicio de otro grupo, búscalo en «Todos»: también quedará registrado.</p>`,
 {bar:false,footer:`<button type="button" class="primary" data-action="group-start" ${pick.length?'':'disabled'}>${pick.length?`Empezar ${pick.length<=2?esc(pick.join(' + ')):`entreno · ${pick.length} grupos`}${icon('arrow-right')}`:'Elige al menos un grupo'}</button>`});
}

/* ---------- exercise library: tab, workout selection, add to past workout ---------- */
function exerciseCard(e,mode){
 const attr=mode==='pick'?'pick':mode==='workout'?'choose':'exercise',done=mode==='workout'&&draft.entries.some(x=>x.exercise.id===e.id),going=mode==='workout'&&selection?.started&&selection.exercise.id===e.id;
 if(layout==='list')return `<button type="button" class="card ex-row" data-${attr}="${esc(e.id)}">${thumb(e)}<span class="grow"><strong>${esc(e.name)}</strong></span>${going?'<span class="going-tag">A medias</span>':done?icon('check-circle','accent'):chevron()}</button>`;
 return `<button type="button" class="card ex-card" data-${attr}="${esc(e.id)}">${thumb(e)}${going?'<span class="going-tag">A medias</span>':done?`<span class="done-mark">${icon('check')}</span>`:''}<strong>${esc(e.name)}</strong></button>`;
}
function renderLibrary(mode){
 const inWorkout=mode==='workout',picking=mode==='pick';
 const list=recentExercises(exercises.filter(e=>!e.deleted),sessions).filter(e=>(filter==='Todos'||e.group===filter)&&e.name.toLocaleLowerCase().includes(search.toLocaleLowerCase()));
 const s=picking?currentSession():null;
 const head=inWorkout?`${topbar(back('Inicio','home'),iconBtn('plus','new-exercise','Nuevo ejercicio'))}<h1>Elige ejercicio</h1>${selection?.started?`<button type="button" class="card going" data-choose="${esc(selection.exercise.id)}">${thumb(selection.exercise)}<span class="grow"><small>A medias</small><strong>${esc(selection.exercise.name)}</strong><small class="muted"><span data-since="${selection.started}">${mmss(Math.floor((Date.now()-selection.started)/1000))}</span> · ${num(selection.weight)} kg</small></span><span class="going-go">Volver${icon('chevron-right')}</span></button>`:''}`
  :picking?`${topbar(back('Entreno','back-to-session'),iconBtn('plus','new-exercise','Nuevo ejercicio'))}<h1>Añadir ejercicio</h1><p class="muted sub">${esc(s.groups.join(' + '))} · ${esc(date(s.date))} · ${plural(s.entries.length,'ejercicio','ejercicios')}</p>`
  :`<div class="title-row"><h1>Ejercicios</h1>${iconBtn('plus','new-exercise','Nuevo ejercicio')}</div>`;
 const filters=inWorkout?segButtons([...draft.groups,'Todos'].map(g=>['filter:'+g,esc(g),filter===g])).replace('class="seg"',`class="seg tabs-${draft.groups.length+1}"`)
  :`<div class="chips" id="chips">${['Todos',...groups].map(g=>`<button type="button" data-action="filter:${esc(g)}" class="${filter===g?'on':''}">${esc(g)}</button>`).join('')}</div>`;
 show(`${head}<label class="search">${icon('search')}<input id="search" type="search" placeholder="Buscar ejercicio" value="${esc(search)}" aria-label="Buscar ejercicio" autocomplete="off" autocorrect="off" spellcheck="false"></label>${filters}
<div class="between meta-line"><small class="muted">${inWorkout?plural(draft.entries.length,'ejercicio hecho','ejercicios hechos'):`${plural(list.length,'ejercicio','ejercicios')} · recientes primero`}</small>${segButtons([['layout:grid',icon('grid'),layout==='grid'],['layout:list',icon('list'),layout==='list']]).replace('class="seg"','class="seg compact" aria-label="Presentación"')}</div>
<div class="${layout==='grid'?'grid':'stack'}">${list.map(e=>exerciseCard(e,mode)).join('')}</div>${list.length?'':`<div class="empty">${icon('dumbbell')}<strong>No hay ejercicios</strong><p>Prueba con otro nombre o añade uno con +.</p></div>`}${inWorkout?`<button type="button" class="link discard-link" data-action="discard">Descartar entreno</button>`:''}`,
 {bar:!inWorkout,footer:inWorkout?`<button type="button" class="done-row" data-action="summary"><span>Ejercicios hechos (${draft.entries.length})</span>${icon('chevron-up')}</button><button type="button" class="primary" data-action="finish-workout" ${draft.entries.length?'':'disabled'}>Finalizar</button>`:''});
}
async function choose(id){
 if(selection?.started){
  if(selection.exercise.id===id){view=selection.ended?'rating':'active';await saveSelection();render();return;}
  if(!confirm(`Tienes ${selection.exercise.name} a medias. ¿Dejarlo sin registrar y empezar otro?`))return;
 }
 const exercise=exercises.find(e=>e.id===id);
 selection={exercise,grip:exercise.grips[0]||null,cableStation:'sala1',weight:0,sets:4,reps:exercise.name.startsWith('Curl 15')?15:exercise.name.startsWith('Curl 21')?21:10,toFailure:false,unilateral:unilateralMode(exercise)==='always',dropset:false};
 selection.weight=suggestWeight(sessions,exercise,selection.grip);
 view=exercise.grips.length>1?'grip':'setup';await saveSelection();render();
}

/* ---------- workout: grip, setup, active, rating ---------- */
function renderGrip(){const e=selection.exercise;show(`${topbar(back('Ejercicios','select'))}<h1>${e.name==='Press francés'?'Elige equipo':'Elige agarre'}</h1><p class="muted sub">${esc(e.name)}</p><div class="stack">${e.grips.map(g=>`<button type="button" class="card grip" data-action="grip:${esc(g)}"><strong>${esc(g)}</strong>${icon('arrow-right','muted')}</button>`).join('')}</div>`,{bar:false});}
function priorCard(){
 const e=selection.exercise,prior=antecedents(sessions,e,selection.grip,selection.cableStation),last=prior.find(p=>p.weight>0)||prior[0];
 if(!last)return `<div class="card prior static"><small class="muted">Sin registros previos. Ajusta tu peso inicial.</small></div>`;
 return `<button type="button" class="card prior" data-action="prior"><span class="between"><small class="muted with-icon">${icon('history')}Última sesión registrada</small><strong>${num(last.weight)} kg · ${repsText(last)}</strong></span><span class="between"><small class="muted">Posición</small><small class="accent">${last.order}.º de ${esc(last.exercise.group.toLowerCase())}${last.feeling?' · '+esc(last.feeling):''}</small></span><span class="between"><small class="muted">Toca para ver sesiones anteriores</small>${chevron()}</span></button>`;
}
function renderSetup(){
 const e=selection.exercise,fixed=e.name.startsWith('Curl 15')?15:e.name.startsWith('Curl 21')?21:null;
 const customSets=![3,4,5].includes(selection.sets),customReps=!selection.toFailure&&![6,8,10,12].includes(selection.reps);
 show(`<div class="setup-photo">${e.image?`<img src="${esc(e.image)}" alt="">`:muscleIcon(e.group)}<div class="float-bar">${selection.started?`<button type="button" class="icon-btn" data-back data-action="active" aria-label="Volver al ejercicio">${icon('chevron-left')}</button>`:`<button type="button" class="icon-btn" data-back data-action="select" aria-label="Volver a los ejercicios">${icon('chevron-left')}</button>`}</div><span class="pill">${icon('dumbbell')}${esc(e.group)}</span></div>
<div class="pad">
<div class="setup-head"><div class="grow"><h1>${esc(e.name)}</h1>${selection.grip?`<button type="button" class="link grip-link" data-action="${e.grips.length>1?'regrip':'noop'}">Agarre: ${esc(selection.grip)}${e.grips.length>1?' · Cambiar':''}</button>`:''}</div>${unilateralMode(e)==='optional'?`<label class="mini-toggle"><small>Unilateral</small>${toggle('unilateral',selection.unilateral,'unilateral')}</label>`:unilateralMode(e)==='always'?'<span class="tag">Unilateral</span>':''}</div>
${e.usesCable?`<section class="card block"><div class="caption">Polea</div>${segButtons(STATIONS.map(([v,l])=>['station:'+v,l,selection.cableStation===v]))}</section>`:''}
<section class="card block"><div class="between caption"><span>Series objetivo</span><span class="plain">${plural(selection.sets,'serie programada','series programadas')}</span></div><div class="choices">${[3,4,5].map(n=>btn(n,'sets:'+n,selection.sets===n?'on':'')).join('')}${btn(customSets?selection.sets:'Otro','custom:sets',customSets?'on':'')}</div></section>
<section class="card block"><div class="caption">Repeticiones por serie</div>${fixed?`<strong>${fixed} repeticiones · ${fixed===15?'5 + 5 + 5':'7 + 7 + 7'}</strong>`:`<div class="choices">${[6,8,10,12].map(n=>btn(`${n}<small>reps</small>`,'reps:'+n,!selection.toFailure&&selection.reps===n?'on':'')).join('')}${btn(customReps?`${selection.reps}<small>reps</small>`:'Otro','custom:reps',customReps?'on':'')}</div><div class="choices">${btn('Al fallo','failure',selection.toFailure?'on':'')}</div>`}</section>
<section class="list"><label class="row"><span class="row-label">Dropset</span>${toggle('dropset',selection.dropset,'dropset')}</label>${selection.dropset?`<div class="row wrap"><span class="row-label">¿En qué series?</span>${segButtons(DS_SETS.map(([v,l])=>['ds-sets:'+v,l,(selection.dropsetInfo||dsDefault()).sets===v]))}</div><div class="row wrap"><span class="row-label">¿Cuánto bajas?</span>${segButtons(DS_DROP.map(([v,l])=>['ds-drop:'+v,l,(selection.dropsetInfo||dsDefault()).drop===v]))}</div>`:''}</section>${selection.dropset?'<p class="footnote">Se guarda el peso de inicio, así que el dropset no cambia la recomendación de peso.</p>':''}
${priorCard()}</div>`,{bar:false,cls:'flush',footer:selection.started?`<button type="button" class="primary" data-action="active">Volver al ejercicio${icon('arrow-right')}</button>`:`<button type="button" class="primary" data-action="begin">Empezar ejercicio${icon('play')}</button>`});
}
function renderActive(){
 const e=selection.exercise,uni=unilateralMode(e)==='always'||(unilateralMode(e)==='optional'&&selection.unilateral),detail=[selection.grip,e.usesCable?'Polea · '+stationName(selection.cableStation):null,uni?'Unilateral':null,selection.dropset?dsText(selection.dropsetInfo||dsDefault()):null].filter(Boolean).join(' · ');
 show(`${topbar(back('Ejercicios','select'),`<button type="button" class="tool-pill" data-action="setup">${icon('sliders')}Ajustes</button>`)}<div class="active-view"><div class="timer" id="timer" aria-label="Tiempo efectivo">0:00</div><h1>${esc(e.name)}</h1>${detail?`<small class="muted">${esc(detail)}</small>`:''}<p class="muted">${plural(selection.sets,'serie','series')} · ${selection.toFailure?'al fallo':selection.reps+' repeticiones'}</p>${trackSets?setsTrack():''}
${adviceChip()}<label class="weight-value"><input id="weight" inputmode="decimal" enterkeyhint="done" value="${num(selection.weight)}" aria-label="Peso en kilos (toca para escribirlo)"><span>kg</span></label>${weightRuler(lastWeight())}</div>${priorCard()}`,
 {bar:false,footer:trackSets?activeFooter():`<button type="button" class="primary check" data-action="rate" aria-label="Terminar ejercicio">${icon('check')}</button>`,after:()=>{updateTimer();fitWeight();setupRuler();markAdvice();}});
}
/* ---------- sets and rest ---------- */
// One segment per planned set, filled as sets are done. After each set a rest countdown runs
// (default 90 s, the last length used is remembered); the last set goes straight to the rating.
let restSeconds=90,audio=null,trackSets=false; // set-by-set mode is optional (Ajustes), off by default
const setsDone=()=>selection?.setsDone||0;
const resting=()=>trackSets&&!!selection?.restUntil;
function setsTrack(){const n=Math.max(selection.sets,setsDone());return `<div class="sets-track" aria-label="${setsDone()} de ${selection.sets} series hechas">${Array.from({length:n},(_,i)=>`<i class="${i<setsDone()?'on':''}"></i>`).join('')}</div><small class="sets-label">${setsDone()?`${setsDone()} de ${selection.sets} hechas`:'Ninguna serie hecha todavía'}</small>`;}
const mmss=s=>`${Math.floor(s/60)}:${String(s%60).padStart(2,'0')}`;
// Time since a moment, as m:ss or h:mm:ss.
function sinceText(t,end=Date.now()){const s=Math.max(0,Math.floor((end-t)/1000)),h=Math.floor(s/3600);return h?`${h}:${String(Math.floor(s%3600/60)).padStart(2,'0')}:${String(s%60).padStart(2,'0')}`:mmss(s);}
function activeFooter(){
 if(resting()){const left=Math.max(0,Math.ceil((selection.restUntil-Date.now())/1000));
  return `<div class="rest" role="timer" aria-live="off"><div class="rest-top"><small>Descanso · siguiente: serie ${setsDone()+1} de ${selection.sets}</small></div><div class="rest-time" id="rest-time">${mmss(left)}</div><div class="rest-bar"><i id="rest-bar" style="width:${Math.min(100,left/(selection.restTotal||restSeconds)*100)}%"></i></div><div class="rest-actions">${btn('−15 s','rest:-15')}${btn('Saltar','rest-skip')}${btn('+15 s','rest:15')}</div></div>`;}
 return `<button type="button" class="primary" data-action="set-done">${icon('check')}Serie ${setsDone()+1} de ${selection.sets} hecha</button><button type="button" class="link finish-early" data-action="rate">Terminar ejercicio${setsDone()?` con ${plural(setsDone(),'serie','series')}`:''}</button>`;
}
// Sound needs an AudioContext created during a tap; it is unlocked on "Serie hecha".
function unlockAudio(){try{audio=audio||new (window.AudioContext||window.webkitAudioContext)();if(audio.state==='suspended')audio.resume();}catch{}}
function beep(){try{if(!audio)return;const t=audio.currentTime;for(const [at,f] of [[0,880],[.22,880],[.44,1320]]){const o=audio.createOscillator(),g=audio.createGain();o.frequency.value=f;o.connect(g);g.connect(audio.destination);g.gain.setValueAtTime(.0001,t+at);g.gain.exponentialRampToValueAtTime(.35,t+at+.02);g.gain.exponentialRampToValueAtTime(.0001,t+at+.18);o.start(t+at);o.stop(t+at+.2);}}catch{}}
async function endRest(alert){
 const late=Date.now()-selection.restUntil>15000;selection.restUntil=null;selection.restTotal=null;await saveSelection();
 if(alert&&!late){beep();haptic();if(navigator.vibrate)navigator.vibrate([120,80,120]);}
 if(view==='active'){render();if(alert)toast(`A por la serie ${setsDone()+1}.`);}
}
function updateRest(){
 if(view!=='active'||!resting())return;
 const left=Math.ceil((selection.restUntil-Date.now())/1000);
 if(left<=0){endRest(true);return;}
 const t=document.querySelector('#rest-time'),b=document.querySelector('#rest-bar');
 if(t)t.textContent=mmss(left);if(b)b.style.width=Math.min(100,left/(selection.restTotal||restSeconds)*100)+'%';
}
// Weight ruler: one tick every 0,25 kg, a longer one every kilo and a numbered one every 5 kg.
// It scrolls under a fixed needle and snaps to the nearest tick; the big number above can be typed.
const RULER_STEP=.25,RULER_PX=10,RULER_MAX=300;
// "Súbele / Mantén / Bájale" against last time, with the reason; ticked once the ruler goes that way.
function currentAdvice(){
 const e=selection.exercise,mode=unilateralMode(e);
 return weightAdvice(sessions,e,{date:draft?.date,grip:selection.grip,station:e.usesCable?selection.cableStation:'sala1',unilateral:mode==='always'||(mode==='optional'&&selection.unilateral),reps:selection.reps,sets:selection.sets,toFailure:selection.toFailure,order:(draft?.entries.filter(x=>x.exercise.group===e.group).length||0)+1});
}
const ADVICE={up:['arrow-up','Súbele'],keep:['equal','Mantén'],down:['arrow-down','Bájale'],none:['history','Sin referencia reciente']};
function adviceChip(){
 const a=currentAdvice();if(!a)return '';
 return `<div class="advice ${a.verdict}" id="advice" data-ref="${a.ref.weight}" data-verdict="${a.verdict}"><span class="advice-pill">${icon(ADVICE[a.verdict][0])}${ADVICE[a.verdict][1]}<span class="advice-ok">${icon('check')}</span></span><small>${esc(a.reason)}</small></div>`;
}
function markAdvice(){
 const el=document.querySelector('#advice');if(!el)return;
 const ref=Number(el.dataset.ref),w=selection.weight,v=el.dataset.verdict;
 el.classList.toggle('followed',(v==='up'&&w>ref)||(v==='down'&&w<ref)||(v==='keep'&&w===ref));
}
// Light tap on each kilo while sliding the ruler. iOS Safari has no vibration API, but toggling a
// native switch gives the system haptic (iOS 18+); Android uses navigator.vibrate.
const haptic=(()=>{let label;return()=>{try{if(navigator.vibrate){navigator.vibrate(6);return;}if(!label){label=document.createElement('label');label.className='haptic';label.setAttribute('aria-hidden','true');label.innerHTML='<input type="checkbox" switch tabindex="-1">';document.body.append(label);}label.click();}catch{}};})();
const lastWeight=()=>{const p=antecedents(sessions,selection.exercise,selection.grip,selection.cableStation).find(x=>x.weight>0);return p?p.weight:null;};
function weightRuler(last){
 const n=RULER_MAX/RULER_STEP,lastIdx=last!=null?Math.round(last/RULER_STEP):-1;let ticks='';
 for(let i=0;i<=n;i++){const kg=i*RULER_STEP,cls=kg%5===0?'t five':kg%1===0?'t kg':'t';ticks+=`<i class="${cls}${i===lastIdx?' last':''}">${kg%1===0?`<b>${kg}</b>`:''}</i>`;}
 return `<div class="ruler-wrap"><div class="ruler" id="ruler" aria-hidden="true"><div class="ruler-track">${ticks}</div></div><span class="needle"></span></div>${last!=null?`<small class="ruler-legend"><i></i>Última vez: ${num(last)} kg</small>`:''}`;
}
let rulerSave=null,rulerQuiet=false;
function rulerTo(weight,smooth=false){const r=document.querySelector('#ruler');if(!r)return;rulerQuiet=true;r.scrollTo({left:Math.round(Math.min(RULER_MAX,Math.max(0,weight))/RULER_STEP)*RULER_PX,behavior:smooth?'smooth':'instant'});setTimeout(()=>{rulerQuiet=false;},smooth?500:80);}
function setupRuler(){
 const r=document.querySelector('#ruler');if(!r)return;
 requestAnimationFrame(()=>rulerTo(selection.weight));
 r.addEventListener('scroll',()=>{
  if(rulerQuiet||!selection)return;
  const w=Math.min(RULER_MAX,Math.max(0,Math.round(r.scrollLeft/RULER_PX)*RULER_STEP));
  if(w===selection.weight)return;
  if(Math.floor(w)!==Math.floor(selection.weight))haptic();
  selection.weight=w;markAdvice();const input=document.querySelector('#weight');if(input&&document.activeElement!==input){input.value=num(w);fitWeight();}
  clearTimeout(rulerSave);rulerSave=setTimeout(()=>saveSelection(),300);
 },{passive:true});
}
function fitWeight(){const el=document.querySelector('#weight');if(!el)return;const probe=fitWeight.probe||=Object.assign(document.createElement('span'),{className:'weight-probe'});if(!probe.isConnected)document.body.append(probe);el.style.fontSize='';const cs=getComputedStyle(el);for(const k of ['fontFamily','fontSize','fontWeight','fontStyle','letterSpacing','fontVariantNumeric'])probe.style[k]=cs[k];probe.textContent=el.value||'0';let width=probe.getBoundingClientRect().width+4;const room=el.parentElement.clientWidth-(el.nextElementSibling?.offsetWidth||0)-8;el.style.fontSize='';if(width>room){const size=parseFloat(cs.fontSize)*room/width;el.style.fontSize=size+'px';width=room;}el.style.width=Math.ceil(width)+'px';}
function updateTimer(){const el=document.querySelector('#timer');if(el&&selection?.started){const sec=Math.max(0,Math.floor((Date.now()-selection.started)/1000));el.textContent=`${Math.floor(sec/60)}:${String(sec%60).padStart(2,'0')}`;}}
setInterval(()=>{updateTimer();updateRest();document.querySelectorAll('[data-since]').forEach(el=>{const t=sinceText(Number(el.dataset.since));if(el.textContent!==t)el.textContent=t;});},250);
function renderRating(){show(`<div class="rating"><button type="button" class="icon-btn white" data-back data-action="active" aria-label="Volver al ejercicio">${icon('chevron-left')}</button><div class="rating-body"><h1>¿Qué tal el peso?</h1><p class="muted">${esc(selection.exercise.name)} · ${num(selection.weight)} kg</p>${[['Fácil','smile','easy'],['Perfecto','check-circle','perfect'],['Demasiado','alert-circle','hard']].map(([f,ic,cls])=>`<button type="button" class="mood ${cls}" data-action="feeling:${f}">${icon(ic)}${f}</button>`).join('')}</div></div>`,{bar:false});}
function showPrior(){
 const e=selection.exercise,prior=antecedents(sessions,e,selection.grip,selection.cableStation);
 openDialog(`<header class="sheet-bar"><span></span><h2>Anteriores</h2>${btn('Listo','close','link strong')}</header><div class="list">${prior.map(p=>`<div class="row tall"><span class="grow"><strong>${p.weight>0?num(p.weight)+' kg':'Peso sin anotar'}</strong><small>${[p.toFailure||p.reps?repsText(p):null,`${p.order}.º de ${esc(p.exercise.group.toLowerCase())}`,p.feeling?esc(p.feeling):null].filter(Boolean).join(' · ')}</small></span><small class="muted">${shortDate(p.date)}</small></div>`).join('')}</div>`);
}
function numberSheet(kind){const reps=kind==='reps';openDialog(`<form id="number-form">${sheetBar(reps?'Repeticiones por serie':'Series','Listo')}<input type="hidden" name="kind" value="${kind}"><div class="big-stepper">${stepper('value',selection[kind]||(reps?10:4),1,reps?100:20)}<small class="muted">${reps?'repeticiones':'series'}</small></div></form>`);}

/* ---------- sessions ---------- */
function entryRow(e){
 const ex=exercises.find(x=>x.id===e.exercise.id)||e.exercise,extra=[e.grip,ex.usesCable&&e.cableStation&&e.cableStation!=='sala1'?'Polea · '+stationName(e.cableStation):null,e.unilateral?'Unilateral':null,e.dropset?dsText(e.dropsetInfo):null].filter(Boolean).join(' · ');
 return `<button type="button" class="row entry" data-edit-entry="${esc(e.id)}">${thumb(ex)}<span class="grow"><strong>${esc(e.exercise.name)}</strong><small>${e.weight?num(e.weight):'—'} kg · ${repsText(e)} · ${e.sets||'—'} series</small>${extra?`<small class="accent">${esc(extra)}</small>`:''}<small class="faint">${[`${e.order}.º de ${esc(e.exercise.group.toLowerCase())}`,e.seconds?mmss(Math.round(e.seconds))+' efectivos':null,e.feeling?esc(e.feeling):null].filter(Boolean).join(' · ')}</small></span>${chevron()}</button>`;
}
function renderSession(id){
 const isDraft=id==='draft',s=isDraft?draft:sessions.find(x=>x.id===id);if(!s){view=null;return render();}
 const sets=s.entries.reduce((n,e)=>n+(e.sets||0),0),shown=isDraft&&s.entries.length?trainedGroups(s):s.groups;
 show(`${topbar(back(isDraft?'Ejercicios':'Historial',isDraft?'select':'history'),isDraft?'':btn('Editar','edit-session','link'))}<h1>${isDraft?'Ejercicios hechos':'Tu entreno'}</h1>
<div class="summary"><small class="muted">${date(s.date)}</small>${shown.length?`<div class="group-pills">${shown.map(g=>`<span class="group-pill">${esc(g)}</span>`).join('')}</div>`:`<strong class="summary-name">${esc(s.historicalTitle||'Entreno')}</strong>`}
<div class="sum-stats">${isDraft?`<div><b data-since="${new Date(s.date).getTime()}">${sinceText(new Date(s.date).getTime())}</b><small>en total</small></div>`:s.finishedAt?`<div><b>${sinceText(new Date(s.date).getTime(),new Date(s.finishedAt).getTime())}</b><small>en total</small></div>`:''}<div><b>${s.entries.length}</b><small>${s.entries.length===1?'ejercicio':'ejercicios'}</small></div><div><b>${sets}</b><small>series</small></div><div><b>${minutes(s)}<i>min</i></b><small>efectivos</small></div></div></div>
<div class="list">${s.entries.map(entryRow).join('')||`<div class="row"><span class="muted">${isDraft?'Los ejercicios que registres aparecerán aquí.':'Este entreno todavía no tiene ejercicios.'}</span></div>`}${isDraft?'':`<button type="button" class="row action" data-action="add-to-session">${icon('plus')}Añadir ejercicio</button>`}</div>
${s.historicalNotes?.length?section('Otras anotaciones originales',s.historicalNotes.map(n=>`<div class="row"><span>${esc(n)}</span></div>`).join('')):''}
${isDraft?'':`<div class="list">${btn('Eliminar entreno','delete-session','row danger center')}</div>`}`,
 {bar:!isDraft,footer:isDraft?`<button type="button" class="primary" data-action="finish-workout" ${s.entries.length?'':'disabled'}>Finalizar entreno</button>`:''});
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
 show(`${topbar(back('Inicio','home'))}<h1>Ajustes</h1>
${p?section('Tu perfil',`<div class="row"><span class="badge-icon blue">${esc(p.firstName.charAt(0))}</span><span class="grow"><strong>${esc(p.name)}</strong><small id="cloud-status">${esc(cloudText())}</small></span></div><button type="button" class="row" data-action="restore-list"><span class="row-label">Recuperar una copia anterior</span>${chevron()}</button>${btn('Cerrar sesión','logout','row danger')}`,'Tus datos se sincronizan solos: entrando con tu nombre ves lo mismo en cualquier dispositivo. Sin internet puedes seguir usándola y los cambios se suben al volver la conexión.'):''}
${section('Entrenamiento',`<label class="row"><span class="row-label">Contar series y descanso</span>${toggle('track-sets',trackSets,'track-sets')}</label>`,'Si lo activas, marcas cada serie al acabarla y entre series sale una cuenta atrás de descanso. Desactivado, solo empiezas el ejercicio y lo terminas con ✓.')}
${section('Copias en archivo',`<button type="button" class="row" data-action="export"><span class="row-label">Exportar copia JSON</span>${chevron()}</button><label class="row"><span class="row-label">Importar copia…</span>${chevron()}<input type="file" id="import" accept=".json,application/json" hidden></label>`,'La importación se confirma antes de guardar y evita duplicados. También acepta la exportación de la app de Swift y el histórico de Notas.')}
${section('Esta app',`<div class="row"><span class="row-label">Sin conexión</span><small class="muted" id="offline-status">Comprobando…</small></div><button type="button" class="row" data-action="persist"><span class="row-label">Almacenamiento protegido</span><small class="muted">${persisted?'Concedido':'Solicitar'}</small></button><a class="row" href="https://repdb.co" target="_blank" rel="noopener"><span class="row-label">Ilustraciones de RepDB</span>${chevron()}</a>`,'Para instalarla: Safari → Compartir → Añadir a pantalla de inicio.')}`,{after:checkOffline});
}
function renderLogin(){app.className='';foot.innerHTML='';nav.hidden=true;document.body.dataset.chrome='none';app.innerHTML=`<div class="login"><img src="assets/icon-192.png" alt="" width="84" height="84"><h1>¿Quién eres?</h1><p class="muted">Escribe tu nombre y la inicial de tu apellido. Tus pesos se guardan en tu perfil y se sincronizan con la nube.</p><form id="login-form"><div class="list"><label class="row"><input name="who" placeholder="Josep F" aria-label="Nombre e inicial del apellido" autocomplete="off" autocapitalize="words" autocorrect="off" spellcheck="false" required maxlength="60"></label></div><button type="submit" class="primary">Entrar</button></form><small class="muted">La primera vez necesitas conexión a internet.</small></div>`;}

/* ---------- sheets (forms) ---------- */
// Shared fields for a recorded exercise. `entry` is null when adding by hand.
function entryFields(ex,entry){
 const grip=entry?entry.grip:ex.grips[0]||null,failure=!!entry?.toFailure;
 return `${ex.grips.length||ex.usesCable||entry?.grip?`<div class="list">${ex.grips.length?`<div class="row wrap"><span class="row-label">Agarre</span>${seg('grip',[...new Set([...ex.grips,...(grip?[grip]:[])])].map(g=>[g,g]),grip)}</div>`:entry?row('Agarre o variante',`<input name="grip" value="${esc(entry.grip||'')}" placeholder="Ninguno">`):''}${ex.usesCable?`<div class="row wrap"><span class="row-label">Polea</span>${seg('station',STATIONS,entry?.cableStation||'sala1')}</div>`:''}</div>`:''}
<div class="list">${row('Peso',`<span class="unit"><input name="weight" inputmode="decimal" required value="${num(entry?entry.weight:suggestWeight(sessions,ex,grip))}"><small>kg</small></span>`)}${row('Series',stepper('sets',entry?entry.sets:4,0,100))}${row('Repeticiones',stepper('reps',entry?entry.reps:10,0,1000,'data-reps',failure?'off':''))}<label class="row"><span class="row-label">Al fallo</span>${toggle('failure',failure)}</label></div>
<div class="list">${unilateralMode(ex)==='optional'?`<label class="row"><span class="row-label">Unilateral</span>${toggle('unilateral',entry?.unilateral)}</label>`:''}<label class="row"><span class="row-label">Dropset</span>${toggle('dropset',entry?.dropset)}</label><div class="row wrap ds-opts" ${entry?.dropset?'':'hidden'}><span class="row-label">¿En qué series?</span>${seg('dsSets',DS_SETS,(entry?.dropsetInfo||dsDefault()).sets)}</div><div class="row wrap ds-opts" ${entry?.dropset?'':'hidden'}><span class="row-label">¿Cuánto bajas?</span>${seg('dsDrop',DS_DROP,(entry?.dropsetInfo||dsDefault()).drop)}</div>${entry?row('Tiempo efectivo',`<span class="unit"><input name="seconds" inputmode="numeric" value="${Math.round(entry.seconds||0)}"><small>s</small></span>`):''}</div>
<h2 class="section">¿Qué tal el peso?</h2>${seg('feeling',[['','Sin valorar'],...FEELINGS.map(f=>[f,f])],entry?.feeling||'')}`;
}
function readEntry(f,ex,old){
 const weight=decimal(f.get('weight')),sets=Number(f.get('sets')),reps=Number(f.get('reps')),seconds=f.has('seconds')?Number(f.get('seconds')):old?.seconds||0;
 if(![weight,sets,reps,seconds].every(n=>Number.isFinite(n)&&n>=0)||!Number.isInteger(sets)||!Number.isInteger(reps)||weight>10000)throw new Error('Revisa el peso, las series y las repeticiones.');
 const mode=unilateralMode(ex);
 return {weight,sets,reps:f.has('failure')?0:reps,toFailure:f.has('failure'),unilateral:mode==='always'||(mode==='optional'&&f.has('unilateral')),dropset:f.has('dropset'),dropsetInfo:f.has('dropset')?{sets:f.get('dsSets')||'last',drop:f.get('dsDrop')||'half'}:null,grip:String(f.get('grip')||'').trim()||null,cableStation:ex?.usesCable?(f.get('station')||old?.cableStation||'sala1'):old?.cableStation||null,seconds,feeling:f.get('feeling')||''};
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
 if(a==='settings'){tab='home';view='settings';render();return;}
 if(['home','history','catalog'].includes(a)){tab=a;view=null;render();return;}
 if(a==='close'){close();return;}
 if(a.startsWith('layout:')){layout=a.slice(7);await db.put('settings',{id:'layout',value:layout});render();return;}
 if(a.startsWith('filter:')){const left=document.querySelector('#chips')?.scrollLeft;filter=a.slice(7);render();const chips=document.querySelector('#chips');if(chips&&left!=null)chips.scrollLeft=left;return;}
 if(a.startsWith('month:')){histMonth=new Date(histMonth.getFullYear(),histMonth.getMonth()+Number(a.slice(6)),1);histDay=null;render();return;}
 if(a==='all-days'){histDay=null;render();return;}
 if(a==='start'){pick=[];view='groups';render();return;}
 if(a==='resume'){selection=draft.selection||null;view=selection&&['grip','setup','active','rating'].includes(draft.phase)?draft.phase:'select';filter=[...draft.groups,'Todos'].includes(filter)?filter:draft.groups[0];render();return;}
 if(a==='group-start'){if(!pick.length){toast('Elige al menos un grupo.');return;}if(draft&&draft.entries.length&&!confirm('Ya hay un entrenamiento en curso. ¿Descartarlo y empezar otro?'))return;draft={id:uid(),date:new Date().toISOString(),groups:[...pick],entries:[],phase:'select'};await saveDraft();filter=pick[0];search='';view='select';render();return;}
 if(a==='summary'){view='session:draft';render();return;}
 if(a==='select'){view='select';if(!selection?.started)selection=null;if(draft){draft.selection=selection;draft.phase='select';await saveDraft();}render();return;}
 if(a==='regrip'){view='grip';await saveSelection();render();return;}
 if(a.startsWith('grip:')){selection.grip=a.slice(5);selection.weight=suggestWeight(sessions,selection.exercise,selection.grip,selection.cableStation);view='setup';await saveSelection();render();return;}
 if(a.startsWith('ds-sets:')||a.startsWith('ds-drop:')){const info={...(selection.dropsetInfo||dsDefault())};info[a.startsWith('ds-sets:')?'sets':'drop']=a.split(':')[1];selection.dropsetInfo=info;await saveSelection();render();return;}
 if(a.startsWith('station:')){selection.cableStation=a.slice(8);selection.weight=suggestWeight(sessions,selection.exercise,selection.grip,selection.cableStation);await saveSelection();render();return;}
 if(a==='new-exercise'){exerciseEditor();return;}
 if(a==='edit-exercise'){exerciseEditor(exercises.find(e=>e.id===view.slice(9)));return;}
 if(a==='archive-exercise'){if(confirm('¿Archivar este ejercicio? Sus registros se conservarán.')){const ex=exercises.find(e=>e.id===modal.querySelector('[name=id]').value);await db.put('exercises',{...ex,deleted:true});close();await load();view=null;render();}return;}
 if(a.startsWith('weight:')){selection.weight=Math.max(0,Math.round((selection.weight+Number(a.slice(7)))*100)/100);const input=document.querySelector('#weight');if(input){input.value=num(selection.weight);fitWeight();}await saveSelection();return;}
 if(a.startsWith('sets:')){selection.sets=Number(a.slice(5));await saveSelection();render();return;}
 if(a.startsWith('reps:')){selection.reps=Number(a.slice(5));selection.toFailure=false;await saveSelection();render();return;}
 if(a.startsWith('custom:')){numberSheet(a.slice(7));return;}
 if(a==='failure'){selection.toFailure=true;await saveSelection();render();return;}
 if(a==='prior'){showPrior();return;}
 if(a==='begin'){if(!selection.started)selection.started=Date.now();view='active';await saveSelection();render();return;}
 if(a==='setup'||a==='active'){if(a==='setup'&&view==='active')navStack=navStack.filter(e=>e.key!=='setup');   // opening the settings from the exercise is going forward
  view=a;await saveSelection();render();return;}
 if(a==='set-done'){unlockAudio();haptic();selection.setsDone=setsDone()+1;
  if(selection.setsDone>=selection.sets){selection.ended=Date.now();selection.restUntil=null;view='rating';}
  else{selection.restTotal=restSeconds;selection.restUntil=Date.now()+restSeconds*1000;}
  await saveSelection();render();return;}
 if(a.startsWith('rest:')){const d=Number(a.slice(5));selection.restUntil=Math.max(Date.now()+5000,selection.restUntil+d*1000);selection.restTotal=Math.max(15,(selection.restTotal||restSeconds)+d);restSeconds=Math.min(600,Math.max(15,restSeconds+d));await db.put('settings',{id:'restSeconds',value:restSeconds});await saveSelection();updateRest();return;}
 if(a==='rest-skip'){await endRest(false);return;}
 if(a==='rate'){selection.restUntil=null;if(!Number.isFinite(selection.weight)||selection.weight<0)throw new Error('Introduce un peso válido.');selection.ended=Date.now();view='rating';await saveSelection();render();return;}
 if(a.startsWith('feeling:')){const e=selection.exercise,mode=unilateralMode(e);draft.entries.push({id:uid(),exercise:{id:e.id,name:e.name,group:e.group},weight:selection.weight,reps:selection.toFailure?0:selection.reps,sets:selection.setsDone||selection.sets,toFailure:selection.toFailure,unilateral:mode==='always'||(mode==='optional'&&selection.unilateral),dropset:selection.dropset,dropsetInfo:selection.dropset?(selection.dropsetInfo||dsDefault()):null,isWarmup:false,grip:selection.grip,cableStation:e.usesCable?selection.cableStation:null,seconds:Math.max(0,(selection.ended-selection.started)/1000),feeling:a.slice(8),order:draft.entries.filter(x=>x.exercise.group===e.group).length+1});if(!draft.groups.includes(e.group))draft.groups=[...draft.groups,e.group];   // another group done on the fly: it gets its own shortcut
  selection=null;draft.selection=null;draft.phase='select';await saveDraft();view='select';render();return;}
 if(a==='finish-workout'){if(!draft.entries.length){toast('Añade al menos un ejercicio.');return;}if(!confirm('¿Finalizar entreno?\nSe guardarán los ejercicios de esta sesión en tu historial.'))return;const saved={...draft,groups:trainedGroups(draft),finishedAt:new Date().toISOString()};delete saved.selection;delete saved.phase;await db.transaction(['sessions','drafts'],tx=>{tx.objectStore('sessions').put({...saved,updatedAt:new Date().toISOString()});tx.objectStore('drafts').delete('active');});await load();selection=null;view=null;tab='history';histDay=null;histMonth=new Date(new Date().getFullYear(),new Date().getMonth(),1);render();toast('Entreno guardado.');return;}
 if(a==='discard'){if(confirm('¿Descartar este entreno?\nNo se guardará nada de lo que llevas.')){await db.remove('drafts','active');draft=null;selection=null;view=null;tab='home';render();}return;}
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
 if(a==='update'){await saveSelection();const b=document.querySelector('#update button');if(b){b.disabled=true;b.textContent='Actualizando…';}if(waitingWorker)waitingWorker.postMessage({type:'SKIP_WAITING'});else location.reload();return;}
}
async function handleChange(el){
 if(el.id==='import'){const file=el.files[0];if(!file)return;if(file.size>80*1024*1024)throw new Error('La copia supera 80 MB.');pendingImport=await prepareImport(JSON.parse(await file.text()));openDialog(`<header class="sheet-bar">${btn('Cancelar','close','link')}<h2>Importar copia</h2>${btn('Importar','confirm-import','link strong')}</header><div class="list"><div class="row"><span class="row-label">Contenido</span><small class="muted">${plural(pendingImport.sessions.length,'entreno','entrenos')} · ${pendingImport.exercises.length} ejercicios</small></div><label class="row"><span class="row-label">Reemplazar los repetidos</span>${toggle('overwrite',false,'overwrite')}</label></div><p class="footnote">Desactivado: se conservan los entrenos que ya tienes con el mismo identificador.</p>`);return;}
 if(el.id==='track-sets'){trackSets=el.checked;await db.put('settings',{id:'trackSets',value:trackSets});toast(trackSets?'Contarás series y descanso.':'Solo empezar y terminar.');return;}
 if(el.name==='dropset'&&el.form){el.form.querySelectorAll('.ds-opts').forEach(x=>x.hidden=!el.checked);return;}
 if(el.name==='failure'&&el.form){el.form.querySelector('[data-reps]')?.classList.toggle('off',el.checked);return;}
 if(!selection||el.closest('dialog'))return;
 if(el.id==='weight'){const value=decimal(el.value);if(!Number.isFinite(value)||value<0||value>10000){el.value=num(selection.weight);throw new Error('Introduce un peso entre 0 y 10.000 kg.');}selection.weight=value;el.value=num(value);fitWeight();rulerTo(value,true);markAdvice();}
 for(const [id,key] of [['unilateral','unilateral'],['dropset','dropset']])if(el.id===id)selection[key]=el.checked;
 if(el.id==='dropset'){if(el.checked&&!selection.dropsetInfo)selection.dropsetInfo=dsDefault();await saveSelection();render();return;}
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
setInterval(()=>{if(document.visibilityState==='visible')cloud.flush();},300000);
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
  else if(d.group){const g=d.group;if(pick.includes(g))pick=pick.filter(x=>x!==g);else if(pick.length>=MAX_PICK){toast(`Máximo ${MAX_PICK} grupos. Quita uno para elegir otro.`);return;}else pick=[...pick,g];render();}
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
document.addEventListener('touchstart',()=>{},{passive:true});   // lets :active styles show on iOS
document.addEventListener('input',e=>{if(e.target.id==='weight')fitWeight();if(e.target.id==='search'){search=e.target.value;const start=e.target.selectionStart;render();const input=document.querySelector('#search');input.focus();input.setSelectionRange(start,start);}});
modal.addEventListener('submit',e=>{e.preventDefault();safe(()=>submit(e.target));});

async function checkOffline(){const el=document.querySelector('#offline-status');if(!el)return;let ready=false;for(const name of await caches.keys())if(name.startsWith('gym11-')){const cache=await caches.open(name);if(await cache.match(new URL('./offline-ready',location.href)))ready=true;}if(document.querySelector('#offline-status'))document.querySelector('#offline-status').textContent=ready?'Lista':'Preparando…';}
// A new version must be installed before carrying on: a floating window with one button.
// The workout in progress is saved in IndexedDB and the screen is restored after the reload.
function showUpdate(){
 let box=document.querySelector('#update');
 if(!box){box=document.createElement('dialog');box.id='update';box.className='alert';box.addEventListener('cancel',e=>e.preventDefault());box.addEventListener('close',()=>{if(waitingWorker)setTimeout(()=>box.isConnected&&!box.open&&box.showModal(),0);});document.body.append(box);}
 box.innerHTML=`<span class="alert-icon">${icon('check-circle')}</span><h2>Hemos actualizado Gym11</h2><p>Hay una versión nueva de la app. Actualiza para seguir; tus datos${draft?' y el entreno en curso':''} se conservan.</p><button type="button" class="primary" data-action="update">Actualizar</button>`;
 if(!box.open)box.showModal();
}
async function registerWorker(){
 if(!('serviceWorker'in navigator))return;
 const reg=await navigator.serviceWorker.register('./sw.js');
 const found=()=>{if(reg.waiting&&navigator.serviceWorker.controller){waitingWorker=reg.waiting;showUpdate();}};
 found();
 reg.addEventListener('updatefound',()=>reg.installing?.addEventListener('statechange',found));
 let refreshing=false;navigator.serviceWorker.addEventListener('controllerchange',()=>{if(!refreshing){refreshing=true;location.reload();}});
 navigator.serviceWorker.addEventListener('message',()=>checkOffline());
 // Look for new versions on start and whenever the app comes back to the foreground.
 reg.update().catch(()=>{});
 document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='visible')reg.update().catch(()=>{});});
}
safe(async()=>{await db.init();await load();layout=(await db.get('settings','layout'))?.value||'grid';restSeconds=(await db.get('settings','restSeconds'))?.value||90;trackSets=!!(await db.get('settings','trackSets'))?.value;if(cloud.profile()){restorePlace();render();cloud.flush();}else renderLogin();persisted=(await db.persistence()).persistent;await registerWorker().catch(e=>console.warn('Service worker:',e));});
