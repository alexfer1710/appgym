// Profile (name only) and automatic cloud backups through /api.
// The device stays the source of truth and works offline; backups are uploaded
// when there is a connection and kept as append-only snapshots on the server.
import * as db from './db.js';
import {exportData,prepareImport,importData} from './transfer.js';

const KEY='gym11-profile', STATE='gym11-cloud';
const read=k=>{try{return JSON.parse(localStorage.getItem(k)||'null');}catch{return null;}};
const write=(k,v)=>{try{v==null?localStorage.removeItem(k):localStorage.setItem(k,JSON.stringify(v));}catch{}};
let timer=null, running=null, listeners=[], paused=false;

// v2 = "nombre + inicial" profiles; older stored profiles must log in again.
export const profile=()=>{const p=read(KEY);return p?.v===2?p:null;};
export const state=()=>read(STATE)||{};
const setState=patch=>{write(STATE,{...state(),...patch});listeners.forEach(f=>f());};
export const onStatus=f=>listeners.push(f);

async function api(path,options={}){
 let r;
 try{r=await fetch('./api/'+path,{cache:'no-store',...options});}
 catch{throw new Error('Sin conexión. Inténtalo cuando tengas internet.');}
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
async function digest(data){const {exportedAt,...rest}=data;const buf=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(JSON.stringify(rest)));return [...new Uint8Array(buf)].map(b=>b.toString(16).padStart(2,'0')).join('');}

// Uploads a snapshot unless identical to the last one uploaded (or force).
export async function backupNow({force=false}={}){
 if(!profile())return null;
 if(running)return running;
 running=(async()=>{try{
  const data=await snapshot(), hash=await digest(data);
  if(!force&&hash===state().hash){setState({pending:false});return state();}
  const meta=await api(base(),{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(data)});
  setState({hash,lastAt:meta.at,pending:false,error:null});return state();
 }catch(e){setState({pending:true,error:e.message});throw e;}finally{running=null;}})();
 return running;
}
// Called after every saved change; waits a moment to group several edits.
export function schedule(){if(paused||!profile())return;setState({pending:true});clearTimeout(timer);timer=setTimeout(()=>backupNow().catch(()=>{}),3000);}
export function flush(){if(profile()&&state().pending&&navigator.onLine!==false)backupNow().catch(()=>{});}

export const listBackups=async()=>(await api(base())).backups;
export async function fetchBackup(at='latest'){return api(`${base()}/${encodeURIComponent(at)}`);}

// Replaces everything on this device with a cloud snapshot.
export async function restore(at='latest'){
 const raw=await fetchBackup(at), data=await prepareImport(raw);
 paused=true;
 try{
  await db.wipe();
  await importData(data,{overwrite:true});
  await db.put('settings',{id:'initialized',value:true});
  await db.init();
 }finally{paused=false;}
 const fresh=await snapshot();setState({hash:await digest(fresh),pending:false});
 return data.sessions.length;
}

// Backs up, then clears this device so the next person starts empty.
export async function logout(){
 await backupNow({force:!state().lastAt});
 paused=true;
 try{await db.wipe();write(KEY,null);write(STATE,null);clearTimeout(timer);await db.init();}
 finally{paused=false;}
}
