(() => {
"use strict";
const STORAGE_KEY="3113-adventures-v310";
const KNOWN_LEGACY_KEYS=[
  "3113-adventures-v301","3113-adventures-v300","3113-adventures-v220","3113-adventures-v210","3113-adventures-v202","3113-adventures-v201","3113-adventures-v2",
  "a3113-v14","a3113-v141","a3113-v13","a3113-v12","a3113-v121","a3113-v11",
  "adventures3113_v1","3113Adventures","3113-adventures"
];
const $=id=>document.getElementById(id);
let state=loadState();
let map=null,trackLayer=null,markerLayer=null,userMarker=null;
let activeStageId=null;
let poiSearchResults=[];

function clone(v){return JSON.parse(JSON.stringify(v))}
function loadState(){
  const current=localStorage.getItem(STORAGE_KEY);
  if(current){
    try{return normalize(JSON.parse(current))}catch(e){}
  }

  const candidates=[];
  for(const key of KNOWN_LEGACY_KEYS){
    const raw=localStorage.getItem(key);
    if(raw){
      try{candidates.push(JSON.parse(raw))}catch(e){}
    }
  }

  for(let i=0;i<localStorage.length;i++){
    const key=localStorage.key(i);
    if(!key || key===STORAGE_KEY || KNOWN_LEGACY_KEYS.includes(key)) continue;
    const raw=localStorage.getItem(key);
    if(!raw) continue;
    try{
      const parsed=JSON.parse(raw);
      if(parsed && typeof parsed==="object" && (
        Array.isArray(parsed.stages) ||
        Array.isArray(parsed.places) ||
        parsed.gpx ||
        parsed.tour
      )){
        candidates.push(parsed);
      }
    }catch(e){}
  }

  const merged=clone(window.APP_DEFAULT_DATA);
  for(const candidate of candidates){
    mergeLegacyInto(merged,candidate);
  }
  return merged;
}
function mergeLegacyInto(base,raw){
  if(raw.tour && typeof raw.tour==="object"){
    base.tour={...base.tour,...raw.tour};
  }
  if(raw.arrival) base.tour.arrivalDate=raw.arrival;
  if(raw.start) base.tour.startDate=raw.start;
  if(raw.target) base.tour.targetDate=raw.target;
  if(Number.isFinite(Number(raw.restDays))) base.tour.restDays=Number(raw.restDays);

  if(Array.isArray(raw.stages) && raw.stages.length){
    base.stages=raw.stages;
  }
  if(Array.isArray(raw.places) && raw.places.length){
    base.places=raw.places;
  }

  if(raw.gpx){
    base.gpx=normalizeGpx(raw.gpx);
  }else if(raw.track && Array.isArray(raw.track)){
    base.gpx=normalizeGpx({name:"Importierter Track",points:raw.track});
  }else if(Array.isArray(raw.gpxPoints)){
    base.gpx=normalizeGpx({name:"Importierter Track",points:raw.gpxPoints});
  }
}
function normalizeGpx(gpx){
  if(!gpx) return null;
  const points=(gpx.points||gpx.trackPoints||gpx.coords||[]).map(p=>{
    if(Array.isArray(p)) return {lat:Number(p[0]),lng:Number(p[1])};
    return {
      lat:Number(p.lat ?? p.latitude),
      lng:Number(p.lng ?? p.lon ?? p.longitude)
    };
  }).filter(p=>Number.isFinite(p.lat)&&Number.isFinite(p.lng));

  let distanceKm=Number(gpx.distanceKm||gpx.distance||0);
  if(!distanceKm && points.length>1){
    for(let i=1;i<points.length;i++) distanceKm+=haversine(points[i-1],points[i]);
  }

  return points.length ? {
    name:gpx.name||gpx.fileName||"Importierter Track",
    points,
    distanceKm
  } : null;
}
function normalize(raw){
  const base=clone(window.APP_DEFAULT_DATA);
  mergeLegacyInto(base,raw||{});
  return base;
}
function save(){localStorage.setItem(STORAGE_KEY,JSON.stringify(state))}
function escapeHtml(value){return String(value??"").replace(/[&<>"']/g,ch=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[ch]))}
function formatDate(value){if(!value)return "–";return new Intl.DateTimeFormat("de-CH").format(new Date(value+"T12:00:00"))}
function daysInclusive(a,b){return Math.max(1,Math.round((new Date(b)-new Date(a))/86400000)+1)}
function totalStageKm(list=state.stages){return list.reduce((sum,s)=>sum+Number(s.km||0),0)}
function categoryName(key){return ({camping:"Camping",water:"Wasser",shop:"Einkauf",transport:"ÖV",sight:"Sehenswürdigkeit",other:"Weitere"})[key]||key}
function markerIcon(category){return ({camping:"⛺",water:"💧",shop:"🛒",transport:"🚆",sight:"★",other:"●"})[category]||"●"}

function initNavigation(){
  document.querySelectorAll("#mainNav button").forEach(button=>{
    button.addEventListener("click",()=>{
      document.querySelectorAll("#mainNav button").forEach(item=>item.classList.toggle("active",item===button));
      document.querySelectorAll(".page").forEach(page=>page.classList.toggle("active",page.id===button.dataset.page));
      if(button.dataset.page==="map") setTimeout(()=>{if(initMap()){map.invalidateSize();renderMap()}},100);
    });
  });
}
function renderDashboard(){
  $("tourTitle").textContent=state.tour.name;
  const calendar=daysInclusive(state.tour.startDate,state.tour.targetDate);
  const walking=Math.max(1,calendar-Number(state.tour.restDays||0));
  const planned=totalStageKm();
  const completed=totalStageKm(state.stages.filter(s=>s.completed));
  $("calendarDays").textContent=calendar;
  $("requiredAverage").textContent=(Number(state.tour.officialDistance)/walking).toFixed(1)+" km";
  $("plannedRestDays").textContent=state.tour.restDays;
  $("completedDistance").textContent=completed.toFixed(1)+" km";
  $("plannedDistance").textContent=planned.toFixed(1)+" km";
  $("unplannedDistance").textContent=Math.max(0,state.tour.officialDistance-planned).toFixed(1)+" km";
  $("progressBar").style.width=Math.min(100,completed/state.tour.officialDistance*100)+"%";
  $("stageCount").textContent=state.stages.length;
  $("placeCount").textContent=state.places.length;
  $("gpxStatus").textContent=state.gpx?`${state.gpx.points.length} Punkte`:"nicht importiert";
  renderNearestPlaces();
  const next=[...state.stages].sort((a,b)=>(a.date||"").localeCompare(b.date||"")).find(s=>!s.completed);
  $("nextStage").innerHTML=next?`<strong>${formatDate(next.date)} · ${escapeHtml(next.from)} → ${escapeHtml(next.to)}</strong><p>${Number(next.km||0).toFixed(1)} km · ↑ ${Number(next.up||0)} m · ↓ ${Number(next.down||0)} m</p><p class="muted">${escapeHtml(next.overnight||"Keine Übernachtung eingetragen")}</p>`:"Noch keine offene Etappe.";
}

function renderSections(){
  renderSectionProgress();
  const searchElement=$("sectionSearch");
  const filterElement=$("sectionFilter");
  if(!searchElement || !filterElement || !$("sectionList")) return;

  const search=searchElement.value.trim().toLowerCase();
  const filter=filterElement.value;
  let sections=[...(state.sections||[])];

  sections=sections.filter(section=>section.toLowerCase().includes(search));
  if(filter==="heid") sections=sections.filter(section=>section==="Heidschnuckenweg");

  $("sectionList").innerHTML=sections.length
    ? sections.map(section=>{
        const originalIndex=(state.sections||[]).indexOf(section)+1;
        const isHeid=section==="Heidschnuckenweg";
        return `<article class="section-card ${isHeid?"heid":""}">
          <h3><span class="section-number">${originalIndex}</span>${escapeHtml(section)}</h3>
          ${isHeid?'<span class="pill verified">Speziell markiert</span>':""}
        </article>`;
      }).join("")
    : '<div class="empty">Keine passenden Abschnitte.</div>';
}


function renderSectionProgress(){
  const container=$("sectionProgress");
  if(!container) return;

  const groups=(state.sections||[]).map(section=>{
    const stages=state.stages.filter(stage=>stage.section===section && !stage.restDay);
    const planned=totalStageKm(stages);
    const completed=totalStageKm(stages.filter(stage=>stage.completed));
    return {section,planned,completed,count:stages.length};
  }).filter(group=>group.count>0);

  container.innerHTML=groups.length
    ? groups.map(group=>{
        const percent=group.planned?Math.min(100,group.completed/group.planned*100):0;
        return `<div class="section-progress-row">
          <div class="section-progress-head">
            <strong>${escapeHtml(group.section)}</strong>
            <span>${group.completed.toFixed(1)} / ${group.planned.toFixed(1)} km</span>
          </div>
          <div class="mini-progress"><span style="width:${percent}%"></span></div>
        </div>`;
      }).join("")
    : '<p class="muted">Noch keine Etappen einem Abschnitt zugeordnet.</p>';
}

function pointDistance(a,b){
  return haversine({lat:a.lat,lng:a.lng},{lat:b.lat,lng:b.lng});
}

function interpolatePoint(a,b,fraction){
  return {
    lat:a.lat+(b.lat-a.lat)*fraction,
    lng:a.lng+(b.lng-a.lng)*fraction
  };
}

function splitTrackByDistance(points,targetKm){
  if(!Array.isArray(points)||points.length<2) return [];
  const segments=[];
  let current=[points[0]];
  let accumulated=0;

  for(let i=1;i<points.length;i++){
    let previous=points[i-1];
    const next=points[i];
    let remainingSegment=pointDistance(previous,next);

    while(accumulated+remainingSegment>=targetKm && remainingSegment>0){
      const needed=targetKm-accumulated;
      const fraction=needed/remainingSegment;
      const cut=interpolatePoint(previous,next,fraction);
      current.push(cut);
      segments.push(current);
      current=[cut];
      previous=cut;
      remainingSegment=pointDistance(previous,next);
      accumulated=0;
    }

    current.push(next);
    accumulated+=remainingSegment;
  }

  if(current.length>1) segments.push(current);
  return segments;
}

function addDays(dateString,days){
  const date=new Date(dateString+"T12:00:00");
  date.setDate(date.getDate()+days);
  return date.toISOString().slice(0,10);
}

function nearestSectionForIndex(index,total){
  const sections=state.sections||[];
  if(!sections.length) return "";
  const ratio=total<=1?0:index/(total-1);
  return sections[Math.min(sections.length-1,Math.floor(ratio*sections.length))];
}

function generateStagesFromGpx(){
  if(!state.gpx?.points?.length){
    alert("Bitte zuerst unter Karte einen GPX-Track importieren.");
    return;
  }

  const targetKm=Number($("plannerKm").value||28);
  const restEvery=Number($("plannerRestEvery").value||0);
  if(targetKm<5){
    alert("Bitte mindestens 5 km als Tagesdistanz wählen.");
    return;
  }

  const existingGenerated=state.stages.filter(stage=>stage.generated);
  if(existingGenerated.length && !confirm("Bereits automatisch erzeugte Etappen ersetzen?")){
    return;
  }

  state.stages=state.stages.filter(stage=>!stage.generated);
  const chunks=splitTrackByDistance(state.gpx.points,targetKm);
  let date=state.tour.startDate;
  let walkingCounter=0;
  let number=1;

  chunks.forEach((chunk,index)=>{
    if(restEvery>0 && walkingCounter>0 && walkingCounter%restEvery===0){
      state.stages.push({
        id:Date.now()+number++,
        date,
        section:nearestSectionForIndex(index,chunks.length),
        from:"Ruhetag",
        to:"Ruhetag",
        km:0,
        up:0,
        down:0,
        overnight:"",
        notes:"Automatisch eingefügter Ruhetag",
        completed:false,
        restDay:true,
        generated:true
      });
      date=addDays(date,1);
    }

    const startPoint=chunk[0];
    const endPoint=chunk[chunk.length-1];
    let km=0;
    for(let i=1;i<chunk.length;i++) km+=pointDistance(chunk[i-1],chunk[i]);

    state.stages.push({
      id:Date.now()+number++,
      date,
      section:nearestSectionForIndex(index,chunks.length),
      from:`Etappe ${index+1} Start`,
      to:`Etappe ${index+1} Ziel`,
      km:Number(km.toFixed(1)),
      up:0,
      down:0,
      overnight:"",
      notes:`Start: ${startPoint.lat.toFixed(5)}, ${startPoint.lng.toFixed(5)} · Ziel: ${endPoint.lat.toFixed(5)}, ${endPoint.lng.toFixed(5)}`,
      completed:false,
      restDay:false,
      generated:true,
      startCoord:startPoint,
      endCoord:endPoint,
      trackPoints:chunk
    });

    walkingCounter++;
    date=addDays(date,1);
  });

  save();
  renderAll();
  renderPlannerInfo();
}

function renderPlannerInfo(){
  const box=$("plannerInfo");
  if(!box) return;

  if(!state.gpx?.points?.length){
    box.textContent="Für die automatische Planung zuerst einen GPX-Track importieren.";
    return;
  }

  const generated=state.stages.filter(stage=>stage.generated);
  const walking=generated.filter(stage=>!stage.restDay);
  const rest=generated.filter(stage=>stage.restDay);
  box.innerHTML=generated.length
    ? `<strong>${walking.length} automatische Wandertage</strong> und ${rest.length} Ruhetage · ${totalStageKm(walking).toFixed(1)} km`
    : `GPX bereit: ${state.gpx.points.length} Trackpunkte, ca. ${Number(state.gpx.distanceKm||0).toFixed(1)} km.`;
}


function sortStages(){
  state.stages.sort((a,b)=>(a.date||"").localeCompare(b.date||"") || Number(a.id)-Number(b.id));
}

function recalculateDates(startDate=state.tour.startDate){
  sortStages();
  let date=startDate;
  state.stages.forEach(stage=>{
    stage.date=date;
    date=addDays(date,1);
  });
  save();
}

function insertRestDay(stageId,position){
  sortStages();
  const index=state.stages.findIndex(stage=>stage.id===stageId);
  if(index<0) return;
  const reference=state.stages[index];
  const insertIndex=position==="before"?index:index+1;

  state.stages.splice(insertIndex,0,{
    id:Date.now(),
    date:reference.date,
    section:reference.section||state.sections[0],
    from:"Ruhetag",
    to:"Ruhetag",
    km:0,
    up:0,
    down:0,
    overnight:reference.overnight||"",
    notes:"Manuell eingefügter Ruhetag",
    completed:false,
    restDay:true,
    generated:false
  });

  recalculateDates();
  renderAll();
}

function deleteRestDay(stageId){
  const stage=state.stages.find(item=>item.id===stageId);
  if(!stage?.restDay) return;
  state.stages=state.stages.filter(item=>item.id!==stageId);
  recalculateDates();
  renderAll();
}

function openSplitStage(stageId){
  const stage=state.stages.find(item=>item.id===stageId);
  if(!stage || stage.restDay) return;
  $("splitStageId").value=stageId;
  $("splitLocation").value="";
  $("splitKm").value=(Number(stage.km||0)/2).toFixed(1);
  $("splitDialog").showModal();
}

function splitStage(event){
  event.preventDefault();
  const stageId=Number($("splitStageId").value);
  const location=$("splitLocation").value.trim();
  const firstKm=Number($("splitKm").value);
  const index=state.stages.findIndex(stage=>stage.id===stageId);
  if(index<0 || !location) return;

  const original=state.stages[index];
  const totalKm=Number(original.km||0);
  if(firstKm<=0 || firstKm>=totalKm){
    alert("Die Distanz des ersten Teils muss zwischen 0 und der Gesamtdistanz liegen.");
    return;
  }

  const ratio=firstKm/totalKm;
  const secondKm=totalKm-firstKm;

  const first={
    ...original,
    id:Date.now(),
    to:location,
    km:Number(firstKm.toFixed(1)),
    up:Math.round(Number(original.up||0)*ratio),
    down:Math.round(Number(original.down||0)*ratio),
    notes:(original.notes?original.notes+" · ":"")+"Erster Teil einer geteilten Etappe"
  };

  const second={
    ...original,
    id:Date.now()+1,
    from:location,
    km:Number(secondKm.toFixed(1)),
    up:Number(original.up||0)-first.up,
    down:Number(original.down||0)-first.down,
    notes:"Zweiter Teil einer geteilten Etappe",
    completed:false
  };

  state.stages.splice(index,1,first,second);
  recalculateDates();
  $("splitDialog").close();
  renderAll();
}

function mergeWithNext(stageId){
  sortStages();
  const index=state.stages.findIndex(stage=>stage.id===stageId);
  if(index<0 || index>=state.stages.length-1) return;

  const first=state.stages[index];
  const second=state.stages[index+1];

  if(first.restDay || second.restDay){
    alert("Ruhetage können nicht mit einer Wanderetappe zusammengelegt werden.");
    return;
  }

  if(!confirm(`${first.from} → ${first.to} mit der nächsten Etappe zusammenlegen?`)) return;

  const merged={
    ...first,
    id:Date.now(),
    to:second.to,
    km:Number((Number(first.km||0)+Number(second.km||0)).toFixed(1)),
    up:Number(first.up||0)+Number(second.up||0),
    down:Number(first.down||0)+Number(second.down||0),
    overnight:second.overnight||first.overnight,
    notes:[first.notes,second.notes,"Zusammengelegte Etappe"].filter(Boolean).join(" · "),
    completed:first.completed&&second.completed
  };

  state.stages.splice(index,2,merged);
  recalculateDates();
  renderAll();
}

function renderTimeline(){
  const container=$("timelineSummary");
  if(!container) return;

  const stages=[...state.stages].sort((a,b)=>(a.date||"").localeCompare(b.date||""));
  if(!stages.length){
    container.innerHTML='<p class="muted">Noch keine Etappen vorhanden.</p>';
    return;
  }

  const grouped={};
  stages.forEach(stage=>{
    const month=(stage.date||"").slice(0,7)||"ohne-datum";
    (grouped[month] ||= []).push(stage);
  });

  container.innerHTML=Object.entries(grouped).map(([month,items])=>{
    const monthLabel=month==="ohne-datum"?"Ohne Datum":new Intl.DateTimeFormat("de-CH",{month:"long",year:"numeric"}).format(new Date(month+"-01T12:00:00"));
    return `<div class="timeline-month">
      <h4>${monthLabel}</h4>
      <div class="timeline-items">
        ${items.map(stage=>`<div class="timeline-item ${stage.restDay?"rest":""} ${stage.completed?"completed":""}">
          <span class="timeline-date">${formatDate(stage.date)}</span>
          <span>${stage.restDay?"Ruhetag":`${escapeHtml(stage.from)} → ${escapeHtml(stage.to)} · ${Number(stage.km||0).toFixed(1)} km`}</span>
        </div>`).join("")}
      </div>
    </div>`;
  }).join("");
}

function renderStages(){
  const search=$("stageSearch").value.trim().toLowerCase();
  const filter=$("stageFilter").value;
  let stages=[...state.stages].sort((a,b)=>(a.date||"").localeCompare(b.date||""));
  stages=stages.filter(s=>`${s.from} ${s.to} ${s.section} ${s.notes}`.toLowerCase().includes(search));
  if(filter==="open") stages=stages.filter(s=>!s.completed);
  if(filter==="completed") stages=stages.filter(s=>s.completed);
  if(filter==="heid") stages=stages.filter(s=>s.section==="Heidschnuckenweg");
  $("stageList").innerHTML=stages.length?stages.map(s=>`
    <article class="stage-card ${s.section==="Heidschnuckenweg"?"heid":""} ${s.completed?"completed":""}">
      <h3>${formatDate(s.date)} · ${escapeHtml(s.from)} → ${escapeHtml(s.to)}</h3>
      <span class="pill">${escapeHtml(s.section)}</span><span class="pill">${Number(s.km||0).toFixed(1)} km</span>
      ${s.completed?'<span class="pill verified">Abgeschlossen</span>':""}${s.generated?'<span class="pill">Automatisch</span>':""}${s.restDay?'<span class="pill">Ruhetag</span>':""}
      <p>↑ ${Number(s.up||0)} m · ↓ ${Number(s.down||0)} m</p>
      <p><strong>Übernachtung:</strong> ${escapeHtml(s.overnight||"–")}</p>
      ${s.notes?`<p class="muted">${escapeHtml(s.notes)}</p>`:""}
      <div class="card-actions">
        ${s.startCoord?`<button data-show-stage="${s.id}">Auf Karte</button><button data-nearby-stage="${s.id}">Orte nahe Etappe</button>`:""}
        ${s.restDay
          ? `<button data-delete-rest="${s.id}" class="danger">Ruhetag entfernen</button>`
          : `<button data-rest-before="${s.id}">Ruhetag davor</button>
             <button data-rest-after="${s.id}">Ruhetag danach</button>
             <button data-split-stage="${s.id}">Teilen</button>
             <button data-merge-stage="${s.id}">Mit nächster verbinden</button>
             <button data-edit-stage="${s.id}">Bearbeiten</button>
             <button data-toggle-stage="${s.id}">${s.completed?"Wieder öffnen":"Abschliessen"}</button>
             <button class="danger" data-delete-stage="${s.id}">Löschen</button>`}
      </div>
    </article>`).join(""):'<div class="empty">Keine passenden Etappen.</div>';
}

function poiCategoryLabel(category){
  return ({camping:"Camping/Hütte",water:"Wasser",shop:"Einkauf",transport:"ÖV",toilet:"Toilette",pharmacy:"Apotheke",sight:"Sehenswürdigkeit",other:"Weitere"})[category]||category;
}

function renderNearestPlaces(){
  const container=$("nearestPlaces");
  if(!container) return;
  if(!state.places.length){container.textContent="Noch keine Orte gespeichert.";return}

  let reference=null;
  const next=[...state.stages].sort((a,b)=>(a.date||"").localeCompare(b.date||"")).find(stage=>!stage.completed && stage.startCoord);
  if(next?.startCoord) reference=next.startCoord;
  else if(state.gpx?.points?.length) reference=state.gpx.points[0];

  if(!reference){container.textContent=`${state.places.length} Orte gespeichert. Für Entfernungen wird ein GPX-Track benötigt.`;return}

  const nearest=state.places.map(place=>({...place,distance:haversine(reference,place)})).sort((a,b)=>a.distance-b.distance).slice(0,4);
  container.innerHTML=nearest.map(place=>`<div class="metric-row"><span>${markerIcon(place.category)} ${escapeHtml(place.name)}</span><strong>${place.distance.toFixed(1)} km</strong></div>`).join("");
}

function buildOverpassClauses(category,radius,lat,lng){
  const around=`(around:${radius},${lat},${lng})`;
  const selectors={
    camping:[`["tourism"~"^(camp_site|caravan_site|alpine_hut|wilderness_hut)$"]`,`["amenity"="shelter"]["shelter_type"~"^(basic_hut|weather_shelter)$"]`],
    water:[`["amenity"="drinking_water"]`,`["natural"="spring"]`,`["drinking_water"="yes"]`],
    shop:[`["shop"~"^(supermarket|convenience|bakery|general)$"]`,`["amenity"="marketplace"]`],
    transport:[`["railway"~"^(station|halt)$"]`,`["highway"="bus_stop"]`,`["public_transport"="station"]`],
    toilet:[`["amenity"="toilets"]`],
    pharmacy:[`["amenity"="pharmacy"]`]
  };
  const result=[];
  (selectors[category]||[]).forEach(selector=>{
    ["node","way","relation"].forEach(type=>result.push(`${type}${around}${selector};`));
  });
  return result;
}

function identifyPoiCategory(tags={}){
  if(["camp_site","caravan_site","alpine_hut","wilderness_hut"].includes(tags.tourism)||tags.amenity==="shelter") return "camping";
  if(tags.amenity==="drinking_water"||tags.natural==="spring"||tags.drinking_water==="yes") return "water";
  if(tags.shop||tags.amenity==="marketplace") return "shop";
  if(tags.railway||tags.highway==="bus_stop"||tags.public_transport==="station") return "transport";
  if(tags.amenity==="toilets") return "toilet";
  if(tags.amenity==="pharmacy") return "pharmacy";
  return "other";
}

function poiName(tags,category,id){
  return tags.name||tags["name:de"]||tags.operator||`${poiCategoryLabel(category)} ${id}`;
}

function distanceToTrack(point){
  if(!state.gpx?.points?.length) return null;
  const track=state.gpx.points;
  const step=Math.max(1,Math.floor(track.length/1800));
  let minimum=Infinity;
  for(let i=0;i<track.length;i+=step){
    const distance=haversine(point,track[i]);
    if(distance<minimum) minimum=distance;
  }
  return minimum;
}

async function searchOsmPois(){
  if(!initMap()){
    alert("Die Karte konnte nicht geöffnet werden.");
    return;
  }
  const selected=[...document.querySelectorAll(".poi-category:checked")].map(input=>input.value);
  if(!selected.length){alert("Bitte mindestens eine Kategorie wählen.");return}

  const center=map.getCenter();
  const radius=Number($("poiRadius").value||5000);
  const maxTrackDistance=Number($("poiTrackDistance").value||0);
  const endpoint=$("overpassEndpoint").value;
  const clauses=selected.flatMap(category=>buildOverpassClauses(category,radius,center.lat,center.lng));
  const query=`[out:json][timeout:45];(${clauses.join("")});out center tags;`;
  $("poiSearchStatus").innerHTML='<span class="poi-loading"></span> OpenStreetMap wird durchsucht …';
  $("searchPoisBtn").disabled=true;

  try{
    const response=await fetch(endpoint,{method:"POST",headers:{"Content-Type":"application/x-www-form-urlencoded;charset=UTF-8"},body:"data="+encodeURIComponent(query)});
    if(!response.ok) throw new Error(`Serverantwort ${response.status}`);
    const data=await response.json();
    const seen=new Set();
    poiSearchResults=(data.elements||[]).map(element=>{
      const lat=Number(element.lat??element.center?.lat);
      const lng=Number(element.lon??element.center?.lon);
      if(!Number.isFinite(lat)||!Number.isFinite(lng)) return null;
      const category=identifyPoiCategory(element.tags||{});
      const sourceKey=`${element.type}/${element.id}`;
      if(seen.has(sourceKey)) return null;
      seen.add(sourceKey);
      const trackDistance=distanceToTrack({lat,lng});
      return {id:sourceKey,osmId:element.id,osmType:element.type,name:poiName(element.tags||{},category,element.id),category,lat,lng,tags:element.tags||{},trackDistance};
    }).filter(Boolean);

    if(maxTrackDistance>0 && state.gpx?.points?.length){
      poiSearchResults=poiSearchResults.filter(result=>result.trackDistance!==null&&result.trackDistance<=maxTrackDistance);
    }
    poiSearchResults.sort((a,b)=>(a.trackDistance??999)-(b.trackDistance??999)||a.name.localeCompare(b.name));
    renderPoiResults();
    $("poiSearchStatus").textContent=`${poiSearchResults.length} Treffer im Umkreis von ${(radius/1000).toFixed(0)} km gefunden.`;
  }catch(error){
    $("poiSearchStatus").innerHTML=`<strong>Suche fehlgeschlagen.</strong> ${escapeHtml(error.message)}. Versuche den anderen Overpass-Server oder einen kleineren Radius.`;
  }finally{
    $("searchPoisBtn").disabled=false;
  }
}

function renderPoiResults(){
  const box=$("poiResults");
  if(!box) return;
  box.innerHTML=poiSearchResults.length?`<div class="poi-results-list">${poiSearchResults.slice(0,150).map((result,index)=>`<label class="poi-result"><input type="checkbox" data-poi-index="${index}" checked><div><h4>${markerIcon(result.category)} ${escapeHtml(result.name)}</h4><div class="poi-meta"><span class="pill">${poiCategoryLabel(result.category)}</span>${result.trackDistance!==null?`<span class="pill">${result.trackDistance.toFixed(2)} km zum Track</span>`:""}</div><div class="poi-source">OpenStreetMap ${result.osmType}/${result.osmId} · ${result.lat.toFixed(5)}, ${result.lng.toFixed(5)}</div></div></label>`).join("")}</div>`:'<p class="muted">Keine passenden Treffer.</p>';
}

function importSelectedPois(){
  const indexes=[...document.querySelectorAll("[data-poi-index]:checked")].map(input=>Number(input.dataset.poiIndex));
  if(!indexes.length){alert("Keine Treffer ausgewählt.");return}
  let imported=0;
  indexes.forEach(index=>{
    const result=poiSearchResults[index];
    if(!result) return;
    const duplicate=state.places.some(place=>place.osmType===result.osmType&&String(place.osmId)===String(result.osmId));
    if(duplicate) return;
    state.places.push({id:Date.now()+imported,name:result.name,category:result.category,lat:result.lat,lng:result.lng,notes:`Aus OpenStreetMap importiert${result.trackDistance!==null?` · ${result.trackDistance.toFixed(2)} km zum GPX-Track`:""}`,verified:false,source:"OpenStreetMap",osmType:result.osmType,osmId:result.osmId,lastChecked:new Date().toISOString(),distanceToTrackKm:result.trackDistance});
    imported++;
  });
  save();renderAll();
  $("poiSearchStatus").textContent=`${imported} neue Orte gespeichert. Bereits vorhandene OSM-Orte wurden übersprungen.`;
}

function centerMapOnNextStage(){
  if(!initMap()) return;
  const next=[...state.stages].sort((a,b)=>(a.date||"").localeCompare(b.date||"")).find(stage=>!stage.completed&&stage.startCoord);
  if(next?.startCoord){map.setView([next.startCoord.lat,next.startCoord.lng],12);document.querySelector('[data-page="map"]').click();}
  else if(state.gpx?.points?.length){map.setView([state.gpx.points[0].lat,state.gpx.points[0].lng],11);document.querySelector('[data-page="map"]').click();}
  else alert("Kein Etappen-Startpunkt und kein GPX-Track vorhanden.");
}

function renderPlaces(){
  const search=$("placeSearch").value.trim().toLowerCase();
  const filter=$("placeFilter").value;
  let places=state.places.filter(p=>`${p.name} ${p.notes}`.toLowerCase().includes(search));
  if(filter!=="all") places=places.filter(p=>p.category===filter);
  $("placeList").innerHTML=places.length?places.map(p=>`
    <article class="place-card">
      <h3>${markerIcon(p.category)} ${escapeHtml(p.name)}</h3>
      <span class="pill">${categoryName(p.category)}</span>${p.verified?'<span class="pill verified">Selbst geprüft</span>':""}
      <p>${Number(p.lat).toFixed(5)}, ${Number(p.lng).toFixed(5)}</p>
      ${p.notes?`<p class="muted">${escapeHtml(p.notes)}</p>`:""}${p.source?`<p class="poi-source">Quelle: ${escapeHtml(p.source)}${p.distanceToTrackKm!==null&&p.distanceToTrackKm!==undefined?` · ${Number(p.distanceToTrackKm).toFixed(2)} km zum Track`:""}</p>`:""}
      <div class="card-actions"><button data-show-place="${p.id}">Auf Karte</button><button data-edit-place="${p.id}">Bearbeiten</button><button class="danger" data-delete-place="${p.id}">Löschen</button></div>
    </article>`).join(""):'<div class="empty">Noch keine Orte erfasst.</div>';
}
function fillSettings(){
  $("tourNameInput").value=state.tour.name;
  $("arrivalInput").value=state.tour.arrivalDate;
  $("startInput").value=state.tour.startDate;
  $("targetInput").value=state.tour.targetDate;
  $("restDaysInput").value=state.tour.restDays;
}
function renderAll(){renderDashboard();renderSections();renderStages();renderPlaces();fillSettings();renderPlannerInfo();renderTimeline();if(map)renderMap()}

function openStage(stage={}){
  $("stageId").value=stage.id||"";
  $("stageDate").value=stage.date||state.tour.startDate;
  $("stageSection").value=stage.section||state.sections[0];
  $("stageFrom").value=stage.from||"";
  $("stageTo").value=stage.to||"";
  $("stageKm").value=stage.km??"";
  $("stageUp").value=stage.up??0;
  $("stageDown").value=stage.down??0;
  $("stageOvernight").value=stage.overnight||"";
  $("stageNotes").value=stage.notes||"";
  $("stageCompleted").checked=!!stage.completed;
  $("stageDialog").showModal();
}
function saveStage(event){
  event.preventDefault();
  const id=Number($("stageId").value)||Date.now();
  const stage={id,date:$("stageDate").value,section:$("stageSection").value,from:$("stageFrom").value.trim(),to:$("stageTo").value.trim(),km:Number($("stageKm").value||0),up:Number($("stageUp").value||0),down:Number($("stageDown").value||0),overnight:$("stageOvernight").value.trim(),notes:$("stageNotes").value.trim(),completed:$("stageCompleted").checked};
  if(!stage.from||!stage.to)return;
  const index=state.stages.findIndex(s=>s.id===id);
  if(index>=0)state.stages[index]=stage;else state.stages.push(stage);
  save();$("stageDialog").close();renderAll();
}
function openPlace(place={}){
  $("placeId").value=place.id||"";
  $("placeName").value=place.name||"";
  $("placeCategory").value=place.category||"camping";
  $("placeLat").value=place.lat??"";
  $("placeLng").value=place.lng??"";
  $("placeNotes").value=place.notes||"";
  $("placeVerified").checked=!!place.verified;
  $("placeDialog").showModal();
}
function savePlace(event){
  event.preventDefault();
  const id=Number($("placeId").value)||Date.now();
  const place={id,name:$("placeName").value.trim(),category:$("placeCategory").value,lat:Number($("placeLat").value),lng:Number($("placeLng").value),notes:$("placeNotes").value.trim(),verified:$("placeVerified").checked};
  if(!place.name||!Number.isFinite(place.lat)||!Number.isFinite(place.lng))return;
  const index=state.places.findIndex(p=>p.id===id);
  if(index>=0)state.places[index]=place;else state.places.push(place);
  save();$("placeDialog").close();renderAll();
}

function initMap(){
  const mapError=$("mapError");

  if(typeof window.L==="undefined"){
    if(mapError){
      mapError.hidden=false;
      mapError.innerHTML="<strong>Karte konnte nicht geladen werden.</strong><p>Die Kartenbibliothek ist nicht erreichbar. Bitte Internetverbindung prüfen und unter Einstellungen die App-Dateien aktualisieren.</p>";
    }
    return false;
  }

  if(map){
    map.invalidateSize();
    return true;
  }

  if(mapError) mapError.hidden=true;

  try{
    map=L.map("mapCanvas",{zoomControl:true}).setView([51.2,10.4],6);

    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png",{
      maxZoom:19,
      attribution:"&copy; OpenStreetMap-Mitwirkende"
    }).addTo(map);

    trackLayer=L.layerGroup().addTo(map);
    markerLayer=L.layerGroup().addTo(map);

    map.on("click",event=>{
      if(confirm("An dieser Stelle einen neuen Ort anlegen?")){
        openPlace({lat:event.latlng.lat,lng:event.latlng.lng});
      }
    });

    setTimeout(()=>map.invalidateSize(),100);
    return true;
  }catch(error){
    if(mapError){
      mapError.hidden=false;
      mapError.innerHTML=`<strong>Kartenfehler</strong><p>${escapeHtml(error.message||"Unbekannter Fehler")}</p>`;
    }
    return false;
  }
}
function nearestTrackPointIndex(target){
  if(!state.gpx?.points?.length || !target) return -1;
  let bestIndex=0;
  let bestDistance=Infinity;
  state.gpx.points.forEach((point,index)=>{
    const distance=haversine(point,target);
    if(distance<bestDistance){bestDistance=distance;bestIndex=index;}
  });
  return bestIndex;
}

function getStageTrackPoints(stage){
  if(Array.isArray(stage?.trackPoints) && stage.trackPoints.length>1){
    return stage.trackPoints;
  }
  if(!stage?.startCoord || !stage?.endCoord || !state.gpx?.points?.length){
    return [];
  }
  let startIndex=nearestTrackPointIndex(stage.startCoord);
  let endIndex=nearestTrackPointIndex(stage.endCoord);
  if(startIndex<0 || endIndex<0) return [];
  if(endIndex<startIndex){
    const temp=startIndex;startIndex=endIndex;endIndex=temp;
  }
  return state.gpx.points.slice(startIndex,endIndex+1);
}

function showStageOnMap(stage){
  if(!stage) return;
  activeStageId=stage.id;
  document.querySelector('[data-page="map"]').click();
  setTimeout(()=>{
    if(!initMap()) return;
    renderMap();
  },160);
}

function showFullTrack(){
  activeStageId=null;
  if(initMap()) renderMap();
}


function visiblePlaceCategories(){
  return {
    camping:$("layerCamping")?.checked ?? true,
    water:$("layerWater")?.checked ?? true,
    shop:$("layerShop")?.checked ?? true,
    transport:$("layerTransport")?.checked ?? true,
    sight:$("layerSight")?.checked ?? true,
    other:$("layerOther")?.checked ?? true
  };
}
function createPlaceIcon(category){
  return L.divIcon({className:"",html:`<div class="place-marker">${markerIcon(category)}</div>`,iconSize:[30,30],iconAnchor:[15,15],popupAnchor:[0,-16]});
}
function pointToSegmentDistanceKm(point,a,b){
  const lat0=point.lat*Math.PI/180,xScale=111.320*Math.cos(lat0),yScale=110.574;
  const px=point.lng*xScale,py=point.lat*yScale,ax=a.lng*xScale,ay=a.lat*yScale,bx=b.lng*xScale,by=b.lat*yScale;
  const dx=bx-ax,dy=by-ay;
  if(dx===0&&dy===0)return Math.hypot(px-ax,py-ay);
  const t=Math.max(0,Math.min(1,((px-ax)*dx+(py-ay)*dy)/(dx*dx+dy*dy)));
  return Math.hypot(px-(ax+t*dx),py-(ay+t*dy));
}
function distanceToTrackKm(point,trackPoints){
  if(!trackPoints?.length)return Infinity;
  let min=Infinity;
  for(let i=1;i<trackPoints.length;i++)min=Math.min(min,pointToSegmentDistanceKm(point,trackPoints[i-1],trackPoints[i]));
  return min;
}
function stageTrackPoints(stage){
  if(!state.gpx?.points?.length||!stage?.startCoord||!stage?.endCoord)return [];
  const points=state.gpx.points;
  let si=0,ei=points.length-1,sb=Infinity,eb=Infinity;
  points.forEach((pt,i)=>{
    const ds=haversine(stage.startCoord,pt),de=haversine(stage.endCoord,pt);
    if(ds<sb){sb=ds;si=i}
    if(de<eb){eb=de;ei=i}
  });
  if(si>ei)[si,ei]=[ei,si];
  return points.slice(si,ei+1);
}
function showNearbyPlaces(stageId){
  const stage=state.stages.find(item=>item.id===stageId);
  if(!stage)return;
  const track=stageTrackPoints(stage);
  if(!track.length){alert("Für diese Etappe fehlen Start- und Zielkoordinaten.");return}
  const nearby=state.places.map(place=>({...place,distanceKm:distanceToTrackKm(place,track)}))
    .filter(place=>place.distanceKm<=5).sort((a,b)=>a.distanceKm-b.distanceKm);
  $("nearbyStageInfo").innerHTML=`<strong>${escapeHtml(stage.from)} → ${escapeHtml(stage.to)}</strong><br>${Number(stage.km||0).toFixed(1)} km`;
  $("nearbyList").innerHTML=nearby.length?nearby.map(place=>`
    <article class="nearby-row">
      <h4>${markerIcon(place.category)} ${escapeHtml(place.name)}</h4>
      <div class="nearby-distance">${place.distanceKm.toFixed(2)} km vom Etappentrack</div>
      <div class="muted">${categoryName(place.category)}${place.verified?" · selbst geprüft":""}</div>
      ${place.notes?`<p>${escapeHtml(place.notes)}</p>`:""}
      <button data-show-nearby="${place.id}" class="secondary">Auf Karte</button>
    </article>`).join(""):'<div class="empty">Keine gespeicherten Orte innerhalb von 5 km zur Etappe.</div>';
  $("nearbyDialog").showModal();
}

function renderMap(){
  if(!map||!trackLayer||!markerLayer)return;
  trackLayer.clearLayers();markerLayer.clearLayers();
  const showRoute=$("layerRoute")?.checked ?? true;
  const cats=visiblePlaceCategories();
  const verifiedOnly=$("layerVerifiedOnly")?.checked ?? false;
  if(showRoute&&state.gpx?.points?.length)L.polyline(state.gpx.points.map(p=>[p.lat,p.lng]),{weight:4}).addTo(trackLayer);
  state.places.filter(p=>cats[p.category]!==false).filter(p=>!verifiedOnly||p.verified).forEach(p=>{
    L.marker([p.lat,p.lng],{icon:createPlaceIcon(p.category)}).addTo(markerLayer)
      .bindPopup(`<strong>${escapeHtml(p.name)}</strong><br>${categoryName(p.category)}<br>${Number(p.lat).toFixed(5)}, ${Number(p.lng).toFixed(5)}${p.verified?"<br>Selbst geprüft":""}${p.notes?`<br>${escapeHtml(p.notes)}`:""}`);
  });
}
function parseGpx(text,name){
  const xml=new DOMParser().parseFromString(text,"application/xml");
  if(xml.querySelector("parsererror"))throw new Error("Ungültige GPX-Datei");
  const nodes=[...xml.querySelectorAll("trkpt, rtept")];
  const points=nodes.map(node=>({lat:Number(node.getAttribute("lat")),lng:Number(node.getAttribute("lon"))})).filter(p=>Number.isFinite(p.lat)&&Number.isFinite(p.lng));
  if(points.length<2)throw new Error("Keine Trackpunkte gefunden");
  let distance=0;
  for(let i=1;i<points.length;i++)distance+=haversine(points[i-1],points[i]);
  return {name,points,distanceKm:distance};
}
function haversine(a,b){
  const R=6371,toRad=v=>v*Math.PI/180;
  const dLat=toRad(b.lat-a.lat),dLon=toRad(b.lng-a.lng);
  const x=Math.sin(dLat/2)**2+Math.cos(toRad(a.lat))*Math.cos(toRad(b.lat))*Math.sin(dLon/2)**2;
  return 2*R*Math.asin(Math.sqrt(x));
}
function renderGpxInfo(){
  $("gpxInfo").textContent=state.gpx?`${state.gpx.name}: ${state.gpx.points.length} Trackpunkte, ca. ${state.gpx.distanceKm.toFixed(1)} km`:"Noch kein GPX-Track importiert.";
}

function bindEvents(){
  if($("sectionSearch")) $("sectionSearch").addEventListener("input",renderSections);
  if($("sectionFilter")) $("sectionFilter").addEventListener("change",renderSections);
  $("stageSection").innerHTML=state.sections.map(section=>`<option>${escapeHtml(section)}</option>`).join("");
  $("addStageBtn").addEventListener("click",()=>openStage());
  $("generateStagesBtn").addEventListener("click",generateStagesFromGpx);
  $("recalculateDatesBtn").addEventListener("click",()=>{
    recalculateDates();
    renderAll();
  });
  $("splitForm").addEventListener("submit",splitStage);
  $("deleteGeneratedBtn").addEventListener("click",()=>{
    const count=state.stages.filter(stage=>stage.generated).length;
    if(!count){alert("Keine automatisch erzeugten Etappen vorhanden.");return}
    if(confirm(`${count} automatisch erzeugte Einträge löschen?`)){
      state.stages=state.stages.filter(stage=>!stage.generated);
      save();
      renderAll();
    }
  });
  $("stageForm").addEventListener("submit",saveStage);
  $("stageSearch").addEventListener("input",renderStages);
  $("stageFilter").addEventListener("change",renderStages);
  $("stageList").addEventListener("click",event=>{
    const nearbyStage=event.target.dataset.nearbyStage,show=event.target.dataset.showStage,
      edit=event.target.dataset.editStage,
      toggle=event.target.dataset.toggleStage,
      remove=event.target.dataset.deleteStage,
      restBefore=event.target.dataset.restBefore,
      restAfter=event.target.dataset.restAfter,
      deleteRest=event.target.dataset.deleteRest,
      split=event.target.dataset.splitStage,
      merge=event.target.dataset.mergeStage;
    if(nearbyStage)showNearbyPlaces(Number(nearbyStage));
    if(show){
      const stage=state.stages.find(item=>item.id===Number(show));
      showStageOnMap(stage);
    }
    if(restBefore)insertRestDay(Number(restBefore),"before");
    if(restAfter)insertRestDay(Number(restAfter),"after");
    if(deleteRest)deleteRestDay(Number(deleteRest));
    if(split)openSplitStage(Number(split));
    if(merge)mergeWithNext(Number(merge));
    if(edit)openStage(state.stages.find(s=>s.id===Number(edit)));
    if(toggle){const stage=state.stages.find(s=>s.id===Number(toggle));stage.completed=!stage.completed;save();renderAll()}
    if(remove&&confirm("Etappe wirklich löschen?")){state.stages=state.stages.filter(s=>s.id!==Number(remove));recalculateDates();renderAll()}
  });
  $("addPlaceBtn").addEventListener("click",()=>openPlace());
  $("searchPoisBtn").addEventListener("click",searchOsmPois);
  $("importSelectedPoisBtn").addEventListener("click",importSelectedPois);
  $("centerNextStageBtn").addEventListener("click",centerMapOnNextStage);
  $("placeForm").addEventListener("submit",savePlace);
  $("placeSearch").addEventListener("input",renderPlaces);
  $("placeFilter").addEventListener("change",renderPlaces);
  $("placeList").addEventListener("click",event=>{
    const show=event.target.dataset.showPlace,edit=event.target.dataset.editPlace,remove=event.target.dataset.deletePlace;
    if(nearbyStage)showNearbyPlaces(Number(nearbyStage));
    if(show){document.querySelector('[data-page="map"]').click();setTimeout(()=>{const p=state.places.find(x=>x.id===Number(show));map.setView([p.lat,p.lng],14)},80)}
    if(edit)openPlace(state.places.find(p=>p.id===Number(edit)));
    if(remove&&confirm("Ort wirklich löschen?")){state.places=state.places.filter(p=>p.id!==Number(remove));save();renderAll()}
  });
  document.querySelectorAll("[data-close]").forEach(btn=>btn.addEventListener("click",()=>$(btn.dataset.close).close()));
  $("saveSettingsBtn").addEventListener("click",()=>{
    state.tour.name=$("tourNameInput").value.trim()||state.tour.name;
    state.tour.arrivalDate=$("arrivalInput").value;
    state.tour.startDate=$("startInput").value;
    state.tour.targetDate=$("targetInput").value;
    state.tour.restDays=Number($("restDaysInput").value||0);
    save();renderAll();
  });
  ["layerRoute","layerCamping","layerWater","layerShop","layerTransport","layerSight","layerOther","layerVerifiedOnly"].forEach(id=>{
    const el=$(id);if(el)el.addEventListener("change",renderMap);
  });
  $("nearbyList").addEventListener("click",event=>{
    const id=event.target.dataset.showNearby;if(!id)return;
    const place=state.places.find(item=>item.id===Number(id));if(!place)return;
    $("nearbyDialog").close();document.querySelector('[data-page="map"]').click();
    setTimeout(()=>{initMap();map.setView([place.lat,place.lng],15);L.marker([place.lat,place.lng],{icon:createPlaceIcon(place.category)}).addTo(map).bindPopup(`<strong>${escapeHtml(place.name)}</strong>`).openPopup()},150);
  });
  $("gpxInput").addEventListener("change",async event=>{
    const file=event.target.files[0];if(!file)return;
    try{activeStageId=null;state.gpx=parseGpx(await file.text(),file.name);save();renderAll();renderGpxInfo();initMap();renderMap()}catch(error){alert(error.message)}
  });
  $("clearGpxBtn").addEventListener("click",()=>{if(confirm("Importierten GPX-Track entfernen?")){activeStageId=null;state.gpx=null;save();renderAll();renderGpxInfo()}});
  $("showFullTrackBtn").addEventListener("click",showFullTrack);
  $("locateBtn").addEventListener("click",()=>{
    initMap();
    navigator.geolocation?.getCurrentPosition(position=>{
      const coords=[position.coords.latitude,position.coords.longitude];
      if(userMarker)userMarker.remove();
      userMarker=L.marker(coords).addTo(map).bindPopup("Meine Position").openPopup();
      map.setView(coords,14);
    },()=>alert("Position konnte nicht bestimmt werden."));
  });
  $("exportBtn").addEventListener("click",()=>{
    const link=document.createElement("a");
    link.href=URL.createObjectURL(new Blob([JSON.stringify(state,null,2)],{type:"application/json"}));
    link.download="3113-adventures-v2-backup.json";link.click();URL.revokeObjectURL(link.href);
  });
  $("importInput").addEventListener("change",async event=>{
    const file=event.target.files[0];if(!file)return;
    try{state=normalize(JSON.parse(await file.text()));save();renderAll();renderGpxInfo()}catch(e){alert("Backup konnte nicht gelesen werden.")}
  });
  $("resetBtn").addEventListener("click",()=>{if(confirm("Alle eigenen Daten und den GPX-Track löschen?")){state=clone(window.APP_DEFAULT_DATA);save();renderAll();renderGpxInfo()}});
  $("refreshBtn").addEventListener("click",async()=>{
    if("serviceWorker"in navigator){for(const reg of await navigator.serviceWorker.getRegistrations())await reg.unregister()}
    if("caches"in window){for(const name of await caches.keys())await caches.delete(name)}
    location.href="./?v=310";
  });
}
function start(){
  initNavigation();bindEvents();renderAll();renderGpxInfo();
  if("serviceWorker"in navigator)navigator.serviceWorker.register("service-worker.js?v=310");
}
document.addEventListener("DOMContentLoaded",start);
})();