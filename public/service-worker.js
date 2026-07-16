// Service Worker para PWA
// Este archivo permite que la aplicación funcione offline y se pueda instalar como app

const CACHE_NAME = 'crece-mas-v1';
const urlsToCache = [
  '/',
  '/index.html',
  '/static/js/bundle.js',
  '/static/css/main.css',
  '/logo192.png',
  '/logo512.png',
  '/manifest.json'
];

// Instalación del Service Worker
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => {
        console.log('Service Worker: Cache abierto');
        return cache.addAll(urlsToCache);
      })
      .catch((error) => {
        console.error('Service Worker: Error al cachear', error);
      })
  );
  self.skipWaiting(); // Activar inmediatamente
});

// Activación del Service Worker
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((cacheName) => {
          if (cacheName !== CACHE_NAME) {
            console.log('Service Worker: Eliminando cache antiguo', cacheName);
            return caches.delete(cacheName);
          }
        })
      );
    })
  );
  return self.clients.claim(); // Tomar control inmediatamente
});

// Interceptar peticiones
self.addEventListener('fetch', (event) => {
  // Solo interceptar peticiones GET (las APIs y peticiones de analíticas usan POST/PUT/etc. y no deben ser interceptadas)
  if (event.request.method !== 'GET') {
    return;
  }

  // Estrategia: Network First, luego Cache
  event.respondWith(
    fetch(event.request)
      .then((response) => {
        // Si la petición es exitosa, clonar y guardar en cache
        if (response && response.status === 200) {
          const responseToCache = response.clone();
          caches.open(CACHE_NAME).then((cache) => {
            // Solo cachear GET requests
            if (event.request.method === 'GET') {
              cache.put(event.request, responseToCache);
            }
          });
        }
        return response;
      })
      .catch(() => {
        // Si falla la red, intentar desde cache
        return caches.match(event.request).then((response) => {
          if (response) {
            return response;
          }
          // Si no hay en cache y es una navegación, devolver index.html
          if (event.request.mode === 'navigate') {
            return caches.match('/index.html');
          }
        });
      })
  );
});

// Manejar mensajes del cliente
self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});
