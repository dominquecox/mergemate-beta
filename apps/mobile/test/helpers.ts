import {setPendingLogout} from "../src/auth/session-events";
import { beforeEach, vi } from "vitest";
import { setInMemoryCsrfToken } from "../src/api/client";
import { HttpApiClient, type HttpApiClientOptions, type TokenStore } from "../src/api/http";

beforeEach(()=>setPendingLogout(false));

export interface RecordedRequest {
  url: string;
  path: string;
  method: string;
  headers: Record<string, string>;
  credentials?: RequestCredentials;
  signal?: AbortSignal | null;
  body: unknown;
  rawBody: BodyInit | null | undefined;
}

export type Handler = (req: RecordedRequest) => Response | Promise<Response>;

export const BASE = "http://localhost:8787";

export function jsonResponse(body: unknown, status = 200, headers: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json", "x-request-id": "req_test", ...headers },
  });
}

export function errorResponse(code: string, status: number, message = "Server text.", headers: Record<string, string> = {}) {
  return jsonResponse({ error: { code, message, requestId: "req_test" } }, status, headers);
}

/** A fetch that records every call and answers with the handler. No network. */
export function fakeFetch(handler: Handler) {
  const calls: RecordedRequest[] = [];
  const fn = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    const rawBody = init?.body;
    let body: unknown = rawBody;
    if (typeof rawBody === "string") {
      try {
        body = JSON.parse(rawBody);
      } catch {
        body = rawBody;
      }
    }
    const req: RecordedRequest = {
      url,
      path: url.replace(BASE, "").replace(/^\/v1/, ""),
      method: init?.method ?? "GET",
      headers: { ...((init?.headers as Record<string, string> | undefined) ?? {}) },
      credentials: init?.credentials,
      signal: init?.signal,
      body,
      rawBody,
    };
    calls.push(req);
    return handler(req);
  });
  return { fetch: fn as unknown as typeof fetch, calls, fn };
}

export class MemoryTokenStore implements TokenStore {
  token: string | null;
  gets = 0;
  sets: string[] = [];
  clears = 0;
  constructor(token: string | null = null) {
    this.token = token;
  }
  async get() {
    this.gets++;
    return this.token;
  }
  async set(token: string) {
    this.sets.push(token);
    this.token = token;
  }
  async clear() {
    this.clears++;
    this.token = null;
  }
}

export function makeClient(
  handler: Handler,
  options: Partial<HttpApiClientOptions> & { token?: string | null } = {},
) {
  setInMemoryCsrfToken(null);
  const { fetch, calls, fn } = fakeFetch(handler);
  const store = options.tokenStore instanceof MemoryTokenStore ? options.tokenStore : new MemoryTokenStore(options.token ?? null);
  const client = new HttpApiClient({
    baseUrl: BASE,
    platform: "web",
    fetch,
    tokenStore: store,
    ...options,
  });
  return { client, calls, fn, store };
}

export const USER = { id: "u1", login: "octo", name: "Octo", avatarUrl: "https://avatars.githubusercontent.com/u/1?v=4" };
export const NOW = "2026-10-27T12:00:00.000Z";
