import {test} from 'node:test';import assert from 'node:assert/strict';import {readFile} from 'node:fs/promises';import {webcrypto} from 'node:crypto';
import {suggestWeight,recentExercises,unilateralMode,weightAdvice} from '../js/model.js';import {convertSwift,validateSessions,historyToSessions} from '../js/transfer.js';
globalThis.crypto??=webcrypto;
const catalog=JSON.parse(await readFile(new URL('../data/catalog.json',import.meta.url)));
const ex=name=>catalog.find(e=>e.name===name);const entry=(name,weight,more={})=>({id:webcrypto.randomUUID(),exercise:ex(name),weight,reps:8,sets:4,seconds:0,grip:null,...more});const session=(date,entries)=>({id:webcrypto.randomUUID(),date,groups:[],entries});
test('importa notas con carga decimal y series sin depender de archivos personales',()=>{const raw={sessions:[{date:'2026-10-27',sourceTitle:'Entreno de prueba',groups:['Bíceps'],otherNotes:[],entries:[{name:'Predicador en máquina',weight:11.25,reps:8,sets:4,unilateral:false,sourceNote:'Ejemplo de importación'}]}]};const history=historyToSessions(raw,catalog);assert.equal(history[0].entries[0].weight,11.25);assert.equal(history[0].entries[0].sets,4);});
test('jalón neutro 55 kg; otro agarre no comparte referencia',()=>{const s=[session('2026-10-26',[entry('Jalón',55,{grip:'Neutro'})])];assert.equal(suggestWeight(s,ex('Jalón'),'Neutro'),55);assert.equal(suggestWeight(s,ex('Jalón'),'Abierto'),0);});
test('la sugerencia Swift reutiliza la última carga positiva sin aumentar por esfuerzo',()=>{const s=[session('2026-10-28',[entry('Curl martillo con mancuernas',15,{feeling:'Fácil'})]),session('2026-10-20',[entry('Curl martillo con mancuernas',10)])];assert.equal(suggestWeight(s,ex('Curl martillo con mancuernas')),15);s[0].entries[0].weight=0;assert.equal(suggestWeight(s,ex('Curl martillo con mancuernas')),10);});
test('tres poleas con cargas independientes; registros sin estación son sala1',()=>{const s=[session('2026-10-26',[entry('Extensión de tríceps',60,{grip:'Pez'}),entry('Extensión de tríceps',35,{grip:'Pez',cableStation:'sala2'})])];assert.equal(suggestWeight(s,ex('Extensión de tríceps'),'Pez','sala1'),60);assert.equal(suggestWeight(s,ex('Extensión de tríceps'),'Pez','sala2'),35);assert.equal(suggestWeight(s,ex('Extensión de tríceps'),'Pez','sala3'),0);});
test('sin fatiga previa: la referencia es la última carga positiva aunque haya calentamiento',()=>{const s=[session('2026-10-25T12:00:00',[entry('Press inclinado',25)]),session('2026-10-26T10:00:00',[entry('Press banca',40,{isWarmup:true}),entry('Press inclinado',10)])];assert.equal(suggestWeight(s,ex('Press inclinado')),10);assert.equal(suggestWeight(s,ex('Press banca')),40);});
test('perfiles: el contractor no admite unilateral, la mancuerna sí, el strap siempre',()=>{assert.equal(unilateralMode(ex('Contractor de pecho normal')),'never');assert.equal(unilateralMode(ex('Press banca')),'never');assert.equal(unilateralMode(ex('Curl con mancuernas')),'optional');assert.equal(unilateralMode(ex('Extensión unilateral con strap')),'always');assert.equal(unilateralMode({id:'propio',name:'Mío'}),'optional');});
test('importación Swift conserva decimales, fecha de referencia Apple y al fallo',()=>{const s=convertSwift([{id:'ABC',date:0,groups:['Tríceps'],entries:[entry('Fondos en paralelas',0,{reps:0,toFailure:true,sets:3})]}],catalog);assert.equal(s[0].date,'2001-01-01T00:00:00.000Z');assert.equal(s[0].entries[0].toFailure,true);assert.equal(validateSessions(s).length,1);});
test('IDs antiguos de curl martillo no mezclan el curl normal',()=>{const e=entry('Curl con mancuernas',15,{grip:'Martillo'});assert.equal(suggestWeight([session('2026-10-27',[e])],ex('Curl con mancuernas')),0);assert.equal(suggestWeight([session('2026-10-27',[e])],ex('Curl martillo con mancuernas')),15);});
test('recientes usa primero el último ejercicio de la sesión y no depende del agarre',()=>{const a=ex('Jalón'),b=ex('Remo');assert.deepEqual(recentExercises([a,b],[session('2026-10-26',[entry('Jalón',55,{grip:'Neutro'}),entry('Remo',50,{grip:'Abierto'})])]).map(e=>e.name),['Remo','Jalón']);});

const plan=(more={})=>({date:'2026-11-12T18:00:00',grip:null,station:'sala1',unilateral:false,reps:10,sets:4,order:1,toFailure:false,...more});
const done=(feeling,more={})=>entry('Contractor de pecho normal',55,{feeling,reps:10,sets:4,order:1,...more});
const pec=ex('Contractor de pecho normal');
test('consejo: fácil con lo mismo sube, demasiado baja, perfecto mantiene',()=>{
 assert.equal(weightAdvice([session('2026-11-05T18:00:00',[done('Fácil')])],pec,plan()).verdict,'up');
 assert.equal(weightAdvice([session('2026-11-05T18:00:00',[done('Demasiado')])],pec,plan()).verdict,'down');
 assert.equal(weightAdvice([session('2026-11-05T18:00:00',[done('Perfecto')])],pec,plan()).verdict,'keep');
 assert.equal(weightAdvice([],pec,plan()),null);});
test('consejo: fácil pero hoy dos puestos más tarde se queda en mantén, con el motivo',()=>{
 const a=weightAdvice([session('2026-11-05T18:00:00',[done('Fácil')])],pec,plan({order:3}));
 assert.equal(a.verdict,'keep');assert.equal(a.score,0);assert.match(a.reason,/fácil, pero hoy va 3\.º en vez de 1\.º/);});
test('consejo: repes, antigüedad, tendencia y variantes',()=>{
 assert.equal(weightAdvice([session('2026-11-05T18:00:00',[done('Perfecto')])],pec,plan({reps:6})).verdict,'up');
 assert.equal(weightAdvice([session('2026-11-05T18:00:00',[done('Perfecto')])],pec,plan({reps:14})).verdict,'down');
 assert.equal(weightAdvice([session('2026-10-01T18:00:00',[done('Fácil')])],pec,plan()).verdict,'keep');
 assert.equal(weightAdvice([session('2026-06-01T18:00:00',[done('Fácil')])],pec,plan()).verdict,'none');
 assert.equal(weightAdvice([session('2026-10-29T18:00:00',[done('Perfecto')]),session('2026-11-05T18:00:00',[done('Perfecto')])],pec,plan()).verdict,'keep');
 assert.equal(weightAdvice([session('2026-10-29T18:00:00',[done('Fácil')]),session('2026-11-05T18:00:00',[done('Fácil')])],pec,plan({order:2})).verdict,'up');
 assert.equal(weightAdvice([session('2026-11-05T18:00:00',[done('Fácil',{unilateral:true})])],pec,plan()),null);});
