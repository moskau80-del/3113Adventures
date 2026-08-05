const DB_NAME="3113AdventuresDB";
const DB_VERSION=1;
const SETTINGS_STORE="settings";

export function openDatabase(){
  return new Promise((resolve,reject)=>{
    const request=indexedDB.open(DB_NAME,DB_VERSION);
    request.onupgradeneeded=()=>{
      const db=request.result;
      if(!db.objectStoreNames.contains(SETTINGS_STORE)){
        db.createObjectStore(SETTINGS_STORE,{keyPath:"key"});
      }
    };
    request.onsuccess=()=>resolve(request.result);
    request.onerror=()=>reject(request.error);
  });
}

export async function getSetting(key,fallback=null){
  const db=await openDatabase();
  return new Promise((resolve,reject)=>{
    const tx=db.transaction(SETTINGS_STORE,"readonly");
    const request=tx.objectStore(SETTINGS_STORE).get(key);
    request.onsuccess=()=>resolve(request.result?.value ?? fallback);
    request.onerror=()=>reject(request.error);
  });
}

export async function setSetting(key,value){
  const db=await openDatabase();
  return new Promise((resolve,reject)=>{
    const tx=db.transaction(SETTINGS_STORE,"readwrite");
    tx.objectStore(SETTINGS_STORE).put({key,value});
    tx.oncomplete=()=>resolve();
    tx.onerror=()=>reject(tx.error);
  });
}
