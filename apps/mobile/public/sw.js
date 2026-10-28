/*
 * MergeMate service worker: the offline page and Web Push.
 *
 * Caching: the only cached response is /offline.html, a static public page with no account or PR data. Page loads
 * always go to the network; the cached page is shown only when the network fails. API calls, scripts, images and
 * everything else are never intercepted or cached, so no signed-in page, token or PR data is ever stored here.
 *
 * Push: a message is JSON { v: 1, kind, repo, number, title }, encrypted for this browser. Every push shows a
 * notification (browsers require it), falling back to generic text if the message is unexpected.
 */
const SHELL_CACHE = "mergemate-shell-v1";
const OFFLINE_URL = "/offline.html";
const HEADINGS = { review: "Review requested", mention: "You were mentioned", mine: "Update on your pull request" };
const OWNER = /^[A-Za-z0-9](?:[A-Za-z0-9-]{0,38})$/;
const REPO = /^[A-Za-z0-9_.-]{1,100}$/;

self.addEventListener("install", (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(SHELL_CACHE);
      await cache.add(new Request(OFFLINE_URL, { cache: "reload" }));
      await self.skipWaiting();
    })(),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      // Drop caches from older versions of this worker.
      for (const name of await caches.keys()) {
        if (name.startsWith("mergemate-") && name !== SHELL_CACHE) await caches.delete(name);
      }
      if (self.registration.navigationPreload) await self.registration.navigationPreload.enable();
      await self.clients.claim();
    })(),
  );
});

self.addEventListener("fetch", (event) => {
  const request = event.request;
  // Only same-origin page loads; everything else goes straight to the network untouched.
  if (request.mode !== "navigate" || new URL(request.url).origin !== self.location.origin) return;
  event.respondWith(
    (async () => {
      try {
        const preloaded = await event.preloadResponse;
        return preloaded || (await fetch(request));
      } catch (e) {
        return (await caches.match(OFFLINE_URL, { cacheName: SHELL_CACHE })) || Response.error();
      }
    })(),
  );
});

function validRepo(value) {
  if (typeof value !== "string") return false;
  const parts = value.split("/");
  return parts.length === 2 && OWNER.test(parts[0]) && REPO.test(parts[1]) && !/^\.+$/.test(parts[1]);
}

function parse(event) {
  try {
    const data = event.data ? event.data.json() : null;
    if (data && data.v === 1 && validRepo(data.repo) && Number.isSafeInteger(data.number) && data.number > 0) return data;
  } catch (e) {
    // fall through to the generic notice
  }
  return null;
}

self.addEventListener("push", (event) => {
  const data = parse(event);
  const options = data
    ? {
        body: `${data.repo}#${data.number} · ${String(data.title || "").slice(0, 140)}`,
        icon: "/icons/icon-192.png",
        tag: `${data.repo}#${data.number}`,
        data: { url: `/pr/${data.repo}/${data.number}` },
      }
    : { body: "A pull request needs your attention.", icon: "/icons/icon-192.png", tag: "mergemate", data: { url: "/" } };
  const heading = data && Object.prototype.hasOwnProperty.call(HEADINGS, data.kind) ? HEADINGS[data.kind] : "MergeMate";
  event.waitUntil(self.registration.showNotification(heading, options));
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  // Same origin only: a notification can never send the person elsewhere.
  let url = self.location.origin + "/";
  try {
    const target = new URL((event.notification.data && event.notification.data.url) || "/", self.location.origin);
    if (target.origin === self.location.origin) url = target.href;
  } catch (e) {
    // keep the home page
  }
  event.waitUntil(
    (async () => {
      const open = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
      for (const client of open) {
        if (new URL(client.url).origin !== self.location.origin) continue;
        try {
          await client.focus();
          if ("navigate" in client) await client.navigate(url);
          return;
        } catch (e) {
          // Could not reuse that window; open a new one below.
        }
      }
      await self.clients.openWindow(url);
    })(),
  );
});
