const C='money-v1',F=['./','index.html','style.css','app.js','chart.umd.js','manifest.json','icon.svg'];
addEventListener('install',e=>e.waitUntil(caches.open(C).then(c=>c.addAll(F)).then(()=>skipWaiting())));
addEventListener('activate',e=>e.waitUntil(caches.keys().then(k=>Promise.all(k.filter(x=>x!==C).map(x=>caches.delete(x))))));
addEventListener('fetch',e=>{if(e.request.method==='GET'&&new URL(e.request.url).origin===location.origin)e.respondWith(caches.match(e.request).then(r=>r||fetch(e.request)))});
