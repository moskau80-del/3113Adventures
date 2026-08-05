function haversine(a,b){
  const radius=6371;
  const toRad=(value)=>value*Math.PI/180;
  const dLat=toRad(b.lat-a.lat);
  const dLon=toRad(b.lng-a.lng);
  const value=
    Math.sin(dLat/2)**2+
    Math.cos(toRad(a.lat))*Math.cos(toRad(b.lat))*Math.sin(dLon/2)**2;
  return 2*radius*Math.asin(Math.sqrt(value));
}

export function parseGpx(text,fileName="track.gpx"){
  const xml=new DOMParser().parseFromString(text,"application/xml");

  if(xml.querySelector("parsererror")){
    throw new Error("Die GPX-Datei ist ungültig.");
  }

  const nodes=[...xml.querySelectorAll("trkpt, rtept")];
  const points=nodes.map((node)=>({
    lat:Number(node.getAttribute("lat")),
    lng:Number(node.getAttribute("lon")),
    elevation:Number(node.querySelector("ele")?.textContent||0)
  })).filter((point)=>Number.isFinite(point.lat)&&Number.isFinite(point.lng));

  if(points.length<2){
    throw new Error("Die GPX-Datei enthält zu wenige Trackpunkte.");
  }

  let distanceKm=0;
  for(let index=1;index<points.length;index++){
    distanceKm+=haversine(points[index-1],points[index]);
  }

  return {
    name:fileName,
    points,
    distanceKm,
    originalText:text,
    importedAt:new Date().toISOString()
  };
}

export function createPreviewSvg(points){
  if(!points?.length) return "";

  const width=800;
  const height=280;
  const padding=20;

  const lats=points.map((point)=>point.lat);
  const lngs=points.map((point)=>point.lng);
  const minLat=Math.min(...lats),maxLat=Math.max(...lats);
  const minLng=Math.min(...lngs),maxLng=Math.max(...lngs);

  const latRange=maxLat-minLat||1;
  const lngRange=maxLng-minLng||1;

  const coordinates=points.map((point)=>{
    const x=padding+((point.lng-minLng)/lngRange)*(width-padding*2);
    const y=height-padding-((point.lat-minLat)/latRange)*(height-padding*2);
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  }).join(" ");

  return `<svg viewBox="0 0 ${width} ${height}" role="img" aria-label="GPX-Trackvorschau">
    <rect width="${width}" height="${height}" fill="#eef1eb"/>
    <polyline points="${coordinates}" fill="none" stroke="#41513d" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"/>
    <circle cx="${coordinates.split(" ")[0].split(",")[0]}" cy="${coordinates.split(" ")[0].split(",")[1]}" r="6" fill="#2f7d32"/>
    <circle cx="${coordinates.split(" ").at(-1).split(",")[0]}" cy="${coordinates.split(" ").at(-1).split(",")[1]}" r="6" fill="#a44339"/>
  </svg>`;
}
