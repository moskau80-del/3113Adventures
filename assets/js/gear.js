const GEAR_KEY="3113-v4-gear";

export function loadGearLocal(){
  try{
    const raw=localStorage.getItem(GEAR_KEY);
    if(!raw) return [];
    const data=JSON.parse(raw);
    return Array.isArray(data)?data:[];
  }catch(error){
    console.error("Ausrüstung konnte nicht geladen werden:",error);
    return [];
  }
}

export function saveGearLocal(items){
  localStorage.setItem(GEAR_KEY,JSON.stringify(items));
  return items;
}

export function upsertGearLocal(item){
  const items=loadGearLocal();
  const index=items.findIndex(entry=>entry.id===item.id);
  if(index>=0) items[index]=item;
  else items.push(item);
  return saveGearLocal(items);
}

export function deleteGearLocal(id){
  return saveGearLocal(loadGearLocal().filter(item=>item.id!==id));
}
