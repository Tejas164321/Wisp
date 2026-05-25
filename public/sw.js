const CACHE_NAME = 'wisp-v1';

// Static assets to pre-cache on install
const PRECACHE_ASSETS = [
  '/manifest.json',
  '/icon-192.png',
  '/icon-512.png',
  '/apple-touch-icon.png',
];

// ─── Install: pre-cache static shell ───────────────────────────────────────
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(PRECACHE_ASSETS))
  );
  // Activate immediately, don't wait for old SW to die
  self.skipWaiting();
});

// ─── Activate: clean up old caches ─────────────────────────────────────────
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys
          .filter((key) => key !== CACHE_NAME)
          .map((key) => caches.delete(key))
      )
    )
  );
  self.clients.claim();
});

// ─── Push Notifications ────────────────────────────────────────────────────
self.addEventListener('push', (event) => {
  let data = {
    title: 'Wisp',
    body: 'New whisper',
    icon: '/icon-192.png',
    url: '/',
  };

  if (event.data) {
    try {
      const json = event.data.json();
      data = {
        title: json.title || data.title,
        body: json.body || data.body,
        icon: json.icon || data.icon,
        url: json.url || data.url,
      };
    } catch {
      const textBody = event.data.text();
      data.title = 'New notification';
      if (textBody) {
        data.body = textBody;
      }
    }
  }

  // Show notification only if the client isn't actively looking at the page
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((windowClients) => {
      let isFocused = false;
      for (let i = 0; i < windowClients.length; i++) {
        const windowClient = windowClients[i];
        if (windowClient.focused) {
          isFocused = true;
          break;
        }
      }

      // Only show notification if the app is NOT focused (user is away)
      if (!isFocused) {
        return self.registration.showNotification(data.title, {
          body: data.body,
          icon: data.icon,
          badge: '/favicon-32x32.png',
          vibrate: [200, 100, 200],
          data: { url: data.url },
        });
      }
    })
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((windowClients) => {
      // Check if there is already a window/tab open with the target URL
      for (let i = 0; i < windowClients.length; i++) {
        const client = windowClients[i];
        // If so, just focus it.
        if (client.url.includes(event.notification.data.url) && 'focus' in client) {
          return client.focus();
        }
      }
      // If not, then open the target URL in a new window/tab.
      if (self.clients.openWindow) {
        return self.clients.openWindow(event.notification.data.url);
      }
    })
  );
});

// ─── Fetch strategy ────────────────────────────────────────────────────────
// API / WebSocket calls: always network-only (never cache real-time data)
// Static assets (icons, fonts, CSS, JS): stale-while-revalidate
// Navigation (HTML pages): network-first with offline fallback
self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // Skip non-GET and cross-origin requests
  if (request.method !== 'GET') return;
  if (url.origin !== self.location.origin) return;

  // Skip API routes and socket paths — always live
  if (url.pathname.startsWith('/api/') || url.pathname.startsWith('/socket.io')) return;

  // Navigation requests: network-first, fallback to offline page
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request)
        .then((res) => {
          // Clone and cache successful navigation response
          const clone = res.clone();
          caches.open(CACHE_NAME).then((c) => c.put(request, clone));
          return res;
        })
        .catch(() =>
          caches.match(request).then(
            (cached) => cached || new Response(OFFLINE_HTML, {
              headers: { 'Content-Type': 'text/html' }
            })
          )
        )
    );
    return;
  }

  // Static assets: stale-while-revalidate
  event.respondWith(
    caches.match(request).then((cached) => {
      const networkFetch = fetch(request).then((res) => {
        if (res.ok) {
          const clone = res.clone();
          caches.open(CACHE_NAME).then((c) => c.put(request, clone));
        }
        return res;
      });
      return cached || networkFetch;
    })
  );
});

// ─── Offline fallback HTML ──────────────────────────────────────────────────
const OFFLINE_HTML = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Wisp — Offline</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      min-height: 100dvh;
      background: #09090B;
      color: #F4F4F5;
      font-family: system-ui, sans-serif;
      display: flex;
      align-items: center;
      justify-content: center;
      flex-direction: column;
      gap: 16px;
      text-align: center;
      padding: 24px;
    }
    .ghost { font-size: 64px; animation: float 3s ease-in-out infinite; }
    h1 { font-size: 1.25rem; font-weight: 600; color: #fff; }
    p { font-size: 0.85rem; color: #71717A; line-height: 1.6; max-width: 280px; }
    button {
      margin-top: 8px;
      padding: 10px 24px;
      border-radius: 999px;
      border: 1px solid #3f3f46;
      background: transparent;
      color: #a78bfa;
      font-size: 0.8rem;
      cursor: pointer;
      transition: background 0.2s;
    }
    button:hover { background: #18181b; }
    @keyframes float {
      0%, 100% { transform: translateY(0); }
      50% { transform: translateY(-10px); }
    }
  </style>
</head>
<body>
  <div class="ghost">👻</div>
  <h1>You're in the void</h1>
  <p>No internet connection found. Wisp needs a live connection to haunt the chat room.</p>
  <button onclick="window.location.reload()">Try again</button>
</body>
</html>`;
