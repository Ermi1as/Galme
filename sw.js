const CACHE_NAME = 'bookkeeping-ledger-v56';
const ASSETS = [
  './',
  './index.html',
  './manifest.json',
  './icon-192.png',
  './icon-512.png',
  './screenshot-mobile.png',
  './screenshot-wide.png',
  './widgets/balance-template.json',
  './widgets/balance-data.json'
];

const WIDGET_CACHE = 'galmee-widget-v1';
const WIDGET_DATA_URL = './__widget-data';
const WIDGET_TAG = 'galmee-balance';

self.addEventListener('install', (event) => {
  self.skipWaiting();
  event.waitUntil(caches.open(CACHE_NAME).then((cache) =>
    // Cache each asset separately so one missing file can never break installation
    Promise.all(ASSETS.map((a) => cache.add(a).catch(() => {})))
  ));
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_NAME && k !== WIDGET_CACHE).map((k) => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.hostname.endsWith('supabase.co') || url.hostname === 'api.emailjs.com') return;
  if (url.origin !== self.location.origin) return;

  // Pages: network-first so users always get the latest app, cached copy when offline.
  if (req.mode === 'navigate') {
    event.respondWith(
      fetch(req).then((res) => {
        if (res && res.status === 200) {
          const clone = res.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put('./index.html', clone));
        }
        return res;
      }).catch(() => caches.match('./index.html'))
    );
    return;
  }

  // Static assets: cache-first, refreshed in the background.
  event.respondWith(
    caches.match(req).then((cached) => {
      const network = fetch(req).then((res) => {
        if (res && res.status === 200 && res.type === 'basic') {
          const clone = res.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(req, clone));
        }
        return res;
      }).catch(() => cached);
      return cached || network;
    })
  );
});

// ------------------------------------------------------------------
// Messaging helpers
// ------------------------------------------------------------------
async function notifyClients(message) {
  const all = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
  all.forEach((c) => c.postMessage(message));
  return all.length;
}

async function openApp(url) {
  const all = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
  if (all.length) {
    const c = all[0];
    if ('focus' in c) await c.focus();
    if (url && 'navigate' in c) { try { await c.navigate(url); } catch (_) {} }
    return;
  }
  await self.clients.openWindow(url || './index.html');
}

// ------------------------------------------------------------------
// Background Sync: retry queued offline changes once connectivity returns.
// Data lives in the page's localStorage, so the sync itself runs in the page.
// ------------------------------------------------------------------
self.addEventListener('sync', (event) => {
  if (event.tag === 'galmee-sync') {
    event.waitUntil(notifyClients({ type: 'RUN_SYNC' }));
  }
});

// ------------------------------------------------------------------
// Periodic Background Sync: keep the app shell fresh and ask open windows to sync.
// ------------------------------------------------------------------
self.addEventListener('periodicsync', (event) => {
  if (event.tag === 'galmee-refresh') {
    event.waitUntil((async () => {
      try {
        const cache = await caches.open(CACHE_NAME);
        await Promise.all(ASSETS.map((a) => fetch(a, { cache: 'no-cache' }).then((r) => r.ok && cache.put(a, r)).catch(() => {})));
      } catch (_) {}
      await notifyClients({ type: 'RUN_SYNC' });
      await updateWidgets();
    })());
  } else if (event.tag === WIDGET_TAG) {
    event.waitUntil(updateWidgets());
  }
});

// ------------------------------------------------------------------
// Push notifications (payload: { title, body, url, tag })
// ------------------------------------------------------------------
self.addEventListener('push', (event) => {
  let data = {};
  try { data = event.data ? event.data.json() : {}; } catch (_) { data = { body: event.data ? event.data.text() : '' }; }
  const title = data.title || 'Bookkeeping Ledger';
  event.waitUntil(self.registration.showNotification(title, {
    body: data.body || '',
    icon: './icon-192.png',
    badge: './icon-192.png',
    tag: data.tag || 'galmee-general',
    data: { url: data.url || './index.html' }
  }));
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  event.waitUntil(openApp((event.notification.data && event.notification.data.url) || './index.html'));
});

// ------------------------------------------------------------------
// Windows 11 widget (Adaptive Card) — data snapshot is written by the page
// ------------------------------------------------------------------
async function updateWidgets() {
  if (!self.widgets) return;
  const widget = await self.widgets.getByTag(WIDGET_TAG);
  if (!widget) return;
  const template = await (await fetch('./widgets/balance-template.json')).text();
  let data = await (await caches.open(WIDGET_CACHE)).match(WIDGET_DATA_URL);
  data = data ? await data.text() : await (await fetch('./widgets/balance-data.json')).text();
  await self.widgets.updateByTag(WIDGET_TAG, { template, data });
}

if (self.widgets) {
  self.addEventListener('widgetinstall', (event) => {
    event.waitUntil((async () => {
      await updateWidgets();
      if (self.registration.periodicSync) {
        try { await self.registration.periodicSync.register(WIDGET_TAG, { minInterval: 3600 * 1000 }); } catch (_) {}
      }
    })());
  });
  self.addEventListener('widgetresume', (event) => event.waitUntil(updateWidgets()));
  self.addEventListener('widgetuninstall', (event) => {
    event.waitUntil((async () => {
      if (self.registration.periodicSync) {
        try { await self.registration.periodicSync.unregister(WIDGET_TAG); } catch (_) {}
      }
    })());
  });
  self.addEventListener('widgetclick', (event) => {
    if (event.action === 'add') event.waitUntil(openApp('./index.html?action=new'));
  });
}

self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'WIDGET_REFRESH') event.waitUntil(updateWidgets());
});
