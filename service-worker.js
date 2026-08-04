const CACHE_NAME="3113-v13";
const LOCAL=["./?v=13","./index.html","./styles.css?v=13","./data.js?v=13","./app.js?v=13","./manifest.webmanifest","./icons/icon.svg"];
self.addEventListener("install",event=>{self.skipWaiting();event.waitUntil(caches.open(CACHE_NAME).then(cache=>cache.addAll(LOCAL)))});
self.addEventListener("activate",event=>{event.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(k=>k!==CACHE_NAME).map(k=>caches.delete(k)))).then(()=>self.clients.claim()))});
self.addEventListener("fetch",event=>{
 event.respondWith(fetch(event.request).then(response=>{
   const copy=response.clone();caches.open(CACHE_NAME).then(cache=>cache.put(event.request,copy));return response;
 }).catch(()=>caches.match(event.request)));
});
