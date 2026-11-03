/*
 * HireSmart AI — service worker.
 *
 * Deliberately conservative:
 *   · Caches only immutable same-origin static assets (hashed Vite bundles,
 *     icons, fonts, images) using stale-while-revalidate, so repeat visits
 *     open instantly.
 *   · Never caches navigations — the HTML always comes from the network, so
 *     a deploy can never leave a client on a stale app shell.
 *   · Never touches /api — hiring data is live and must never come from a
 *     cache.
 *
 * Registered from main.jsx in production only.
 */

const ASSET_CACHE = "hiresmart-assets-v1";
const ASSET_PATTERN =
  /\.(png|jpe?g|webp|svg|ico|css|js|woff2?|webmanifest)$/i;

self.addEventListener("install", () => self.skipWaiting());

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys.filter((key) => key.startsWith("hiresmart-") && key !== ASSET_CACHE).map((key) => caches.delete(key)),
        ),
      )
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;
  if (url.pathname.startsWith("/api")) return;
  if (!ASSET_PATTERN.test(url.pathname)) return;

  event.respondWith(
    caches.match(request).then((cached) => {
      const network = fetch(request)
        .then((response) => {
          if (response && response.ok) {
            const copy = response.clone();
            caches.open(ASSET_CACHE).then((cache) => cache.put(request, copy));
          }
          return response;
        })
        .catch(() => cached);
      return cached || network;
    }),
  );
});
