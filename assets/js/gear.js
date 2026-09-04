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


const PACK_NAMES_PREFIX="3113-v4-pack-names:";

export function loadPackNamesLocal(tourId){
  try{
    const raw=localStorage.getItem(`${PACK_NAMES_PREFIX}${tourId}`);
    if(!raw) return {person1:"Person 1",person2:"Person 2"};
    return {...{person1:"Person 1",person2:"Person 2"},...JSON.parse(raw)};
  }catch{
    return {person1:"Person 1",person2:"Person 2"};
  }
}

export function savePackNamesLocal(tourId,names){
  localStorage.setItem(`${PACK_NAMES_PREFIX}${tourId}`,JSON.stringify(names));
  return names;
}

export function loadTourPersonPackLocal(tourId,personKey){
  try{
    const raw=localStorage.getItem(`${PACK_PREFIX}${tourId}:${personKey}`);
    if(raw) return JSON.parse(raw);
    if(personKey==="person1"){
      const legacy=localStorage.getItem(`${PACK_PREFIX}${tourId}`);
      if(legacy) return JSON.parse(legacy);
    }
    return [];
  }catch{
    return [];
  }
}

export function saveTourPersonPackLocal(tourId,personKey,items){
  localStorage.setItem(`${PACK_PREFIX}${tourId}:${personKey}`,JSON.stringify(items));
  return items;
}

export function toggleGearInPersonPackLocal(tourId,personKey,gearId){
  const pack=loadTourPersonPackLocal(tourId,personKey);
  const index=pack.findIndex(item=>item.gearId===gearId);
  if(index>=0) pack.splice(index,1);
  else pack.push({gearId,quantity:1,worn:false});
  return saveTourPersonPackLocal(tourId,personKey,pack);
}

export function updatePersonPackItemLocal(tourId,personKey,gearId,changes){
  const pack=loadTourPersonPackLocal(tourId,personKey);
  const index=pack.findIndex(item=>item.gearId===gearId);
  if(index<0) return pack;
  pack[index]={...pack[index],...changes};
  return saveTourPersonPackLocal(tourId,personKey,pack);
}


export function packedQuantityAcrossPersons(tourId,gearId){
  const p1=loadTourPersonPackLocal(tourId,"person1")
    .find(item=>item.gearId===gearId);
  const p2=loadTourPersonPackLocal(tourId,"person2")
    .find(item=>item.gearId===gearId);

  return Number(p1?.quantity||0)+Number(p2?.quantity||0);
}

export function availableQuantityForPerson(tourId,personKey,gearId,stock){
  const own=loadTourPersonPackLocal(tourId,personKey)
    .find(item=>item.gearId===gearId);
  const otherKey=personKey==="person1"?"person2":"person1";
  const other=loadTourPersonPackLocal(tourId,otherKey)
    .find(item=>item.gearId===gearId);

  const maxStock=Math.max(0,Number(stock||0));
  const usedByOther=Number(other?.quantity||0);
  return Math.max(0,maxStock-usedByOther);
}


const SHOE_PERSON_PREFIX="3113-v4-shoe-person:";

export function loadTourShoePersonLocal(tourId,personKey){
  try{
    const raw=localStorage.getItem(`${SHOE_PERSON_PREFIX}${tourId}:${personKey}`);
    if(!raw) return {gearId:"",currentKm:0,intervalKm:700};
    return {...{gearId:"",currentKm:0,intervalKm:700},...JSON.parse(raw)};
  }catch{
    return {gearId:"",currentKm:0,intervalKm:700};
  }
}

export function saveTourShoePersonLocal(tourId,personKey,data){
  const value={
    gearId:data.gearId||"",
    currentKm:Math.max(0,Number(data.currentKm||0)),
    intervalKm:Math.max(100,Number(data.intervalKm||700))
  };
  localStorage.setItem(`${SHOE_PERSON_PREFIX}${tourId}:${personKey}`,JSON.stringify(value));
  return value;
}
