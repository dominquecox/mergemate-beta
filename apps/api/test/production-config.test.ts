import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { callbackUrl, webOrigin, siteOrigin } from "../src/config";
import type { Env } from "../src/env";

/** Pins the production block of wrangler.toml: right hosts and origins, same model routes as dev, and no local or dev resource. */
const toml = readFileSync(new URL("../wrangler.toml", import.meta.url), "utf8");

interface Table {
  header: string;
  body: string;
}

const tables: Table[] = [...toml.matchAll(/^\[{1,2}([^\]]+)\]{1,2}[^\n]*\n([\s\S]*?)(?=^\[|$(?![\s\S]))/gm)].map((m) => ({
  header: m[1] ?? "",
  body: m[2] ?? "",
}));

const inEnv = (env: string) => tables.filter((t) => t.header === `env.${env}` || t.header.startsWith(`env.${env}.`));
const value = (table: Table | undefined, key: string) => new RegExp(`^${key}\\s*=\\s*"([^"]*)"`, "m").exec(table?.body ?? "")?.[1];
const named = (env: string, header: string) => tables.find((t) => t.header === `env.${env}.${header}`);
const vars = (env: string) => {
  const table = named(env, "vars");
  const read = (key: string) => value(table, key);
  return read;
};
const all = (env: string, header: string) => tables.filter((t) => t.header === `env.${env}.${header}`);

describe("wrangler.toml [env.production]", () => {
  const prod = vars("production");
  const dev = vars("dev");

  it("serves only api.mergemate.dev, never workers.dev", () => {
    const root = tables.find((t) => t.header === "env.production");
    expect(value(root, "name")).toBe("mergemate-api");
    expect(root?.body).toContain('routes = [{ pattern = "api.mergemate.dev", custom_domain = true }]');
    expect(root?.body).toMatch(/^workers_dev = false$/m);
  });

  it("sets origins the API accepts for production, and the web app's callback", () => {
    const env: Env = Object.fromEntries(["APP_ENV", "WEB_ORIGIN", "SITE_ORIGIN"].map((k) => [k, prod(k)]));
    expect(env.APP_ENV).toBe("production");
    expect(webOrigin(env)).toBe("https://app.mergemate.dev");
    expect(siteOrigin(env)).toBe("https://mergemate.dev");
    expect(callbackUrl(env, "web")).toBe("https://app.mergemate.dev/auth/callback");
    expect(prod("STRIPE_MODE")).toBe("disabled");
  });

  it("uses the same model settings as dev", () => {
    for (const name of ["MODEL_ROUTE_SUMMARY", "MODEL_ROUTE_RISK", "MODEL_ROUTE_TRIAGE", "MODEL_ROUTE_HIGHLIGHT", "MODEL_BASE_URL"]) {
      expect(prod(name)).toBeDefined();
      expect(prod(name)).toBe(dev(name));
    }
  });

  it("marks the GitHub App values for the owner to paste", () => {
    expect(prod("GITHUB_APP_CLIENT_ID")).toBeDefined();
    expect(prod("GITHUB_APP_SLUG")).toBeDefined();
    // Production has its own GitHub App: never the dev app's values.
    expect(prod("GITHUB_APP_CLIENT_ID")).not.toBe(dev("GITHUB_APP_CLIENT_ID"));
    expect(prod("GITHUB_APP_SLUG")).not.toBe(dev("GITHUB_APP_SLUG"));
  });

  it("binds a production D1, KV, queues, bucket and datasets, none shared with dev or local", () => {
    const d1 = all("production", "d1_databases");
    expect(d1.map((t) => value(t, "database_name"))).toEqual(["mergemate-db"]);
    const kv = all("production", "kv_namespaces");
    expect(kv.map((t) => value(t, "binding"))).toEqual(["POSTS"]);
    expect(value(d1[0], "database_id")).not.toBe(value(all("dev", "d1_databases")[0], "database_id"));
    expect(value(kv[0], "id")).not.toBe(value(all("dev", "kv_namespaces")[0], "id"));

    // Every queue the production Worker names, as producer, consumer or dead-letter target.
    const queueRefs = [...all("production", "queues.producers"), ...all("production", "queues.consumers")].flatMap((t) =>
      [value(t, "queue"), value(t, "dead_letter_queue")].filter((q): q is string => q !== undefined),
    );
    expect(new Set(queueRefs)).toEqual(
      new Set(["mergemate-github-events", "mergemate-github-events-dlq", "mergemate-stripe-events", "mergemate-stripe-events-dlq"]),
    );
    expect(all("production", "r2_buckets").map((t) => value(t, "bucket_name"))).toEqual(["mergemate-highlight-uploads"]);
    expect(all("production", "analytics_engine_datasets").map((t) => value(t, "dataset")).sort()).toEqual([
      "mergemate_ai_metrics",
      "mergemate_events",
    ]);
    expect(named("production", "ai")?.body).toContain('binding = "AI"');
    expect(named("production", "images")?.body).toContain('binding = "IMAGES"');

    const production = inEnv("production").map((t) => t.body).join("\n");
    expect(production).not.toMatch(/local|-dev\b/);
  });
});

describe("agent runtime stays off in production", () => {
  // The agent executor ships dev-only until its production security controls land. These pins make turning it on
  // in production an explicit, reviewed config change instead of a silent one.
  it("binds no workflow queue and allows no runner repositories in production", () => {
    const production = inEnv("production").map((t) => `[${t.header}]\n${t.body}`).join("\n");
    expect(production).not.toMatch(/WORKFLOW_/);
    expect(production).not.toMatch(/mergemate-workflows/);
    expect(vars("production")("WORKFLOW_RUNNER_REPOS")).toBeUndefined();
    expect(all("production", "queues.producers").map((t) => value(t, "binding"))).not.toContain("WORKFLOW_QUEUE");
  });

  it("keeps the workflow queue in the dev environment only", () => {
    expect(all("dev", "queues.producers").map((t) => value(t, "binding"))).toContain("WORKFLOW_QUEUE");
    expect(toml).not.toMatch(/^\[\[queues\.producers\]\][^[]*WORKFLOW_QUEUE/m);
  });

  it("refuses runner calls when no runner credential is configured", async () => {
    const { testContext } = await import("./helpers");
    const { appFor } = await import("./sign-in");
    const ctx = testContext();
    const res = await appFor(ctx)("/internal/workflows/heartbeat", {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${"x".repeat(40)}` },
      body: JSON.stringify({ runnerId: "runner-1", repositories: ["dominquecox/mergemate"], capabilities: [] }),
    });
    expect(res.status).toBe(401);
  });
});
