const CACHE="3113-adventures-v4-sprint-10-0-2";
const FILES=[
  "./?v=41002","./index.html","./assets/css/app.css?v=41002",
  "./assets/js/app.js?v=41002","./assets/js/database.js?v=41002",
  "./assets/js/i18n.js?v=41002","./assets/js/gpx.js?v=41002",
  "./assets/js/stages.js?v=41002","./assets/js/places.js?v=41002",
  "./assets/js/gear.js?v=41002","./lang/de.json?v=41002",
  "./lang/en.json?v=41002","./manifest.webmanifest","./icons/icon-192.png","./icons/icon-512.png","./icons/icon.svg"
];
self.addEventListener("install",e=>{self.skipWaiting();e.waitUntil(caches.open(CACHE).then(c=>c.addAll(FILES)))});
self.addEventListener("activate",e=>{e.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(k=>k!==CACHE).map(k=>caches.delete(k)))).then(()=>self.clients.claim()))});
self.addEventListener("fetch",e=>{if(e.request.method!=="GET")return;e.respondWith(fetch(e.request).then(r=>{const copy=r.clone();caches.open(CACHE).then(c=>c.put(e.request,copy));return r}).catch(()=>caches.match(e.request).then(hit=>hit||caches.match("./index.html"))))});
