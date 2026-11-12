// Profile (name only) and cloud sync through /api.
// The cloud's latest snapshot is the shared version of a profile's data. Each device
// keeps a full local copy so the app works offline (the gym has no signal):
// changes are uploaded when there is a connection, and newer versions from another
// device (or Safari vs the home-screen app) are downloaded when the app opens.
// Snapshots on the server are append-only, so no version is ever lost.
import * as db from './db.js';
import {exportData,prepareImport,importData} from './transfer.js';

const KEY='gym11-profile', STATE='gym11-cloud';
const read=k=>{try{return JSON.parse(localStorage.getItem(k)||'null');}catch{return null;}};
const write=(k,v)=>{try{v==null?localStorage.removeItem(k):localStorage.setItem(k,JSON.stringify(v));}catch{}};
let timer=null, running=null, again=false, paused=false;
const listeners=[], pullListeners=[], conflictListeners=[];
let canReplace=()=>true;

// v2 = "nombre + inicial" profiles; older stored profiles must log in again.
export const profile=()=>{const p=read(KEY);return p?.v===2?p:null;};
// state: {hash, lastAt, pending, error, syncing, conflict}
//   hash   = digest of this device's data as it was when last in step with the cloud
//   lastAt = the cloud snapshot this device last uploaded or downloaded
export const state=()=>read(STATE)||{};
const setState=patch=>{write(STATE,{...state(),...patch});listeners.forEach(f=>f());};
export const onStatus=f=>listeners.push(f);
export const onPull=f=>pullListeners.push(f);
export const onConflict=f=>conflictListeners.push(f);
// The app says when it is safe to replace local data (no workout in progress, no open form).
export const setGuard=f=>{canReplace=f;};

async function api(path,options={}){
 let r;
 try{r=await fetch('./api/'+path,{cache:'no-store',...options});}
 catch{throw new Error('Sin conexión. Se sincronizará cuando vuelva internet.');}
 const body=r.headers.get('content-type')?.includes('json')?await r.json().catch(()=>null):null;
 if(!r.ok)throw new Error(body?.error||`Error ${r.status} del servidor.`);
 return body;
}
const base=()=>`profiles/${encodeURIComponent(profile().id)}/backups`;

export async function login(name){
 const res=await api('login',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({name})});
 write(KEY,{...res.profile,v:2});write(STATE,{});
 return res;
}

async function snapshot(){const data=await exportData();delete data.drafts;return data;}
async function digest(data){const {exportedAt,drafts,...rest}=data;const buf=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(JSON.stringify(rest)));return [...new Uint8Array(buf)].map(b=>b.toString(16).padStart(2,'0')).join('');}
const hasDraft=async()=>(await db.all('drafts')).length>0;

export const listBackups=async()=>(await api(base())).backups;
export async function fetchBackup(at='latest'){return api(`${base()}/${encodeURIComponent(at)}`);}

async function upload(data){
 const meta=await api(base(),{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(data)});
 setState({hash:await digest(data),lastAt:meta.at,pending:false,error:null,conflict:null});
 return meta;
}
// Replaces everything on this device with a cloud snapshot.
async function apply(raw,at){
 const data=await prepareImport(raw);
 paused=true;
 try{
  await db.wipe();
  await importData(data,{overwrite:true});
  await db.put('settings',{id:'initialized',value:true});
  await db.init();
 }finally{paused=false;}
 setState({hash:await digest(await snapshot()),lastAt:at,pending:false,error:null,conflict:null});
 return data.sessions.length;
}

// Brings this device and the cloud into step. Returns what happened:
// 'uploaded' | 'downloaded' | 'same' | 'conflict' | 'waiting' (can't replace data now) | null.
export function sync({force=false}={}){
 if(!profile())return Promise.resolve(null);
 if(running){again=true;return running;}
 setState({syncing:true});
 running=(async()=>{try{
  const st=state(), latest=(await listBackups())[0]||null;
  const data=await snapshot(), hash=await digest(data);
  const dirty=hash!==st.hash;
  // KV listings lag a few seconds, so only a strictly later snapshot counts as newer.
  const cloudNewer=latest&&(!st.lastAt||latest.at>st.lastAt);
  if(cloudNewer){
   const raw=await fetchBackup(latest.at);
   if(await digest(raw)===hash){setState({hash,lastAt:latest.at,pending:false,error:null,conflict:null});return 'same';}
   if(dirty&&data.sessions.length){setState({conflict:{at:latest.at,sessions:latest.sessions,local:data.sessions.length},pending:true,error:null});conflictListeners.forEach(f=>f(state().conflict));return 'conflict';}
   if(await hasDraft()||!canReplace()){setState({pending:true});return 'waiting';}
   const n=await apply(raw,latest.at);pullListeners.forEach(f=>f(n));return 'downloaded';
  }
  if(!latest&&!data.sessions.length){setState({hash,pending:false,error:null});return 'same';}
  if(dirty||force){await upload(data);return 'uploaded';}
  setState({pending:false,error:null});return 'same';
 }catch(e){setState({pending:true,error:e.message});throw e;}
 finally{running=null;setState({syncing:false});if(again){again=false;setTimeout(()=>sync().catch(()=>{}),0);}}})();
 return running;
}
// Called after every saved change; waits a moment to group several edits.
export function schedule(){if(paused||!profile())return;setState({pending:true});clearTimeout(timer);timer=setTimeout(()=>sync().catch(()=>{}),3000);}
// Called when the app opens, comes back to the foreground or regains connection.
export function flush(){if(profile()&&navigator.onLine!==false)sync().catch(()=>{});}

// Conflict resolution. Either way the other version stays in the cloud.
export async function keepLocal(){const data=await snapshot();await upload(data);}
export async function useCloud(){
 const at=state().conflict?.at||(await listBackups())[0]?.at;
 if(!at)throw new Error('Todavía no hay copias en la nube.');
 const raw=await fetchBackup(at), local=await snapshot();
 if(local.sessions.length)await api(base(),{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(local)}); // keep this device's version
 const n=await apply(raw,null);
 await upload(await snapshot()); // the cloud version becomes the latest again
 return n;
}

// Restores an older snapshot and makes it the current version everywhere.
export async function restore(at){
 const local=await snapshot();
 if(local.sessions.length&&await digest(local)!==state().hash)await upload(local);
 const n=await apply(await fetchBackup(at),null);
 await upload(await snapshot());
 return n;
}

// Syncs, then clears this device so the next person starts empty.
export async function logout(){
 const r=await sync({force:!state().lastAt});
 if(r==='conflict')throw new Error('Hay cambios en otro dispositivo. Elige antes qué versión quieres conservar.');
 paused=true;
 try{await db.wipe();write(KEY,null);write(STATE,null);clearTimeout(timer);await db.init();}
 finally{paused=false;}
}
