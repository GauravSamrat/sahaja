'use strict';
const scope = self.registration.scope;
const prefix = 'sahaja-shell:'+scope+':';
const cacheName = prefix+'3';
const resources = ['./','index.html','style.css','app.js','model.js','repository.js','manifest.json','icon-192.png','icon-512.png'];
const urls = new Set(resources.map(path=>new URL(path,scope).href));
self.addEventListener('install', event=>{
  event.waitUntil(caches.open(cacheName).then(cache=>cache.addAll(resources.map(path=>new Request(path,{cache:'reload'})))));
});
self.addEventListener('activate', event=>{
  event.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(key=>
    key!==cacheName&&(key.startsWith(prefix)||['sahaja-1','sahaja-shell-2'].includes(key)))
    .map(key=>caches.delete(key)))));
});
self.addEventListener('fetch', event=>{
  const request=event.request;
  if(request.method!=='GET') return;
  const url=new URL(request.url);
  url.search='';
  url.hash='';
  if(!urls.has(url.href)) return;
  event.respondWith(caches.open(cacheName).then(async cache=>
    await cache.match(url.href) || fetch(request)));
});
