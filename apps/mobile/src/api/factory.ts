import { ApiClient } from "./client";
import type { ApiMode } from "./config";
import { ApiClientError, messageForCode } from "./errors";
import { HttpApiClient, type TokenStore } from "./http";
import { MockApiClient } from "./mock";

export interface ApiClientDeps {
  platform: "web" | "native";
  nativePlatform?: "ios" | "android";
  onAccountDeleted?:()=>Promise<void>;
  tokenStore: TokenStore;
  fetch?: typeof fetch;
  getTurnstileToken?: () => Promise<string>;
}

/**
 * A client for a build that has no usable API address. Every call fails with the same plain message,
 * so a production build without a base URL cannot quietly show sample data.
 */
export function createUnconfiguredClient(): ApiClient {
  const failure = () => new ApiClientError("not_configured", messageForCode("not_configured"));
  return new Proxy({} as ApiClient, {
    get(_target, prop) {
      if (prop === "isMock") return false;
      if (["setUnauthorizedHandler","clearCache","invalidateCache","invalidateSession"].includes(String(prop))) return () => undefined;
      if (prop === "then") return undefined;
      return () => Promise.reject(failure());
    },
  });
}

export function createApiClient(mode: ApiMode, deps: ApiClientDeps): ApiClient {
  switch (mode.kind) {
    case "http":
      return new HttpApiClient({ baseUrl: mode.baseUrl, ...deps });
    case "mock":
      return new MockApiClient();
    case "error":
      return createUnconfiguredClient();
  }
}
