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
export function excludedIDs(sessions) {
 const excluded=new Set(), fatigued=new Map();
 for(const session of [...sessions].sort((a,b)=>new Date(a.date)-new Date(b.date))) {
  const day=dayKey(session.date); if(!fatigued.has(day)) fatigued.set(day,new Set());
  for(const e of session.entries) { if(fatigued.get(day).has(e.exercise.group)) excluded.add(e.id); if(e.isWarmup) fatigued.get(day).add(e.exercise.group); }
 } return excluded;
}
export function antecedents(sessions,exercise,grip=null,station='sala1') {
 return [...sessions].sort((a,b)=>new Date(b.date)-new Date(a.date)).flatMap(s=>s.entries.map(e=>({...e,date:s.date}))).filter(e=>matches(e,exercise,grip)&&(!exercise.usesCable||(e.cableStation||'sala1')===station));
}
export function suggestWeight(sessions,exercise,grip=null,station='sala1') {
 const excluded=excludedIDs(sessions);
 return antecedents(sessions,exercise,grip,station).find(e=>!excluded.has(e.id)&&e.weight>0)?.weight||0;
}
export function canWarmup(sessions,draft) {return !draft.entries.length&&!sessions.some(s=>dayKey(s.date)===dayKey(draft.date)&&s.entries.length);}
export function recentExercises(exercises,sessions) {
 const key=(e,grip,note)=>`${e.group}|${identity(e.name,grip,note)}`.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase();
 const ranks=new Map();
 for(const s of [...sessions].sort((a,b)=>new Date(b.date)-new Date(a.date)))for(const e of [...s.entries].reverse()){const k=key(e.exercise,e.grip,e.sourceNote);if(!ranks.has(k))ranks.set(k,ranks.size);}
 return [...exercises].sort((a,b)=>(ranks.get(key(a))??Infinity)-(ranks.get(key(b))??Infinity));
}
export const uid=()=>crypto.randomUUID();
export const num=n=>new Intl.NumberFormat('es-ES',{maximumFractionDigits:2}).format(n);
export const repsText=e=>e.toFailure?'al fallo':e.reps?`${e.reps} reps`:'— reps';
