import { describe, it, expect } from "vitest";
import { normalizeBaseUrl, resolveApiConfig, webAppOrigin } from "../src/api/config";
import { createApiClient, createUnconfiguredClient } from "../src/api/factory";
import { HttpApiClient } from "../src/api/http";
import { MockApiClient } from "../src/api/mock";
import { MemoryTokenStore } from "./helpers";

describe("API base URL from the environment", () => {
  it("allows exactly /__api only in development", () => {
    expect(normalizeBaseUrl("/__api", true)).toBe("/__api");
    expect(normalizeBaseUrl("/__api/", true)).toBeNull();
    expect(normalizeBaseUrl("/__api", false)).toBeNull();
  });
  it("falls back to sample data in a development build when it is not set", () => {
    expect(resolveApiConfig(undefined, true)).toEqual({ kind: "mock" });
    expect(resolveApiConfig("", true)).toEqual({ kind: "mock" });
    expect(resolveApiConfig("   ", true)).toEqual({ kind: "mock" });
  });

  it("fails visibly in a production build when it is not set", () => {
    expect(resolveApiConfig(undefined, false)).toEqual({ kind: "error", reason: "missing" });
    expect(resolveApiConfig("", false)).toEqual({ kind: "error", reason: "missing" });
  });

  it("uses the real API when it is set", () => {
    expect(resolveApiConfig("https://api.mergemate.dev", false)).toEqual({ kind: "http", baseUrl: "https://api.mergemate.dev" });
    expect(resolveApiConfig("https://api-dev.mergemate.dev/", true)).toEqual({
      kind: "http",
      baseUrl: "https://api-dev.mergemate.dev",
    });
    expect(resolveApiConfig("http://localhost:8787", true)).toEqual({ kind: "http", baseUrl: "http://localhost:8787" });
  });

  it("never falls back to sample data when a value is set but wrong", () => {
    expect(resolveApiConfig("not a url", true)).toEqual({ kind: "error", reason: "invalid" });
    expect(resolveApiConfig("not a url", false)).toEqual({ kind: "error", reason: "invalid" });
  });

  it("allows plain http only for a local API in development", () => {
    expect(resolveApiConfig("http://localhost:8787", false)).toEqual({ kind: "error", reason: "invalid" });
    expect(resolveApiConfig("http://api.mergemate.dev", true)).toEqual({ kind: "error", reason: "invalid" });
    expect(resolveApiConfig("http://192.168.1.20:8787", true)).toMatchObject({ kind: "http" });
  });

  it("rejects an address with a path, credentials, query or fragment", () => {
    for (const bad of [
      "https://api.mergemate.dev/v1",
      "https://user:pw@api.mergemate.dev",
      "https://api.mergemate.dev?x=1",
      "https://api.mergemate.dev#x",
      "ftp://api.mergemate.dev",
    ]) {
      expect(normalizeBaseUrl(bad, true)).toBeNull();
    }
  });

  it("points the iOS Manage plan link at the web app for the same environment", () => {
    expect(webAppOrigin({ kind: "http", baseUrl: "https://api.mergemate.dev" })).toBe("https://app.mergemate.dev");
    expect(webAppOrigin({ kind: "http", baseUrl: "https://api-dev.mergemate.dev" })).toBe("https://dev.mergemate.dev");
    expect(webAppOrigin({ kind: "http", baseUrl: "http://localhost:8787" })).toBe("http://localhost:8081");
  });
});

describe("choosing the client", () => {
  const deps = { platform: "web" as const, tokenStore: new MemoryTokenStore() };

  it("builds the real client for an http config", () => {
    const client = createApiClient({ kind: "http", baseUrl: "http://localhost:8787" }, deps);
    expect(client).toBeInstanceOf(HttpApiClient);
    expect(client.isMock).toBe(false);
  });

  it("builds the sample-data client only for the mock config", () => {
    const client = createApiClient({ kind: "mock" }, deps);
    expect(client).toBeInstanceOf(MockApiClient);
    expect(client.isMock).toBe(true);
  });

  it("builds a client that fails every call for a build with no usable address", async () => {
    const client = createApiClient({ kind: "error", reason: "missing" }, deps);
    expect(client.isMock).toBe(false);
    await expect(client.getNotifications()).rejects.toMatchObject({ code: "not_configured" });
    await expect(client.startDemoSession()).rejects.toMatchObject({ code: "not_configured" });
    expect(() => client.setUnauthorizedHandler(() => undefined)).not.toThrow();
    const failure = await createUnconfiguredClient().getMe().catch((e) => e);
    expect(failure.message).toMatch(/isn't connected/i);
  });
});

describe("SEC-013 build check", () => {
  const dev: Record<string, string | undefined> = { EXPO_PUBLIC_API_BASE_URL: "https://api-dev.mergemate.dev", EXPO_PUBLIC_CF_ACCESS_CLIENT_ID: "id", EXPO_PUBLIC_CF_ACCESS_CLIENT_SECRET: "secret" };
  it("allows service-token values in a native dev build", async () => {
    const { assertAccessTokenAllowed } = await import("../app.config");
    expect(() => assertAccessTokenAllowed(dev, ["expo", "start"])).not.toThrow();
  });
  it("refuses them for any web export, even against the dev API", async () => {
    const { assertAccessTokenAllowed } = await import("../app.config");
    for (const argv of [["expo", "export", "-p", "web"], ["expo", "export", "--platform", "web"], ["expo", "export", "--platform=web"], ["expo", "start", "--web"]]) {
      expect(() => assertAccessTokenAllowed(dev, argv)).toThrow(/native development/);
    }
    expect(() => assertAccessTokenAllowed({ ...dev, EXPO_PLATFORM: "web" }, ["expo"])).toThrow();
    expect(() => assertAccessTokenAllowed({ ...dev, EXPO_PUBLIC_CF_ACCESS_CLIENT_SECRET: "", EXPO_PUBLIC_CF_ACCESS_CLIENT_ID: "id" }, ["expo", "export", "-p", "web"])).toThrow();
  });
  it("still refuses prod and proxy API bases", async () => {
    const { assertAccessTokenAllowed } = await import("../app.config");
    expect(() => assertAccessTokenAllowed({ ...dev, EXPO_PUBLIC_API_BASE_URL: "https://api.mergemate.dev" }, ["expo"])).toThrow();
    expect(() => assertAccessTokenAllowed({ ...dev, EXPO_PUBLIC_API_BASE_URL: "/__api" }, ["expo"])).toThrow();
  });
});
