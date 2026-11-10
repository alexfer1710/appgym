const DB_NAME='gym11', VERSION=1;
let handle;
export async function openDB(){
 if(handle)return handle;
 handle=await new Promise((resolve,reject)=>{const req=indexedDB.open(DB_NAME,VERSION);req.onupgradeneeded=()=>{const d=req.result;for(const name of ['exercises','sessions','settings','drafts']){const s=d.createObjectStore(name,{keyPath:'id'});if(name==='sessions')s.createIndex('date','date');if(name==='exercises')s.createIndex('group','group');}};req.onsuccess=()=>{req.result.onversionchange=()=>{req.result.close();handle=null;};resolve(req.result);};req.onerror=()=>reject(req.error);req.onblocked=()=>reject(new Error('Cierra las otras ventanas de Gym11 para actualizar.'));});return handle;
}
// Listeners are told which stores changed after each committed write (used for cloud backups).
const changeListeners=[];
export const onChange=f=>changeListeners.push(f);
export async function transaction(stores,callback){const db=await openDB();return new Promise((resolve,reject)=>{const tx=db.transaction(stores,'readwrite');try{callback(tx);}catch(e){tx.abort();reject(e);}tx.oncomplete=()=>{resolve();changeListeners.forEach(f=>{try{f(stores);}catch{}});};tx.onerror=()=>reject(tx.error);tx.onabort=()=>reject(tx.error||new Error('No se han podido guardar los datos.'));});}
export async function all(store){const db=await openDB();return new Promise((resolve,reject)=>{const req=db.transaction(store).objectStore(store).getAll();req.onsuccess=()=>resolve(req.result);req.onerror=()=>reject(req.error);});}
export async function get(store,id){const db=await openDB();return new Promise((resolve,reject)=>{const req=db.transaction(store).objectStore(store).get(id);req.onsuccess=()=>resolve(req.result);req.onerror=()=>reject(req.error);});}
export async function put(store,record){return transaction([store],tx=>tx.objectStore(store).put({...record,updatedAt:new Date().toISOString()}));}
export async function remove(store,id){return transaction([store],tx=>tx.objectStore(store).delete(id));}
export async function init(){await openDB();if(!await get('settings','initialized')){const r=await fetch('./data/catalog.json');if(!r.ok)throw new Error('No se pudo cargar el catálogo inicial.');const catalog=await r.json();await transaction(['exercises','settings'],tx=>{catalog.forEach(e=>tx.objectStore('exercises').put(e));tx.objectStore('settings').put({id:'initialized',value:true});});}}
export async function persistence(){try{return {persistent:await navigator.storage?.persist?.()||false,estimate:await navigator.storage?.estimate?.()};}catch{return {persistent:false};}}
export async function wipe(){return transaction(['exercises','sessions','settings','drafts'],tx=>{for(const n of ['exercises','sessions','settings','drafts'])tx.objectStore(n).clear();});}
