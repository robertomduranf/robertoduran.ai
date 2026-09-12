// ============================================================
//  SERVICE WORKER — Alfajores con Amor PWA
//  Maneja caché offline + notificaciones de cobro
// ============================================================

var CACHE_NAME = 'aca-V.a 1.1';
var ASSETS = [
  './',
  './AlfajoresConAmor_Control.html',
  './manifest.json',
  './icon-192.png',
  './icon-512.png',
  './logo.png'
];

// ===== INSTALL: cachear archivos =====
self.addEventListener('install', function(e) {
  e.waitUntil(
    caches.open(CACHE_NAME).then(function(cache) {
      // Solo cachear assets locales uno a uno para evitar fallos
      var promises = ASSETS.map(function(url) {
        return cache.add(url).catch(function(err) {
          console.warn('Cache skip:', url, err);
        });
      });
      return Promise.all(promises);
    }).then(function() {
      return self.skipWaiting();
    })
  );
});

// ===== ACTIVATE: limpiar cachés viejos =====
self.addEventListener('activate', function(e) {
  e.waitUntil(
    caches.keys().then(function(keys) {
      return Promise.all(
        keys.filter(function(k) { return k !== CACHE_NAME; })
            .map(function(k) { return caches.delete(k); })
      );
    }).then(function() {
      return self.clients.claim();
    })
  );
});

// ===== FETCH: servir desde caché, actualizar en background =====
self.addEventListener('fetch', function(e) {
  if (e.request.method !== 'GET') return;
  // No cachear URLs externas (Google, CDN, etc.)
  var url = e.request.url;
  if (url.indexOf('script.google.com') >= 0 ||
      url.indexOf('googleusercontent.com') >= 0 ||
      url.indexOf('googleapis.com') >= 0 ||
      url.indexOf('cdn.jsdelivr.net') >= 0 ||
      url.indexOf('cdnjs.cloudflare.com') >= 0) return;

  e.respondWith(
    caches.open(CACHE_NAME).then(function(cache) {
      return cache.match(e.request).then(function(cached) {
        var fetchPromise = fetch(e.request).then(function(response) {
          if (response && response.status === 200) {
            cache.put(e.request, response.clone());
          }
          return response;
        }).catch(function() { return cached; });
        return cached || fetchPromise;
      });
    })
  );
});

// ===== NOTIFICACIONES PUSH =====
self.addEventListener('push', function(e) {
  var data = {};
  try { data = e.data.json(); } catch(err) {}
  
  var title = data.title || 'Alfajores con Amor';
  var options = {
    body: data.body || 'Tienes cobros pendientes para hoy.',
    icon: './icon-192.png',
    badge: './icon-192.png',
    tag: data.tag || 'aca-cobro',
    data: { url: data.url || './AlfajoresConAmor_Control.html' },
    actions: [
      { action: 'ver', title: 'Ver deudores' },
      { action: 'cerrar', title: 'Cerrar' }
    ],
    requireInteraction: true
  };
  
  e.waitUntil(self.registration.showNotification(title, options));
});

// ===== CLICK EN NOTIFICACIÓN =====
self.addEventListener('notificationclick', function(e) {
  e.notification.close();
  if (e.action === 'cerrar') return;
  
  var url = (e.notification.data && e.notification.data.url) || './AlfajoresConAmor_Control.html';
  
  e.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then(function(clientList) {
      for (var i = 0; i < clientList.length; i++) {
        var client = clientList[i];
        if (client.focus) {
          client.focus();
          client.navigate(url);
          return;
        }
      }
      return clients.openWindow(url);
    })
  );
});

// ===== VERIFICACIÓN DIARIA DE COBROS (Background Sync) =====
self.addEventListener('sync', function(e) {
  if (e.tag === 'check-cobros') {
    e.waitUntil(checkCobrosManana());
  }
});

function checkCobrosManana() {
  // Lee los deudores del cliente via mensaje
  return self.clients.matchAll().then(function(clientList) {
    if (clientList.length > 0) {
      clientList[0].postMessage({ tipo: 'CHECK_COBROS' });
    }
  });
}
