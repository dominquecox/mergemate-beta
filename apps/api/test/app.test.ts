import { ErrorBody, HealthResponse } from "@mergemate/contracts";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createApp } from "../src/app";
import type { Env } from "../src/env";
import { fakeLimiter } from "./helpers";

const app = createApp();
const base: Env = { APP_ENV: "development" };
const request = (path: string, env: Env, init?: RequestInit) => app.request(path, init, { ...base, ...env });

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
    expect(env.IP_RATE_LIMITER.keys).toEqual(["203.0.113.7", "203.0.113.7"]);
  });

  it("runs before route logic, so unknown routes are limited too", async () => {
    const res = await request("/nope", { IP_RATE_LIMITER: fakeLimiter(0) });
    expect(res.status).toBe(429);
  });

  it("fails closed with misconfigured when the binding is missing", async () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    const res = await request("/v1/health", {});
    expect(res.status).toBe(500);
    expect(ErrorBody.parse(await res.json()).error.code).toBe("misconfigured");
    expect(log).toHaveBeenCalledWith(expect.stringContaining("IP_RATE_LIMITER binding is missing"));
  });
});
