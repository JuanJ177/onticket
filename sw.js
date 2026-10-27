/* ========================================
   SERVICE WORKER (PWA)
   - Permite instalar la web como app (Android e iPhone).
   - Estrategia "red primero": siempre muestra la versión más nueva
     y, si no hay internet, usa la última copia guardada.
   - No guarda las descargas grandes (APK, video) ni Firebase.
======================================== */

const CACHE = "onticket-v6";

const BASICOS = [
    "./",
    "index.html",
    "style.css",
    "planos.css",
    "firebase-config.js",
    "data.js",
    "planos.js",
    "core.js",
    "db.js",
    "script.js",
    "admin.js",
    "img/logo.png",
    "img/icon-192.png"
];

self.addEventListener("install", e => {

    e.waitUntil(caches.open(CACHE).then(c => c.addAll(BASICOS)).catch(() => {}));

    self.skipWaiting();
});

self.addEventListener("activate", e => {

    e.waitUntil(
        caches.keys().then(claves => Promise.all(claves.filter(k => k !== CACHE).map(k => caches.delete(k))))
    );

    self.clients.claim();
});

self.addEventListener("fetch", e => {

    const url = new URL(e.request.url);

    // solo archivos propios; nada de Firebase, APK, video ni la app (app/)
    if(e.request.method !== "GET" || url.origin !== location.origin) return;

    if(/\.(apk|mp4)$/.test(url.pathname) || url.pathname.includes("/app/")) return;

    e.respondWith(
        fetch(e.request)
            .then(resp => {

                if(resp.ok){

                    const copia = resp.clone();

                    caches.open(CACHE).then(c => c.put(e.request, copia));
                }

                return resp;
            })
            .catch(() => caches.match(e.request, { ignoreSearch: true }).then(r => r || caches.match("index.html")))
    );
});
