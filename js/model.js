export const groups = ['Pecho','Espalda','Hombro','Pierna','Tríceps','Bíceps','Abdomen','Antebrazo','Glúteo'];
export function identity(name,grip,note) {
 if(name==='Press francés'&&grip==='Barra') return !note||/\bz\b/i.test(note)?'Press francés con barra Z':'Press francés sin equipo confirmado';
 const aliases={'Jalón al pecho':'Jalón','Crunch':'Crunch polea','Remo sentado en polea baja':'Remo en el suelo','Remo en el suelo con polea alta':'Remo en el suelo','Remo abierto al pecho':'Remo','Aductores en máquina':'Aductores en máquina (Cerrar)','Sentadilla hack':'Hacka','Curl inverso con mancuerna':'Curl de muñeca con mancuerna','Curl inverso en polea':'Curl de muñeca con polea'};
 if(grip==='Martillo') return {'Curl con mancuernas':'Curl martillo con mancuernas','Curl en polea':'Curl martillo en polea','Curl Bayesian en banco inclinado':'Curl Bayesian martillo en banco inclinado'}[name]||name;
 return aliases[name]||name;
}
export function normalizedGrip(name,grip) {
 if(name==='Press francés'&&['Barra','Mancuerna'].includes(grip)) return null;
 if(name==='Remo abierto al pecho'&&!grip) return 'Abierto';
 if(['Curl con mancuernas','Curl en polea','Curl Bayesian en banco inclinado'].includes(name)&&['Normal','Martillo'].includes(grip)) return null;
 return grip||null;
}
export function matches(entry,exercise,grip) {
 // Names remain the Swift compatibility key; stable IDs also survive catalog renames.
 const sameID=entry.exercise.id===exercise.id&&identity(entry.exercise.name,entry.grip,entry.sourceNote)===entry.exercise.name;
 return (sameID||identity(entry.exercise.name,entry.grip,entry.sourceNote)===identity(exercise.name,grip))&&normalizedGrip(entry.exercise.name,entry.grip)===normalizedGrip(exercise.name,grip);
}
export function dayKey(date) { const d=new Date(date); return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`; }
export function antecedents(sessions,exercise,grip=null,station='sala1') {
 return [...sessions].sort((a,b)=>new Date(b.date)-new Date(a.date)).flatMap(s=>s.entries.map(e=>({...e,date:s.date}))).filter(e=>matches(e,exercise,grip)&&(!exercise.usesCable||(e.cableStation||'sala1')===station));
}
export function suggestWeight(sessions,exercise,grip=null,station='sala1') {
 return antecedents(sessions,exercise,grip,station).find(e=>e.weight>0)?.weight||0;
}
// Exercise profiles: whether "unilateral" makes sense for each catalog exercise.
// 'never'  = both sides at once by design (barbells, Smith, pec deck, bodyweight…): no switch.
// 'always' = one side by design: recorded as unilateral, no switch.
// Anything else (dumbbells, single-handle cables, iso-lateral machines, your own exercises) is optional.
const catalogId=n=>`00000000-0000-0000-0000-${String(n).padStart(12,'0')}`;
const UNILATERAL_NEVER=new Set([1,2,4,12,13,14,16,17,18,25,26,32,33,35,40,41,43,44,45,47,50,51,52,54,55,56,57,61,62,64,65,66,68,70,71,74,75,76,77,78,83,85,87,88].map(catalogId));
const UNILATERAL_ALWAYS=new Set([15,29,53].map(catalogId));
export function unilateralMode(exercise){if(!exercise)return 'optional';if(UNILATERAL_ALWAYS.has(exercise.id))return 'always';if(UNILATERAL_NEVER.has(exercise.id))return 'never';return 'optional';}
export function recentExercises(exercises,sessions) {
 const key=(e,grip,note)=>`${e.group}|${identity(e.name,grip,note)}`.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase();
 const ranks=new Map();
 for(const s of [...sessions].sort((a,b)=>new Date(b.date)-new Date(a.date)))for(const e of [...s.entries].reverse()){const k=key(e.exercise,e.grip,e.sourceNote);if(!ranks.has(k))ranks.set(k,ranks.size);}
 return [...exercises].sort((a,b)=>(ranks.get(key(a))??Infinity)-(ranks.get(key(b))??Infinity));
}
export const uid=()=>crypto.randomUUID();
export const num=n=>new Intl.NumberFormat('es-ES',{maximumFractionDigits:2}).format(n);
export const repsText=e=>e.toFailure?'al fallo':e.reps?`${e.reps} reps`:'— reps';

// Weight advice for the exercise about to be done: "up", "keep" or "down" (never how many
// kilos: each machine loads differently). It compares today's plan with the last time the
// same variant (exercise, grip, pulley, one side or both) was done, adding up points:
//   how it felt: easy +2, perfect 0, too much −2
//   repetitions: ±0,5 per rep (fewer today adds), at most ±2; ignored if either was to failure
//   position in the group: −1 per place later (at most −2), +0,5 per place earlier (at most +1)
//   sets: two or more extra −1, two or more fewer +0,5
//   age of the reference: 3–6 weeks −1, more than 6 weeks −2; over 90 days no advice
//   trend of the last two times: twice perfect with the same weight +1, twice easy +1, twice too much −1
// A total of +1,5 or more means up, −1,5 or less means down, anything else keep.
const FEEL={'Fácil':2,'Perfecto':0,'Justo':0,'Demasiado':-2};
export function weightAdvice(sessions,exercise,plan){
 const today=plan.date?new Date(plan.date):new Date();
 const refs=antecedents(sessions,exercise,plan.grip,plan.station).filter(e=>e.weight>0&&!!e.unilateral===!!plan.unilateral&&new Date(e.date)<=today);
 const ref=refs[0];if(!ref)return null;
 const days=Math.round((new Date(dayKey(today))-new Date(dayKey(ref.date)))/86400000);
 if(days>90)return {verdict:'none',score:0,ref,factors:[],reason:`Hace ${Math.round(days/30)} meses que no lo haces: tantea el peso.`};
 const factors=[],add=(points,text)=>{if(points)factors.push({points,text});};
 const feel=ref.feeling==='Justo'?'Perfecto':ref.feeling;
 if(feel in FEEL)add(FEEL[feel],`la última vez fue ${feel==='Demasiado'?'demasiado':feel.toLowerCase()}`);
 if(!ref.toFailure&&!plan.toFailure&&ref.reps>0&&plan.reps>0){const d=plan.reps-ref.reps;add(Math.max(-2,Math.min(2,-d*.5)),d>0?`hoy haces ${d} ${d===1?'repe':'repes'} más`:`hoy haces ${-d} ${d===-1?'repe':'repes'} menos`);}
 if(ref.order>0&&plan.order>0){const d=plan.order-ref.order;add(d>0?Math.max(-2,-d):Math.min(1,-d*.5),d>0?`hoy va ${plan.order}.º en vez de ${ref.order}.º`:`hoy va ${plan.order}.º en vez de ${ref.order}.º`);}
 if(ref.sets>0&&plan.sets>0){const d=plan.sets-ref.sets;if(d>=2)add(-1,`hoy haces ${d} series más`);else if(d<=-2)add(.5,`hoy haces ${-d} series menos`);}
 if(days>42)add(-2,`hace ${Math.round(days/7)} semanas`);else if(days>=21)add(-1,`hace ${Math.round(days/7)} semanas`);
 const prev=refs[1],prevFeel=prev&&(prev.feeling==='Justo'?'Perfecto':prev.feeling);
 if(prev&&prevFeel===feel){if(feel==='Perfecto'&&prev.weight===ref.weight)add(1,'dos veces seguidas perfecto con este peso');else if(feel==='Fácil')add(1,'dos veces seguidas fácil');else if(feel==='Demasiado')add(-1,'dos veces seguidas demasiado');}
 const score=factors.reduce((n,f)=>n+f.points,0),verdict=score>=1.5?'up':score<=-1.5?'down':'keep';
 // Reason: the strongest factor, plus the strongest one pulling the other way (or the next one).
 const sorted=[...factors].sort((a,b)=>Math.abs(b.points)-Math.abs(a.points)),first=sorted[0];
 const second=first&&(sorted.find(f=>Math.sign(f.points)!==Math.sign(first.points))||sorted[1]);
 const tail=second&&(first.text.startsWith('hoy ')&&second.text.startsWith('hoy ')?second.text.slice(4):second.text);
 let reason=first?first.text+(second?(Math.sign(second.points)!==Math.sign(first.points)?', pero ':' y ')+tail:''):feel==='Perfecto'?'la última vez fue perfecto con lo mismo':'sin valoración la última vez';
 reason=reason.charAt(0).toUpperCase()+reason.slice(1)+'.';
 return {verdict,score,ref,factors,reason};
}
