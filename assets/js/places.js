const STORAGE_PREFIX="3113-v4-places:";

function key(tourId){
  return `${STORAGE_PREFIX}${tourId}`;
}

export function loadPlacesLocal(tourId){
  try{
    const raw=localStorage.getItem(key(tourId));
    if(!raw) return [];
    const places=JSON.parse(raw);
    return Array.isArray(places)?places:[];
  }catch(error){
    console.error("Orte konnten nicht geladen werden:",error);
    return [];
  }
}

export function savePlacesLocal(tourId,places){
  const compact=places.map(place=>({
    id:place.id,
    tourId,
    stageId:place.stageId||"",
    osmType:place.osmType||"",
    osmId:place.osmId||"",
    name:place.name||"Unbenannter Ort",
    category:place.category||"other",
    lat:Number(place.lat),
    lng:Number(place.lng),
    distanceKm:Number(place.distanceKm||0),
    tags:place.tags||{},
    savedAt:place.savedAt||new Date().toISOString()
  }));

  const serialized=JSON.stringify(compact);
  localStorage.setItem(key(tourId),serialized);

  const check=localStorage.getItem(key(tourId));
  if(check!==serialized) throw new Error("Orte konnten nicht verifiziert werden.");

  return compact;
}

export function addPlaceLocal(tourId,place){
  const places=loadPlacesLocal(tourId);
  const duplicate=places.find(item =>
    (place.osmType&&place.osmId&&item.osmType===place.osmType&&item.osmId===place.osmId) ||
    (Math.abs(item.lat-place.lat)<0.00001 && Math.abs(item.lng-place.lng)<0.00001 && item.name===place.name)
  );

  if(duplicate) return places;

  places.push({
    ...place,
    id:place.id||`place-${Date.now()}-${Math.random().toString(36).slice(2,7)}`,
    tourId,
    savedAt:new Date().toISOString()
  });

  return savePlacesLocal(tourId,places);
}

export function deletePlaceLocal(tourId,placeId){
  const places=loadPlacesLocal(tourId).filter(place=>place.id!==placeId);
  savePlacesLocal(tourId,places);
  return places;
}

function pointToSegmentDistanceKm(point,a,b){
  const lat0=point.lat*Math.PI/180;
  const xScale=111.320*Math.cos(lat0);
  const yScale=110.574;

  const px=point.lng*xScale, py=point.lat*yScale;
  const ax=a.lng*xScale, ay=a.lat*yScale;
  const bx=b.lng*xScale, by=b.lat*yScale;

  const dx=bx-ax, dy=by-ay;
  if(dx===0&&dy===0) return Math.hypot(px-ax,py-ay);

  const t=Math.max(0,Math.min(1,((px-ax)*dx+(py-ay)*dy)/(dx*dx+dy*dy)));
  const cx=ax+t*dx, cy=ay+t*dy;
  return Math.hypot(px-cx,py-cy);
}

export function distanceToStageKm(point,stagePoints){
  if(!Array.isArray(stagePoints)||stagePoints.length<2) return Infinity;
  let min=Infinity;
  for(let i=1;i<stagePoints.length;i++){
    min=Math.min(min,pointToSegmentDistanceKm(point,stagePoints[i-1],stagePoints[i]));
  }
  return min;
}

export function buildOverpassQuery(bounds,category){
  const [south,west,north,east]=bounds;
  const bbox=`${south},${west},${north},${east}`;

  const filters={
    camping:[
      'nwr["tourism"="camp_site"]',
      'nwr["tourism"="caravan_site"]',
      'nwr["tourism"="wilderness_hut"]',
      'nwr["tourism"="alpine_hut"]'
    ],
    water:[
      'nwr["amenity"="drinking_water"]',
      'nwr["natural"="spring"]'
    ],
    shop:[
      'nwr["shop"="supermarket"]',
      'nwr["shop"="convenience"]',
      'nwr["shop"="bakery"]'
    ],
    transport:[
      'nwr["railway"="station"]',
      'nwr["railway"="halt"]',
      'nwr["highway"="bus_stop"]'
    ],
    food:[
      'nwr["amenity"="restaurant"]',
      'nwr["amenity"="cafe"]',
      'nwr["amenity"="fast_food"]'
    ],
    toilet:[
      'nwr["amenity"="toilets"]'
    ]
  };

  const items=filters[category]||[];
  return `[out:json][timeout:20];(${items.map(item=>`${item}(${bbox});`).join("")});out center tags;`;
}

export function boundsForStage(points,paddingKm=2){
  const lats=points.map(point=>point.lat);
  const lngs=points.map(point=>point.lng);

  const south=Math.min(...lats);
  const north=Math.max(...lats);
  const west=Math.min(...lngs);
  const east=Math.max(...lngs);

  const latPad=paddingKm/111;
  const midLat=(south+north)/2;
  const lngPad=paddingKm/(111*Math.cos(midLat*Math.PI/180));

  return [
    south-latPad,
    west-lngPad,
    north+latPad,
    east+lngPad
  ];
}

export function normalizeOverpassElement(element,category){
  const lat=Number(element.lat ?? element.center?.lat);
  const lng=Number(element.lon ?? element.center?.lon);
  if(!Number.isFinite(lat)||!Number.isFinite(lng)) return null;

  const tags=element.tags||{};
  return {
    osmType:element.type,
    osmId:String(element.id),
    name:tags.name||tags["name:de"]||tags.operator||"Unbenannter Ort",
    category,
    lat,
    lng,
    tags
  };
}
