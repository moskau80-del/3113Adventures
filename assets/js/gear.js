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


const PACK_PREFIX="3113-v4-pack:";

export function loadTourPackLocal(tourId){
  try{
    const raw=localStorage.getItem(`${PACK_PREFIX}${tourId}`);
    if(!raw) return [];
    const data=JSON.parse(raw);
    return Array.isArray(data)?data:[];
  }catch(error){
    console.error("Packliste konnte nicht geladen werden:",error);
    return [];
  }
}

export function saveTourPackLocal(tourId,items){
  localStorage.setItem(`${PACK_PREFIX}${tourId}`,JSON.stringify(items));
  return items;
}

export function toggleGearInTourPackLocal(tourId,gearId){
  const pack=loadTourPackLocal(tourId);
  const index=pack.findIndex(item=>item.gearId===gearId);

  if(index>=0) pack.splice(index,1);
  else pack.push({gearId,quantity:1,worn:false});

  return saveTourPackLocal(tourId,pack);
}

export function updateTourPackItemLocal(tourId,gearId,changes){
  const pack=loadTourPackLocal(tourId);
  const index=pack.findIndex(item=>item.gearId===gearId);
  if(index<0) return pack;

  pack[index]={...pack[index],...changes};
  return saveTourPackLocal(tourId,pack);
}
