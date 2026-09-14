// ============================================================
// SERVICE WORKER — FinControl
// Caché PWA + actualizaciones + notificaciones
// ============================================================

var CACHE_NAME = 'fincontrol-v1.6.2';

var ASSETS = [
  './',
  './manifest.json',
  './app-icon-192.png',
  './app-icon-512.png',
  './brand-login.png'
];


// ============================================================
// INSTALL
// ============================================================

self.addEventListener('install', function(e) {

  e.waitUntil(

    caches.open(CACHE_NAME).then(function(cache) {

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


// ============================================================
// ACTIVATE
// Eliminar versiones antiguas
// ============================================================

self.addEventListener('activate', function(e) {

  e.waitUntil(

    caches.keys().then(function(keys) {

      return Promise.all(

        keys
          .filter(function(key) {
            return key !== CACHE_NAME;
          })
          .map(function(key) {
            return caches.delete(key);
          })

      );

    }).then(function() {

      return self.clients.claim();

    })

  );

});


// ============================================================
// FETCH
// ============================================================

self.addEventListener('fetch', function(e) {

  if (e.request.method !== 'GET') {
    return;
  }

  var url = e.request.url;


  // ----------------------------------------------------------
  // NO CACHEAR SERVICIOS EXTERNOS
  // ----------------------------------------------------------

  if (
    url.indexOf('script.google.com') >= 0 ||
    url.indexOf('googleusercontent.com') >= 0 ||
    url.indexOf('googleapis.com') >= 0 ||
    url.indexOf('cdn.jsdelivr.net') >= 0 ||
    url.indexOf('cdnjs.cloudflare.com') >= 0 ||
    url.indexOf('fonts.googleapis.com') >= 0 ||
    url.indexOf('fonts.gstatic.com') >= 0
  ) {
    return;
  }


  // ----------------------------------------------------------
  // HTML / NAVEGACIÓN
  // NETWORK FIRST
  //
  // Siempre intenta traer la última versión.
  // Si no hay conexión, usa caché.
  // ----------------------------------------------------------

  if (e.request.mode === 'navigate') {

    e.respondWith(

      fetch(e.request)

        .then(function(response) {

          if (response && response.status === 200) {

            var copia = response.clone();

            caches.open(CACHE_NAME).then(function(cache) {
              cache.put(e.request, copia);
            });

          }

          return response;

        })

        .catch(function() {

          return caches.match(e.request).then(function(cached) {

            if (cached) {
              return cached;
            }

            return caches.match('./');

          });

        })

    );

    return;

  }


  // ----------------------------------------------------------
  // ARCHIVOS ESTÁTICOS
  // CACHE FIRST + actualización en segundo plano
  // ----------------------------------------------------------

  e.respondWith(

    caches.open(CACHE_NAME).then(function(cache) {

      return cache.match(e.request).then(function(cached) {

        var fetchPromise = fetch(e.request)

          .then(function(response) {

            if (response && response.status === 200) {

              cache.put(
                e.request,
                response.clone()
              );

            }

            return response;

          })

          .catch(function() {

            return cached;

          });


        return cached || fetchPromise;

      });

    })

  );

});


// ============================================================
// PUSH
// ============================================================

self.addEventListener('push', function(e) {

  var data = {};

  try {
    data = e.data.json();
  } catch(err) {}


  var title =
    data.title ||
    'FinControl';


  var options = {

    body:
      data.body ||
      'Tienes cobros pendientes para hoy.',

    icon:
      './app-icon-192.png',

    badge:
      './app-icon-192.png',

    tag:
      data.tag ||
      'fincontrol-cobro',

    data: {
      url:
        data.url ||
        './'
    },

    actions: [

      {
        action: 'ver',
        title: 'Ver deudores'
      },

      {
        action: 'cerrar',
        title: 'Cerrar'
      }

    ],

    requireInteraction: true

  };


  e.waitUntil(

    self.registration.showNotification(
      title,
      options
    )

  );

});


// ============================================================
// CLICK EN NOTIFICACIÓN
// ============================================================

self.addEventListener('notificationclick', function(e) {

  e.notification.close();


  if (e.action === 'cerrar') {
    return;
  }


  var url =

    (
      e.notification.data &&
      e.notification.data.url
    )

    || './';


  e.waitUntil(

    clients.matchAll({

      type: 'window',

      includeUncontrolled: true

    }).then(function(clientList) {


      for (
        var i = 0;
        i < clientList.length;
        i++
      ) {

        var client =
          clientList[i];


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


// ============================================================
// BACKGROUND SYNC
// ============================================================

self.addEventListener('sync', function(e) {

  if (e.tag === 'check-cobros') {

    e.waitUntil(
      checkCobrosManana()
    );

  }

});


function checkCobrosManana() {

  return self.clients
    .matchAll()
    .then(function(clientList) {

      if (clientList.length > 0) {

        clientList[0].postMessage({
          tipo: 'CHECK_COBROS'
        });

      }

    });

}
