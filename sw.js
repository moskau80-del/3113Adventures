const CACHE="3113-adventures-v4-sprint-5-2-1";
const FILES=[
  "./?v=40521","./index.html","./assets/css/app.css?v=40521",
  "./assets/js/app.js?v=40521","./assets/js/database.js?v=40521",
  "./assets/js/i18n.js?v=40521","./assets/js/gpx.js?v=40521",
  "./assets/js/stages.js?v=40521","./lang/de.json?v=40521",
  "./lang/en.json?v=40521","./manifest.webmanifest","./icons/icon.svg"
];

self.addEventListener("install",(event)=>{
  self.skipWaiting();
  event.waitUntil(caches.open(CACHE).then((cache)=>cache.addAll(FILES)));
});

self.addEventListener("activate",(event)=>{
  event.waitUntil(
    caches.keys()
      .then((keys)=>Promise.all(
        keys.filter((key)=>key!==CACHE).map((key)=>caches.delete(key))
      ))
      .then(()=>self.clients.claim())
  );
});

self.addEventListener("fetch",(event)=>{
  if(event.request.method!=="GET") return;

  event.respondWith(
    fetch(event.request)
      .then((response)=>{
        const copy=response.clone();
        caches.open(CACHE).then((cache)=>cache.put(event.request,copy));
        return response;
      })
      .catch(()=>caches.match(event.request).then(
        (hit)=>hit||caches.match("./index.html")
      ))
  );
});
