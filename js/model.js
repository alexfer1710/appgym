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
