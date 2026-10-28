/**
 * Registers the web app's service worker (/sw.js): the offline page and Web Push. Registering never asks for any
 * permission. One registration per page load; the browser re-checks sw.js on every update check (updateViaCache
 * "none"), so a release reaches open tabs without serving a stale worker.
 */
interface ServiceWorkerHost {
  navigator?: { serviceWorker?: { register(url: string, options: { scope: string; updateViaCache: "none" }): Promise<unknown> } };
  isSecureContext?: boolean;
}

let pending: Promise<boolean> | null = null;

export function registerServiceWorker(host: ServiceWorkerHost = globalThis as ServiceWorkerHost): Promise<boolean> {
  if (pending) return pending;
  const container = host.navigator?.serviceWorker;
  if (!container || host.isSecureContext === false) return Promise.resolve(false);
  pending = container.register("/sw.js", { scope: "/", updateViaCache: "none" }).then(
    () => true,
    () => {
      // Let a later call try again (for example after the connection comes back).
      pending = null;
      return false;
    },
  );
  return pending;
}

/** Tests only. */
export function resetServiceWorkerRegistration(): void {
  pending = null;
}
