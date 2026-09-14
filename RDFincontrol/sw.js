// ============================================================
// SERVICE WORKER — FinControl
// Etapa 1 MAESTRA — shell PWA, caché segura y actualización.
// ============================================================

var CACHE_PREFIX = 'fincontrol-';
var CACHE_NAME = CACHE_PREFIX + 'app-v1.5.0';

var APP_SHELL = [
  './',
  './index.html',
  './manifest.json',
  './icon-192.png',
  './icon-512.png',
  './logo-header2.png'
];

function esServicioExterno_(url) {
  return (
    url.indexOf('script.google.com') >= 0 ||
    url.indexOf('script.googleusercontent.com') >= 0 ||
    url.indexOf('googleusercontent.com') >= 0 ||
    url.indexOf('googleapis.com') >= 0
  );
}

function esRecursoExternoNoEsencial_(url) {
  return (
    url.indexOf('cdn.jsdelivr.net') >= 0 ||
    url.indexOf('cdnjs.cloudflare.com') >= 0 ||
    url.indexOf('fonts.googleapis.com') >= 0 ||
    url.indexOf('fonts.gstatic.com') >= 0
  );
}

self.addEventListener('install', function(event) {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(function(cache) {
        return cache.addAll(APP_SHELL);
      })
      .then(function() {
        return self.skipWaiting();
      })
  );
});

self.addEventListener('activate', function(event) {
  event.waitUntil(
    caches.keys()
      .then(function(keys) {
        return Promise.all(
          keys
            .filter(function(key) {
              return key.indexOf(CACHE_PREFIX) === 0 && key !== CACHE_NAME;
            })
            .map(function(key) {
              return caches.delete(key);
            })
        );
      })
      .then(function() {
        return self.clients.claim();
      })
  );
});

self.addEventListener('fetch', function(event) {
  var request = event.request;

  if (request.method !== 'GET') return;

  var url = request.url;

  // Datos financieros / Google Apps Script: siempre red.
  // Nunca devolver una respuesta API antigua desde Cache Storage.
  if (esServicioExterno_(url)) return;

  // Dependencias CDN no forman parte del shell offline.
  if (esRecursoExternoNoEsencial_(url)) return;

  // HTML / navegación: Network First con shell como respaldo.
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request)
        .then(function(response) {
          if (response && response.ok) {
            var copy = response.clone();
            caches.open(CACHE_NAME).then(function(cache) {
              cache.put('./index.html', copy);
            });
          }
          return response;
        })
        .catch(function() {
          return caches.match('./index.html').then(function(cached) {
            return cached || caches.match('./');
          });
        })
    );
    return;
  }

  // Recursos propios: respuesta inmediata desde caché y actualización silenciosa.
  if (new URL(request.url).origin === self.location.origin) {
    event.respondWith(
      caches.open(CACHE_NAME).then(function(cache) {
        return cache.match(request).then(function(cached) {
          var network = fetch(request)
            .then(function(response) {
              if (response && response.ok) {
                cache.put(request, response.clone());
              }
              return response;
            })
            .catch(function() {
              return cached;
            });

          return cached || network;
        });
      })
    );
  }
});

self.addEventListener('message', function(event) {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});

// ============================================================
// NOTIFICACIONES
// ============================================================

self.addEventListener('push', function(event) {
  var data = {};

  try {
    data = event.data ? event.data.json() : {};
  } catch (err) {}

  var title = data.title || 'FinControl';

  var options = {
    body: data.body || 'Tienes cobros pendientes para hoy.',
    icon: './icon-192.png',
    badge: './icon-192.png',
    tag: data.tag || 'fincontrol-cobro',
    data: { url: data.url || './' },
    actions: [
      { action: 'ver', title: 'Ver deudores' },
      { action: 'cerrar', title: 'Cerrar' }
    ],
    requireInteraction: true
  };

  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener('notificationclick', function(event) {
  event.notification.close();

  if (event.action === 'cerrar') return;

  var url = (event.notification.data && event.notification.data.url) || './';

  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true })
      .then(function(clientList) {
        for (var i = 0; i < clientList.length; i++) {
          var client = clientList[i];

          if (client.focus) {
            return client.focus().then(function() {
              if (client.navigate) return client.navigate(url);
            });
          }
        }

        return clients.openWindow(url);
      })
  );
});

// ============================================================
// BACKGROUND SYNC
// ============================================================

self.addEventListener('sync', function(event) {
  if (event.tag === 'check-cobros') {
    event.waitUntil(checkCobrosManana());
  }
});

function checkCobrosManana() {
  return self.clients.matchAll().then(function(clientList) {
    if (clientList.length > 0) {
      clientList[0].postMessage({ tipo: 'CHECK_COBROS' });
    }
  });
}
