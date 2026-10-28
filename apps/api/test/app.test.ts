import { ErrorBody, HealthResponse } from "@mergemate/contracts";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createApp } from "../src/app";
import type { Env } from "../src/env";
import { fakeLimiter, fakeAdmissionNamespace, type FixtureLimiters } from "./helpers";

const app = createApp();
const base: Env = { APP_ENV: "development" };
const request = (path: string, env: Env & Partial<FixtureLimiters>, init?: RequestInit) => app.request(path, init, {
  ...base, ...env,
  ...(env.RATE_ADMISSION?{}:env.IP_RATE_LIMITER?{RATE_ADMISSION:fakeAdmissionNamespace(scope=>scope==='ip'?env.IP_RATE_LIMITER:scope==='session'?env.SESSION_RATE_LIMITER:env.SUPPORT_RATE_LIMITER)}:{}),
});

afterEach(() => vi.restoreAllMocks());

describe("GET /v1/health", () => {
  it("returns ok and version", async () => {
    const res = await request("/v1/health", { IP_RATE_LIMITER: fakeLimiter() });
    expect(res.status).toBe(200);
    expect(HealthResponse.parse(await res.json())).toEqual({ ok: true, version: expect.any(String) });
  });

  it("sets request id and security headers", async () => {
    const res = await request("/v1/health", { IP_RATE_LIMITER: fakeLimiter() });
    expect(res.headers.get("x-request-id")).toMatch(/^[0-9a-f-]{36}$/);
    expect(res.headers.get("strict-transport-security")).toContain("max-age=");
    expect(res.headers.get("x-content-type-options")).toBe("nosniff");
    expect(res.headers.get("referrer-policy")).toBe("no-referrer");
  });

  it("ignores a client-sent request id", async () => {
    const res = await request(
      "/v1/health",
      { IP_RATE_LIMITER: fakeLimiter() },
      { headers: { "x-request-id": "spoofed" } },
    );
    expect(res.headers.get("x-request-id")).not.toBe("spoofed");
  });
});

describe("errors", () => {
  it("returns not_found in the error shape with headers", async () => {
    const res = await request("/nope", { IP_RATE_LIMITER: fakeLimiter() });
    expect(res.status).toBe(404);
    const body = ErrorBody.parse(await res.json());
    expect(body.error.code).toBe("not_found");
    expect(body.error.requestId).toBe(res.headers.get("x-request-id"));
    expect(res.headers.get("x-content-type-options")).toBe("nosniff");
  });

  it("rejects bodies over 1 MB with payload_too_large", async () => {
    const res = await request(
      "/v1/health",
      { IP_RATE_LIMITER: fakeLimiter() },
      { method: "POST", body: "x".repeat(1024 * 1024 + 1) },
    );
    expect(res.status).toBe(413);
    expect(ErrorBody.parse(await res.json()).error.code).toBe("payload_too_large");
  });
});

describe("rate limiting", () => {
  it("returns rate_limited with retry-after once the limit is reached", async () => {
    const env = { IP_RATE_LIMITER: fakeLimiter(1) };
    const init = { headers: { "cf-connecting-ip": "203.0.113.7" } };
    expect((await request("/v1/health", env, init)).status).toBe(200);
    const res = await request("/v1/health", env, init);
    expect(res.status).toBe(429);
    expect(res.headers.get("retry-after")).toBe("60");
    expect(res.headers.get("strict-transport-security")).toContain("max-age=");
    expect(ErrorBody.parse(await res.json()).error.code).toBe("rate_limited");
    expect(env.IP_RATE_LIMITER.keys).toHaveLength(2);
    expect(env.IP_RATE_LIMITER.keys[0]).toMatch(/^ip:[a-f0-9]{64}$/);
    expect(env.IP_RATE_LIMITER.keys[0]).toBe(env.IP_RATE_LIMITER.keys[1]);
  });

  it("runs before route logic, so unknown routes are limited too", async () => {
    const res = await request("/nope", { IP_RATE_LIMITER: fakeLimiter(0) });
    expect(res.status).toBe(429);
  });

  it("429s a 172-request burst at the production 60/min IP limit", async () => {
    const env = { IP_RATE_LIMITER: fakeLimiter(60) };
    const init = { headers: { "cf-connecting-ip": "203.0.113.7" } };
    let ok = 0;
    let limited = 0;
    for (let i = 0; i < 172; i++) {
      const res = await request("/v1/health", env, init);
      if (res.status === 200) ok++;
      else if (res.status === 429) {
        limited++;
        expect(res.headers.get("retry-after")).toBe("60");
        expect(res.headers.get("cache-control")).toBe("no-store");
        expect(ErrorBody.parse(await res.json()).error.code).toBe("rate_limited");
      } else throw new Error(`unexpected status ${res.status} on burst request ${i}`);
    }
    expect(ok).toBe(60);
    expect(limited).toBe(112);
    expect(env.IP_RATE_LIMITER.keys).toHaveLength(172);
  });

  it("limits CORS preflights too, not just real requests", async () => {
    const env = { IP_RATE_LIMITER: fakeLimiter(1) };
    const init = {
      method: "OPTIONS",
      headers: { origin: "https://dev.mergemate.dev", "access-control-request-method": "GET" },
    };
    expect((await request("/v1/health", env, init)).status).toBe(204);
    expect((await request("/v1/health", env, init)).status).toBe(429);
  });

  it("keeps Access-Control-Allow-Origin on 401 and 429 to an allowed origin", async () => {
    const origin = { origin: "https://dev.mergemate.dev" };
    const unauth = await request("/v1/settings", { IP_RATE_LIMITER: fakeLimiter() }, { headers: origin });
    expect(unauth.status).toBe(401);
    expect(unauth.headers.get("access-control-allow-origin")).toBe("https://dev.mergemate.dev");
    const limited = await request("/v1/health", { IP_RATE_LIMITER: fakeLimiter(0) }, { headers: origin });
    expect(limited.status).toBe(429);
    expect(limited.headers.get("access-control-allow-origin")).toBe("https://dev.mergemate.dev");
  });

  it("fails closed with503 when authoritative admission is missing", async () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    const res = await request("/v1/health", {});
    expect(res.status).toBe(503);
    expect(ErrorBody.parse(await res.json()).error.code).toBe("rate_limit_unavailable");
    expect(log).not.toHaveBeenCalled();
  });
});
