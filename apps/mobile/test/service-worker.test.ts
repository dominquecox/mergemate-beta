import { describe, it, expect, beforeEach } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { runInNewContext } from "node:vm";

/** Runs public/sw.js in a mocked service worker global with fake caches, clients and network. */
const source = readFileSync(resolve(__dirname, "../public/sw.js"), "utf8");
const ORIGIN = "https://dev.mergemate.dev";

type Listener = (event: Record<string, unknown>) => void;

function loadWorker(network: (request: Request) => Promise<Response>) {
  const listeners = new Map<string, Listener>();
  const stores = new Map<string, Map<string, Response>>();
  const fetched: string[] = [];
  const notifications: { title: string; options: { body: string; tag: string; data: { url: string } } }[] = [];
  const opened: string[] = [];
  const windows: { url: string; focused: boolean; navigatedTo?: string }[] = [];
  const flags = { skipWaiting: false, claimed: false, preload: false };
  const cacheFor = (name: string) => {
    if (!stores.has(name)) stores.set(name, new Map());
    const store = stores.get(name)!;
    return {
      add: async (request: Request) => {
        const response = await network(request);
        fetched.push(request.url);
        store.set(new URL(request.url).pathname, response);
      },
    };
  };
  const self = {
    location: new URL(`${ORIGIN}/sw.js`),
    addEventListener: (type: string, fn: Listener) => listeners.set(type, fn),
    skipWaiting: async () => {
      flags.skipWaiting = true;
    },
    registration: {
      navigationPreload: { enable: async () => void (flags.preload = true) },
      showNotification: async (title: string, options: (typeof notifications)[number]["options"]) => {
        notifications.push({ title, options });
      },
    },
    clients: {
      claim: async () => void (flags.claimed = true),
      matchAll: async () =>
        windows.map((w) => ({
          url: w.url,
          focus: async () => void (w.focused = true),
          navigate: async (url: string) => void (w.navigatedTo = url),
        })),
      openWindow: async (url: string) => void opened.push(url),
    },
  };
  const caches = {
    open: async (name: string) => cacheFor(name),
    keys: async () => [...stores.keys()],
    delete: async (name: string) => stores.delete(name),
    match: async (url: string, options: { cacheName: string }) => stores.get(options.cacheName)?.get(url),
  };
  const fetch = async (request: Request) => {
    fetched.push(request.url);
    return network(request);
  };
  // A worker resolves relative URLs against its own location; Node's Request needs them absolute.
  class WorkerRequest extends Request {
    constructor(input: string, init?: RequestInit) {
      super(new URL(input, self.location.href).href, init);
    }
  }
  runInNewContext(source, { self, caches, fetch, Request: WorkerRequest, Response, URL, Object, String, Number, console });

  const run = async (type: string, fields: Record<string, unknown>) => {
    const pending: Promise<unknown>[] = [];
    let responded: Promise<Response> | undefined;
    listeners.get(type)!({
      ...fields,
      waitUntil: (p: Promise<unknown>) => pending.push(p),
      respondWith: (p: Promise<Response>) => (responded = p),
    });
    await Promise.all(pending);
    return responded;
  };
  return { run, stores, fetched, notifications, opened, windows, flags };
}

const navigate = (path: string, origin = ORIGIN) => {
  const request = new Request(`${origin}${path}`);
  Object.defineProperty(request, "mode", { value: "navigate" });
  return request;
};
const pushEvent = (payload: unknown) => ({ data: { json: () => (typeof payload === "string" ? JSON.parse(payload) : payload) } });

describe("service worker: install, update and caching", () => {
  let worker: ReturnType<typeof loadWorker>;
  let online: boolean;
  beforeEach(() => {
    online = true;
    worker = loadWorker(async (request) => {
      if (!online) throw new TypeError("Failed to fetch");
      return new Response(`page ${new URL(request.url).pathname}`, { headers: { "content-type": "text/html" } });
    });
  });

  it("install caches only the public offline page and takes over without waiting", async () => {
    await worker.run("install", {});
    expect([...worker.stores.keys()]).toEqual(["mergemate-shell-v1"]);
    expect([...worker.stores.get("mergemate-shell-v1")!.keys()]).toEqual(["/offline.html"]);
    expect(worker.flags.skipWaiting).toBe(true);
  });

  it("activate removes older MergeMate caches, keeps other caches, and claims open pages", async () => {
    worker.stores.set("mergemate-shell-v0", new Map());
    worker.stores.set("other-app", new Map());
    await worker.run("install", {});
    await worker.run("activate", {});
    expect([...worker.stores.keys()].sort()).toEqual(["mergemate-shell-v1", "other-app"]);
    expect(worker.flags.claimed).toBe(true);
    expect(worker.flags.preload).toBe(true);
  });

  it("leaves API calls, scripts, images and other origins to the browser", async () => {
    for (const request of [
      new Request("https://api-dev.mergemate.dev/v1/me"),
      new Request(`${ORIGIN}/_expo/static/js/web/entry.js`),
      new Request(`${ORIGIN}/icons/icon-192.png`),
      navigate("/inbox", "https://evil.example"),
    ]) {
      expect(await worker.run("fetch", { request, preloadResponse: Promise.resolve(undefined) })).toBeUndefined();
    }
  });

  it("page loads always come from the network and are never stored", async () => {
    await worker.run("install", {});
    const response = await worker.run("fetch", { request: navigate("/pr/acme/api/12"), preloadResponse: Promise.resolve(undefined) });
    expect(await response!.text()).toBe("page /pr/acme/api/12");
    expect([...worker.stores.get("mergemate-shell-v1")!.keys()]).toEqual(["/offline.html"]);
  });

  it("uses the navigation preload response when there is one", async () => {
    const preloaded = new Response("preloaded");
    const response = await worker.run("fetch", { request: navigate("/inbox"), preloadResponse: Promise.resolve(preloaded) });
    expect(await response!.text()).toBe("preloaded");
  });

  it("shows the offline page only when the network fails", async () => {
    await worker.run("install", {});
    online = false;
    const response = await worker.run("fetch", { request: navigate("/inbox"), preloadResponse: Promise.reject(new TypeError("offline")) });
    expect(await response!.text()).toBe("page /offline.html");
  });

  it("returns a network error when offline before the offline page was cached", async () => {
    online = false;
    const response = await worker.run("fetch", { request: navigate("/inbox"), preloadResponse: Promise.resolve(undefined) });
    expect(response!.type).toBe("error");
  });
});

describe("service worker: push and notification clicks", () => {
  let worker: ReturnType<typeof loadWorker>;
  beforeEach(() => {
    worker = loadWorker(async () => new Response("ok"));
  });

  it("shows the pull request with a same-origin link", async () => {
    await worker.run("push", pushEvent({ v: 1, kind: "review", repo: "acme/api", number: 12, title: "Fix login" }));
    expect(worker.notifications).toEqual([
      { title: "Review requested", options: { body: "acme/api#12 · Fix login", icon: "/icons/icon-192.png", tag: "acme/api#12", data: { url: "/pr/acme/api/12" } } },
    ]);
  });

  it.each([
    ["unparseable", "{not json"],
    ["wrong version", { v: 2, kind: "review", repo: "acme/api", number: 1 }],
    ["path traversal", { v: 1, kind: "review", repo: "../..", number: 1 }],
    ["dot repo", { v: 1, kind: "review", repo: "acme/..", number: 1 }],
    ["absolute URL", { v: 1, kind: "review", repo: "https://evil.example", number: 1 }],
    ["bad number", { v: 1, kind: "review", repo: "acme/api", number: -1 }],
  ])("falls back to a generic notice for %s messages", async (_label, payload) => {
    const event = typeof payload === "string" ? { data: { json: () => JSON.parse(payload) } } : pushEvent(payload);
    await worker.run("push", event);
    expect(worker.notifications[0]).toEqual({
      title: "MergeMate",
      options: { body: "A pull request needs your attention.", icon: "/icons/icon-192.png", tag: "mergemate", data: { url: "/" } },
    });
  });

  it("uses a generic heading for unknown kinds, including inherited object keys", async () => {
    for (const kind of ["other", "constructor", "__proto__"]) {
      await worker.run("push", pushEvent({ v: 1, kind, repo: "acme/api", number: 3, title: "x" }));
    }
    expect(worker.notifications.map((n) => n.title)).toEqual(["MergeMate", "MergeMate", "MergeMate"]);
  });

  it("a click reuses an open MergeMate window and ignores windows on other origins", async () => {
    worker.windows.push({ url: "https://evil.example/", focused: false }, { url: `${ORIGIN}/inbox`, focused: false });
    await worker.run("notificationclick", { notification: { close: () => undefined, data: { url: "/pr/acme/api/12" } } });
    expect(worker.windows[0]).toEqual({ url: "https://evil.example/", focused: false });
    expect(worker.windows[1]).toMatchObject({ focused: true, navigatedTo: `${ORIGIN}/pr/acme/api/12` });
    expect(worker.opened).toEqual([]);
  });

  it.each(["https://evil.example/phish", "//evil.example/x", "javascript:alert(1)"])(
    "a click never leaves the site (%s)",
    async (url) => {
      await worker.run("notificationclick", { notification: { close: () => undefined, data: { url } } });
      expect(worker.opened).toHaveLength(1);
      expect(new URL(worker.opened[0]!).origin).toBe(ORIGIN);
    },
  );
});

describe("install files", () => {
  const publicDir = resolve(__dirname, "../public");
  const manifest = JSON.parse(readFileSync(resolve(publicDir, "manifest.webmanifest"), "utf8")) as {
    id: string; start_url: string; scope: string; display: string; icons: { src: string; sizes: string; type: string }[];
  };

  it("the manifest is installable from this origin and every icon exists at its stated size", () => {
    expect(manifest).toMatchObject({ id: "/", start_url: "/", scope: "/", display: "standalone" });
    expect(manifest.icons.map((icon) => icon.sizes)).toEqual(["192x192", "512x512"]);
    for (const icon of manifest.icons) {
      const png = readFileSync(resolve(publicDir, `.${icon.src}`));
      const [width, height] = icon.sizes.split("x").map(Number);
      expect(icon.type).toBe("image/png");
      expect([png.readUInt32BE(16), png.readUInt32BE(20)]).toEqual([width, height]);
    }
  });

  it("the offline page is static: no script, no outside request and no account data", () => {
    const html = readFileSync(resolve(publicDir, "offline.html"), "utf8");
    expect(html).not.toMatch(/<script|\son[a-z]+=|https?:\/\//i);
    expect(html).toContain('<a href="/">Try again</a>');
  });

  it("the page template links the manifest and the Home Screen icon", () => {
    const html = readFileSync(resolve(publicDir, "index.html"), "utf8");
    expect(html).toContain('<link rel="manifest" href="/manifest.webmanifest" />');
    expect(html).toContain('<link rel="apple-touch-icon" href="/icons/icon-192.png" />');
  });
});
