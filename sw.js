const CACHE="3113-adventures-v4-sprint-7-4";
const FILES=[
  "./?v=4074","./index.html","./assets/css/app.css?v=4074",
  "./assets/js/app.js?v=4074","./assets/js/database.js?v=4074",
  "./assets/js/i18n.js?v=4074","./assets/js/gpx.js?v=4074",
  "./assets/js/stages.js?v=4074","./assets/js/places.js?v=4074",
  "./lang/de.json?v=4074","./lang/en.json?v=4074",
  "./manifest.webmanifest","./icons/icon.svg"
];
self.addEventListener("install",e=>{self.skipWaiting();e.waitUntil(caches.open(CACHE).then(c=>c.addAll(FILES)))});
self.addEventListener("activate",e=>{e.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(k=>k!==CACHE).map(k=>caches.delete(k)))).then(()=>self.clients.claim()))});
self.addEventListener("fetch",e=>{if(e.request.method!=="GET")return;e.respondWith(fetch(e.request).then(r=>{const copy=r.clone();caches.open(CACHE).then(c=>c.put(e.request,copy));return r}).catch(()=>caches.match(e.request).then(hit=>hit||caches.match("./index.html"))))});
