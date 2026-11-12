// Profile (name only) and automatic cloud sync through /api.
// The cloud's latest snapshot is the shared version of a profile's data. Each device
// keeps a full local copy so the app works offline (the gym has no signal):
// local changes are uploaded when there is a connection, and newer versions from another
// device (or Safari vs the home-screen app) are downloaded when the app opens.
// If both sides changed, they are merged record by record (newest edit wins, deleted
// workouts stay deleted), so the user is never asked anything.
// Snapshots on the server are append-only, so no version is ever lost.
import * as db from './db.js';
import {exportData} from './transfer.js';

const KEY='gym11-profile', STATE='gym11-cloud', TOMBS='deleted-sessions';
const read=k=>{try{return JSON.parse(localStorage.getItem(k)||'null');}catch{return null;}};
const write=(k,v)=>{try{v==null?localStorage.removeItem(k):localStorage.setItem(k,JSON.stringify(v));}catch{}};
let timer=null, running=null, again=false, paused=false;
const listeners=[], pullListeners=[];
let canReplace=()=>true;

// v2 = "nombre + inicial" profiles; older stored profiles must log in again.
export const profile=()=>{const p=read(KEY);return p?.v===2?p:null;};
// state: {hash, lastAt, pending, error}
//   hash   = digest of this device's data when it was last in step with the cloud
//   lastAt = the cloud snapshot this device last uploaded or downloaded
export const state=()=>read(STATE)||{};
const setState=patch=>{write(STATE,{...state(),...patch});listeners.forEach(f=>f());};
export const onStatus=f=>listeners.push(f);
export const onPull=f=>pullListeners.push(f);
// The app says when it is safe to refresh the screen with downloaded data (no open form).
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

// Record-by-record merge: for each id the most recently edited version wins.
const edited=r=>r?.updatedAt||'';
const byId=(a,b)=>a.id<b.id?-1:a.id>b.id?1:0;
function mergeRecords(a=[],b=[]){const m=new Map(a.map(r=>[r.id,r]));for(const r of b){const o=m.get(r.id);if(!o||edited(r)>edited(o))m.set(r.id,r);}return [...m.values()].sort(byId);}
function merge(local,cloud){
 const tombs={};
 for(const src of [local,cloud])for(const [id,at] of Object.entries(src.settings?.find(s=>s.id===TOMBS)?.value||{}))if(!tombs[id]||at>tombs[id])tombs[id]=at;
 const settings=mergeRecords(local.settings,cloud.settings).filter(s=>s.id!==TOMBS);
 if(Object.keys(tombs).length)settings.push({id:TOMBS,value:tombs,updatedAt:Object.values(tombs).sort().pop()});
 const sessions=mergeRecords(local.sessions,cloud.sessions).filter(s=>!(tombs[s.id]&&tombs[s.id]>=edited(s)));
 return {format:'gym11-pwa',version:1,exportedAt:new Date().toISOString(),exercises:mergeRecords(local.exercises,cloud.exercises),sessions,settings:settings.sort(byId)};
}
function valid(data){if(data?.format!=='gym11-pwa'||data.version!==1||!Array.isArray(data.sessions)||!Array.isArray(data.exercises))throw new Error('La copia de la nube no es válida.');return data;}

async function upload(data){
 const meta=await api(base(),{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(data)});
 setState({hash:await digest(data),lastAt:meta.at,pending:false,error:null});
 return meta;
}
// Writes data to this device as-is (keeps edit dates; leaves a workout in progress alone).
async function replaceLocal(data){
 paused=true;
 try{await db.replaceAll({...data,settings:data.settings||[]});await db.init();}
 finally{paused=false;}
}

// Brings this device and the cloud into step without asking anything.
// Returns 'uploaded' | 'downloaded' | 'merged' | 'same' | 'waiting' | null.
export function sync(){
 if(!profile())return Promise.resolve(null);
 if(running){again=true;return running;}
 running=(async()=>{try{
  const st=state(), latest=await latestBackup();
  const local=await snapshot(), hash=await digest(local);
  // A device that never synced counts as changed only if it has workouts of its own.
  const dirty=st.hash?hash!==st.hash:local.sessions.length>0;
  // KV listings lag a few seconds, so only a strictly later snapshot counts as newer.
  if(latest&&(!st.lastAt||latest.at>st.lastAt)){
   if(!canReplace()){setState({pending:true});return 'waiting';}
   const cloud=valid(await fetchBackup(latest.at));
   const target=dirty?merge(local,cloud):cloud;
   const changed=await digest(target)!==hash;
   if(changed)await replaceLocal(target);
   const now=await snapshot();
   if(dirty&&await digest(now)!==await digest(cloud))await upload(now);
   else setState({hash:await digest(now),lastAt:latest.at,pending:false,error:null});
   if(changed)pullListeners.forEach(f=>f());
   return changed?(dirty?'merged':'downloaded'):'same';
  }
  if(dirty||(!latest&&local.sessions.length)){await upload(local);return 'uploaded';}
  setState({pending:false,error:null});return 'same';
 }catch(e){setState({pending:true,error:e.message});throw e;}
 finally{running=null;if(again){again=false;setTimeout(()=>sync().catch(()=>{}),0);}}})();
 return running;
}
// Called after every saved change; waits a moment to group several edits.
export function schedule(){if(paused||!profile())return;setState({pending:true});clearTimeout(timer);timer=setTimeout(()=>sync().catch(()=>{}),3000);}
// Called when the app opens, comes back to the foreground, regains connection, and every couple of minutes.
export function flush(){if(profile()&&navigator.onLine!==false)sync().catch(()=>{});}

export const listBackups=async()=>(await api(base())).backups;
// Only the newest backup's date: one cheap read per sync instead of listing every backup.
const latestBackup=async()=>(await api(`${base()}/head`)).latest||null;
export async function fetchBackup(at='latest'){return api(`${base()}/${encodeURIComponent(at)}`);}

// Goes back to an older snapshot and makes it the current version everywhere.
export async function restore(at){
 await sync().catch(()=>{});
 const old=valid(await fetchBackup(at));
 await replaceLocal(old);
 await upload(await snapshot());
 return old.sessions.length;
}

// Syncs, then clears this device so the next person starts empty.
export async function logout(){
 await sync();
 paused=true;
 try{await db.wipe();write(KEY,null);write(STATE,null);clearTimeout(timer);await db.init();}
 finally{paused=false;}
}
