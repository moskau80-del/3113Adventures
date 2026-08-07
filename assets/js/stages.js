const STORAGE_PREFIX = "3113-v4-stages:";

function haversine(a,b){
  const R=6371;
  const toRad=(value)=>value*Math.PI/180;
  const dLat=toRad(b.lat-a.lat);
  const dLon=toRad(b.lng-a.lng);
  const x=
    Math.sin(dLat/2)**2+
    Math.cos(toRad(a.lat))*Math.cos(toRad(b.lat))*Math.sin(dLon/2)**2;
  return 2*R*Math.asin(Math.sqrt(x));
}

function interpolate(a,b,fraction){
  return {
    lat:a.lat+(b.lat-a.lat)*fraction,
    lng:a.lng+(b.lng-a.lng)*fraction,
    elevation:
      Number(a.elevation||0)+
      (Number(b.elevation||0)-Number(a.elevation||0))*fraction
  };
}

export function splitTrack(points,targetKm){
  if(!Array.isArray(points)||points.length<2) return [];

  const chunks=[];
  let current=[points[0]];
  let accumulated=0;

  for(let index=1;index<points.length;index++){
    let previous=points[index-1];
    const next=points[index];
    let segmentDistance=haversine(previous,next);

    while(accumulated+segmentDistance>=targetKm && segmentDistance>0){
      const needed=targetKm-accumulated;
      const cut=interpolate(previous,next,needed/segmentDistance);
      current.push(cut);
      chunks.push(current);
      current=[cut];
      previous=cut;
      segmentDistance=haversine(previous,next);
      accumulated=0;
    }

    current.push(next);
    accumulated+=segmentDistance;
  }

  if(current.length>1) chunks.push(current);
  return chunks;
}

export function calculateStage(points){
  let distanceKm=0;
  let ascentM=0;
  let descentM=0;

  for(let index=1;index<points.length;index++){
    distanceKm+=haversine(points[index-1],points[index]);
    const diff=Number(points[index].elevation||0)-Number(points[index-1].elevation||0);
    if(diff>0) ascentM+=diff;
    if(diff<0) descentM+=Math.abs(diff);
  }

  return {
    distanceKm,
    ascentM,
    descentM,
    walkingHours:distanceKm/4.2+ascentM/600
  };
}

export function addDays(dateString,days){
  const date=new Date(`${dateString}T12:00:00`);
  date.setDate(date.getDate()+days);
  return date.toISOString().slice(0,10);
}

function storageKey(tourId){
  return `${STORAGE_PREFIX}${tourId}`;
}

export function saveStagesLocal(tourId,stages){
  const compact=stages.map(stage=>({
    id:stage.id,
    tourId:stage.tourId,
    order:stage.order,
    name:stage.name,
    date:stage.date,
    from:stage.from,
    to:stage.to,
    distanceKm:stage.distanceKm,
    ascentM:stage.ascentM,
    descentM:stage.descentM,
    walkingHours:stage.walkingHours,
    startCoord:stage.startCoord,
    endCoord:stage.endCoord,
    notes:stage.notes||"",
    completed:Boolean(stage.completed),
    restDay:Boolean(stage.restDay)
  }));

  const serialized=JSON.stringify(compact);
  localStorage.setItem(storageKey(tourId),serialized);

  const verification=localStorage.getItem(storageKey(tourId));
  if(verification!==serialized){
    throw new Error("Speicherprüfung fehlgeschlagen.");
  }

  const reread=JSON.parse(verification);
  if(!Array.isArray(reread)||reread.length!==compact.length){
    throw new Error("Gespeicherte Etappen konnten nicht korrekt gelesen werden.");
  }

  return {
    count:reread.length,
    characters:serialized.length
  };
}

export function loadStagesLocal(tourId){
  try{
    const raw=localStorage.getItem(storageKey(tourId));
    if(!raw) return [];
    const stages=JSON.parse(raw);
    return Array.isArray(stages)
      ? stages.sort((a,b)=>Number(a.order||0)-Number(b.order||0))
      : [];
  }catch(error){
    console.error("Etappen konnten nicht geladen werden:",error);
    return [];
  }
}

export function deleteStagesLocal(tourId){
  localStorage.removeItem(storageKey(tourId));
}


export function updateStageLocal(tourId,updatedStage){
  const stages=loadStagesLocal(tourId);
  const index=stages.findIndex(stage=>stage.id===updatedStage.id);

  if(index<0){
    throw new Error("Etappe wurde im Speicher nicht gefunden.");
  }

  stages[index]={
    ...stages[index],
    ...updatedStage
  };

  return saveStagesLocal(tourId,stages);
}

export function deleteStageLocal(tourId,stageId){
  const stages=loadStagesLocal(tourId)
    .filter(stage=>stage.id!==stageId)
    .map((stage,index)=>({...stage,order:index+1}));

  if(stages.length){
    return saveStagesLocal(tourId,stages);
  }

  deleteStagesLocal(tourId);
  return {count:0,characters:0};
}


export function recalculateStageDates(tourId,startDate){
  const stages=loadStagesLocal(tourId);
  const recalculated=stages.map((stage,index)=>({
    ...stage,
    order:index+1,
    date:addDays(startDate,index)
  }));
  return saveStagesLocal(tourId,recalculated);
}

export function insertRestDayLocal(tourId,stageId,position="after"){
  const stages=loadStagesLocal(tourId);
  const index=stages.findIndex(stage=>stage.id===stageId);
  if(index<0) throw new Error("Etappe wurde nicht gefunden.");

  const reference=stages[index];
  const insertIndex=position==="before"?index:index+1;
  const locationCoord=reference.endCoord||reference.startCoord;

  const rest={
    id:`${tourId}-rest-${Date.now()}`,
    tourId,
    order:insertIndex+1,
    name:"Ruhetag",
    date:reference.date,
    from:"Ruhetag",
    to:"Ruhetag",
    distanceKm:0,
    ascentM:0,
    descentM:0,
    walkingHours:0,
    startCoord:locationCoord,
    endCoord:locationCoord,
    notes:"",
    completed:false,
    restDay:true
  };

  stages.splice(insertIndex,0,rest);
  return saveStagesLocal(
    tourId,
    stages.map((stage,index)=>({...stage,order:index+1}))
  );
}

export function deleteRestDayLocal(tourId,stageId){
  const stages=loadStagesLocal(tourId)
    .filter(stage=>stage.id!==stageId)
    .map((stage,index)=>({...stage,order:index+1}));

  if(stages.length) return saveStagesLocal(tourId,stages);
  deleteStagesLocal(tourId);
  return {count:0,characters:0};
}

export function splitStageLocal(tourId,stageId,location,firstKm){
  const stages=loadStagesLocal(tourId);
  const index=stages.findIndex(stage=>stage.id===stageId);
  if(index<0) throw new Error("Etappe wurde nicht gefunden.");

  const original=stages[index];
  if(original.restDay) throw new Error("Ein Ruhetag kann nicht geteilt werden.");

  const total=Number(original.distanceKm||0);
  if(firstKm<=0||firstKm>=total){
    throw new Error("Die Teilstrecke muss zwischen 0 und der Gesamtdistanz liegen.");
  }

  const ratio=firstKm/total;
  const first={
    ...original,
    id:`${original.id}-a-${Date.now()}`,
    to:location,
    distanceKm:firstKm,
    ascentM:Number(original.ascentM||0)*ratio,
    descentM:Number(original.descentM||0)*ratio,
    walkingHours:Number(original.walkingHours||0)*ratio,
    completed:false
  };

  const second={
    ...original,
    id:`${original.id}-b-${Date.now()}`,
    from:location,
    distanceKm:total-firstKm,
    ascentM:Number(original.ascentM||0)*(1-ratio),
    descentM:Number(original.descentM||0)*(1-ratio),
    walkingHours:Number(original.walkingHours||0)*(1-ratio),
    completed:false
  };

  stages.splice(index,1,first,second);

  return saveStagesLocal(
    tourId,
    stages.map((stage,index)=>({...stage,order:index+1}))
  );
}

export function mergeStageWithNextLocal(tourId,stageId){
  const stages=loadStagesLocal(tourId);
  const index=stages.findIndex(stage=>stage.id===stageId);

  if(index<0||index>=stages.length-1){
    throw new Error("Keine nächste Etappe zum Zusammenlegen vorhanden.");
  }

  const first=stages[index];
  const second=stages[index+1];

  if(first.restDay||second.restDay){
    throw new Error("Ruhetage können nicht zusammengelegt werden.");
  }

  const merged={
    ...first,
    id:`${tourId}-merged-${Date.now()}`,
    to:second.to,
    distanceKm:Number(first.distanceKm||0)+Number(second.distanceKm||0),
    ascentM:Number(first.ascentM||0)+Number(second.ascentM||0),
    descentM:Number(first.descentM||0)+Number(second.descentM||0),
    walkingHours:Number(first.walkingHours||0)+Number(second.walkingHours||0),
    endCoord:second.endCoord,
    notes:[first.notes,second.notes].filter(Boolean).join(" · "),
    completed:Boolean(first.completed&&second.completed)
  };

  stages.splice(index,2,merged);

  return saveStagesLocal(
    tourId,
    stages.map((stage,index)=>({...stage,order:index+1}))
  );
}


export function distributeRestDays(stages,restEveryDays){
  const every=Math.max(0,Math.floor(Number(restEveryDays)||0));
  if(!every || !stages.length) return stages;

  const result=[];
  let walkingCounter=0;

  stages.forEach((stage)=>{
    result.push(stage);
    walkingCounter++;

    if(walkingCounter % every === 0 && walkingCounter < stages.length){
      const coord=stage.endCoord||stage.startCoord;
      result.push({
        id:`${stage.tourId}-rest-auto-${Date.now()}-${walkingCounter}`,
        tourId:stage.tourId,
        order:0,
        name:"Ruhetag",
        date:stage.date,
        from:"Ruhetag",
        to:"Ruhetag",
        distanceKm:0,
        ascentM:0,
        descentM:0,
        walkingHours:0,
        startCoord:coord,
        endCoord:coord,
        notes:`Automatisch nach ${every} Wandertagen eingefügt`,
        completed:false,
        restDay:true
      });
    }
  });

  return result.map((stage,index)=>({...stage,order:index+1}));
}

export function getStageStorageInfo(tourId){
  const raw=localStorage.getItem(storageKey(tourId))||"";
  let count=0;

  try{
    const parsed=raw?JSON.parse(raw):[];
    count=Array.isArray(parsed)?parsed.length:0;
  }catch{
    count=0;
  }

  return {
    key:storageKey(tourId),
    count,
    characters:raw.length,
    origin:window.location.origin
  };
}
