import { createHmac } from "node:crypto";
import { ActivityResponse, ErrorBody } from "@mergemate/contracts";
import { describe, expect, it, vi } from "vitest";
import type { GitHubEventMessage } from "../src/lib/github-webhooks";
import { handleQueue } from "../src/queues";
import { json, type TestContext, testContext } from "./helpers";
import { appFor, signIn } from "./sign-in";

const SECRET = "test-webhook-secret-not-real";

const deliver = (
  ctx: TestContext,
  event: string,
  payload: unknown,
  { secret = SECRET, delivery = crypto.randomUUID(), raw }: { secret?: string; delivery?: string; raw?: string } = {},
) => {
  const body = raw ?? JSON.stringify(payload);
  const signature = `sha256=${createHmac("sha256", secret).update(body).digest("hex")}`;
  return appFor(ctx)("/v1/webhooks/github", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-github-event": event,
      "x-github-delivery": delivery,
      "x-hub-signature-256": signature,
    },
    body,
  });
};

const prPayload = (number: number, action = "synchronize", repo = "acme/api") => ({
  action,
  installation: { id: 22 },
  repository: { full_name: repo },
  pull_request: { number, head: { sha: `sha${number}` }, title: "secret title", body: "do not keep" },
});

/** Runs queued messages through the queue entry point the Worker exports. */
const drain = async (ctx: TestContext, queue = "mergemate-github-events-local") => {
  const messages = ctx.queued.splice(0).map((body) => ({
    body,
    ack: vi.fn(),
    retry: vi.fn(),
  }));
  const batch = { queue, messages, ackAll: vi.fn(), retryAll: vi.fn() } as unknown as MessageBatch<unknown>;
  await handleQueue(batch, ctx.env, ctx.time.now());
  return messages;
};

describe("POST /v1/webhooks/github", () => {
  it("verifies the signature, dedupes the delivery and queues a compact message", async () => {
    const ctx = testContext();
    const delivery = crypto.randomUUID();
    const res = await deliver(ctx, "pull_request", prPayload(7), { delivery });
    expect(res.status).toBe(202);
    expect(ctx.queued).toHaveLength(1);
    const message = ctx.queued[0] as GitHubEventMessage;
    expect(message).toMatchObject({ deliveryId: delivery, event: "pull_request" });
    expect(JSON.stringify(message)).not.toContain("secret title");
    expect(JSON.stringify(message)).not.toContain("do not keep");

    const again = await deliver(ctx, "pull_request", prPayload(7), { delivery });
    expect(again.status).toBe(200);
    expect(await again.json()).toEqual({ duplicate: true });
    expect(ctx.queued).toHaveLength(1);
  });

  it("accepts the next secret during rotation and rejects anything else", async () => {
    const ctx = testContext({ GITHUB_WEBHOOK_SECRET_NEXT: "next-secret-not-real" });
    expect((await deliver(ctx, "pull_request", prPayload(1), { secret: "next-secret-not-real" })).status).toBe(202);
    const bad = await deliver(ctx, "pull_request", prPayload(2), { secret: "wrong" });
    expect(bad.status).toBe(401);
    expect(ErrorBody.parse(await bad.json()).error.code).toBe("unauthorized");
    expect(ctx.queued).toHaveLength(1);
    expect(ctx.db.rows("SELECT * FROM github_deliveries")).toHaveLength(1);
  });

  it("rejects an unsigned request before parsing it", async () => {
    const ctx = testContext();
    const res = await appFor(ctx)("/v1/webhooks/github", {
      method: "POST",
      headers: { "x-github-event": "pull_request", "x-github-delivery": "d1" },
      body: "{not json",
    });
    expect(res.status).toBe(401);
  });

  it("caps the payload at 5 MB, above the normal JSON limit", async () => {
    const ctx = testContext();
    const big = { ...prPayload(3), padding: "x".repeat(2 * 1024 * 1024) };
    expect((await deliver(ctx, "pull_request", big)).status).toBe(202);
    const huge = { ...prPayload(4), padding: "x".repeat(5 * 1024 * 1024) };
    expect((await deliver(ctx, "pull_request", huge)).status).toBe(413);
  });

  it("ignores unknown events and comments on plain issues without recording them", async () => {
    const ctx = testContext();
    expect((await deliver(ctx, "star", { action: "created", repository: { full_name: "acme/api" } })).status).toBe(202);
    const issueComment = { action: "created", repository: { full_name: "acme/api" }, issue: { number: 5 } };
    expect(await (await deliver(ctx, "issue_comment", issueComment)).json()).toEqual({ ignored: true });
    expect(ctx.queued).toHaveLength(0);
    expect(ctx.db.rows("SELECT * FROM github_deliveries")).toHaveLength(0);
  });

  it("answers ping and is not limited per IP", async () => {
    const ctx = testContext();
    expect((await deliver(ctx, "ping", { zen: "hi" })).status).toBe(200);
    expect(ctx.ipLimiter.keys).toHaveLength(0);
  });

  it("fails visibly when the secret is not configured", async () => {
    const ctx = testContext({ GITHUB_WEBHOOK_SECRET: "" });
    vi.spyOn(console, "error").mockImplementation(() => {});
    expect((await deliver(ctx, "pull_request", prPayload(1))).status).toBe(500);
  });

  it("forgets the delivery when the queue is down so GitHub can redeliver", async () => {
    const ctx = testContext({ GITHUB_EVENTS: { send: async () => Promise.reject(new Error("down")) } });
    const delivery = crypto.randomUUID();
    expect((await deliver(ctx, "pull_request", prPayload(1), { delivery })).status).toBe(502);
    expect(ctx.db.rows("SELECT * FROM github_deliveries")).toHaveLength(0);
  });
});

describe("queue consumer", () => {
  it("tracks installations, their repositories, suspension and removal", async () => {
    const ctx = testContext();
    const account = { login: "acme", type: "Organization" };
    await deliver(ctx, "installation", {
      action: "created",
      installation: { id: 22, account },
      repositories: [{ id: 1, full_name: "acme/api" }],
    });
    await deliver(ctx, "installation_repositories", {
      action: "added",
      installation: { id: 22 },
      repositories_added: [{ id: 2, full_name: "acme/web" }],
      repositories_removed: [{ id: 1, full_name: "acme/api" }],
    });
    await drain(ctx);
    expect(ctx.db.rows("SELECT id, status FROM installations")).toEqual([{ id: "22", status: "active" }]);
    expect(ctx.db.rows("SELECT full_name FROM installation_repos")).toEqual([{ full_name: "acme/web" }]);

    await deliver(ctx, "installation", { action: "suspend", installation: { id: 22, account } });
    await drain(ctx);
    expect(ctx.db.rows("SELECT status FROM installations")).toEqual([{ status: "suspended" }]);

    await deliver(ctx, "installation", { action: "deleted", installation: { id: 22, account } });
    await drain(ctx);
    expect(ctx.db.rows("SELECT * FROM installations")).toHaveLength(0);
    expect(ctx.db.rows("SELECT * FROM installation_repos")).toHaveLength(0);
  });

  it("records PR activity from PR, review, comment, check suite and status events", async () => {
    const ctx = testContext();
    await deliver(ctx, "pull_request", prPayload(7, "opened"));
    await drain(ctx);
    expect(ctx.db.rows("SELECT number, head_sha, last_event FROM pr_activity")).toEqual([
      { number: 7, head_sha: "sha7", last_event: "opened" },
    ]);

    ctx.time.advance(1000);
    await deliver(ctx, "issue_comment", {
      action: "created",
      repository: { full_name: "acme/api" },
      issue: { number: 7, pull_request: {} },
    });
    await drain(ctx);
    expect(ctx.db.rows("SELECT last_event, head_sha FROM pr_activity")).toEqual([{ last_event: "comment", head_sha: "sha7" }]);

    ctx.time.advance(1000);
    await deliver(ctx, "status", { repository: { full_name: "acme/api" }, sha: "sha7", state: "failure" });
    await drain(ctx);
    expect(ctx.db.rows("SELECT last_event, updated_at FROM pr_activity")).toEqual([
      { last_event: "checks", updated_at: "2026-10-27T12:00:02.000Z" },
    ]);

    await deliver(ctx, "check_suite", {
      action: "completed",
      repository: { full_name: "acme/api" },
      check_suite: { head_sha: "sha8", pull_requests: [{ number: 8 }, { number: 9 }] },
    });
    await drain(ctx);
    expect(ctx.db.rows("SELECT number FROM pr_activity ORDER BY number")).toEqual([{ number: 7 }, { number: 8 }, { number: 9 }]);
  });

  it("retries a failing message and keeps a dead-letter record after the queue gives up", async () => {
    const ctx = testContext();
    await deliver(ctx, "pull_request", prPayload(1));
    const broken = ctx.queued[0] as GitHubEventMessage;
    ctx.db.sqlite.exec("DROP TABLE pr_activity");
    const [msg] = await drain(ctx);
    expect(msg?.retry).toHaveBeenCalled();
    expect(msg?.ack).not.toHaveBeenCalled();

    ctx.queued.push(broken);
    await drain(ctx, "mergemate-github-events-local-dlq");
    expect(ctx.db.rows("SELECT source, delivery_id, event FROM webhook_dead_letters")).toEqual([
      { source: "github", delivery_id: broken.deliveryId, event: "pull_request" },
    ]);
  });

  it("prunes delivery ids after a week", async () => {
    const ctx = testContext();
    await deliver(ctx, "pull_request", prPayload(1));
    ctx.time.advance(8 * 24 * 60 * 60 * 1000);
    await deliver(ctx, "pull_request", prPayload(2));
    await drain(ctx);
    expect(ctx.db.rows("SELECT * FROM github_deliveries")).toHaveLength(1);
  });

  it("leaves batches from unknown queues for retry", async () => {
    const ctx = testContext();
    const batch = { queue: "something-else", messages: [], ackAll: vi.fn(), retryAll: vi.fn() } as unknown as MessageBatch<unknown>;
    await handleQueue(batch, ctx.env);
    expect(batch.retryAll).toHaveBeenCalled();
  });
});

describe("GET /v1/activity", () => {
  const GH = "https://api.github.com";

  const mockAccess = (ctx: TestContext, repos: string[]) =>
    ctx.net
      .on("GET", `${GH}/user/installations`, { installations: [{ id: 22, suspended_at: null }] })
      .on("GET", `${GH}/user/installations/22/repositories`, {
        total_count: repos.length,
        repositories: repos.map((full_name) => ({ full_name })),
      });

  it('pages equal-timestamp activity without duplicates and keeps repository access checks',async()=>{
    const ctx=testContext();const {headers}=await signIn(ctx);mockAccess(ctx,['acme/api']);
    for(const n of [1,2,3])await deliver(ctx,'pull_request',prPayload(n,'synchronize','acme/api'));
    await drain(ctx);const call=appFor(ctx);const path='/v1/activity?since=2026-10-27T11:00:00Z&limit=2';
    const first=await (await call(path,{headers})).json() as {items:{number:number}[];nextCursor:string};
    expect(first.items.map(i=>i.number)).toEqual([1,2]);expect(first.nextCursor).toBeTruthy();
    const second=await (await call(path+'&cursor='+encodeURIComponent(first.nextCursor),{headers})).json() as {items:{number:number}[];nextCursor:string|null};
    expect(second.items.map(i=>i.number)).toEqual([3]);expect(second.nextCursor).toBeNull();
    expect((await call(path+'&cursor=not-json',{headers})).status).toBe(422);
  });

  it("lists changed PRs only in repos the user's token can read and still watches", async () => {
    const ctx = testContext();
    const { headers, userId } = await signIn(ctx);
    mockAccess(ctx, ["acme/api", "acme/web"]);
    for (const [n, repo] of [[1, "acme/api"], [2, "acme/web"], [3, "other/private"]] as const) {
      await deliver(ctx, "pull_request", prPayload(n, "synchronize", repo));
    }
    await drain(ctx);
    ctx.db.sqlite
      .prepare("INSERT INTO repo_watch (user_id, repo_id, full_name, watching, updated_at) VALUES (?, '9', 'acme/web', 0, 'x')")
      .run(userId);

    const res = await appFor(ctx)("/v1/activity?since=2026-10-27T11:00:00Z", { headers });
    const body = ActivityResponse.parse(await res.json());
    expect(body.items.map((i) => [i.repo, i.number, i.event])).toEqual([["acme/api", 1, "updated"]]);
    expect(body.serverTime).toBe("2026-10-27T12:00:00.000Z");
  });

  it("re-checks access with GitHub at most every 10 minutes", async () => {
    const ctx = testContext();
    const { headers } = await signIn(ctx);
    mockAccess(ctx, ["acme/api"]);
    const call = appFor(ctx);
    const count = () => ctx.net.calls.filter((c) => c.url.startsWith(`${GH}/user/installations`)).length;
    await call("/v1/activity?since=2026-10-27T11:00:00Z", { headers });
    const first = count();
    await call("/v1/activity?since=2026-10-27T11:00:00Z", { headers });
    expect(count()).toBe(first);
    ctx.time.advance(10 * 60 * 1000);
    await call("/v1/activity?since=2026-10-27T11:00:00Z", { headers });
    expect(count()).toBe(first * 2);
  });

  it("drops a repo as soon as the re-check no longer sees it", async () => {
    const ctx = testContext();
    const { headers } = await signIn(ctx);
    mockAccess(ctx, ["acme/api"]);
    await deliver(ctx, "pull_request", prPayload(1));
    await drain(ctx);
    const call = appFor(ctx);
    expect(ActivityResponse.parse(await (await call("/v1/activity?since=2026-10-27T11:00:00Z", { headers })).json()).items).toHaveLength(1);
    ctx.time.advance(10 * 60 * 1000);
    mockAccess(ctx, []);
    expect(ActivityResponse.parse(await (await call("/v1/activity?since=2026-10-27T11:00:00Z", { headers })).json()).items).toHaveLength(0);
  });

  it("requires a valid since and a session", async () => {
    const ctx = testContext();
    const { headers } = await signIn(ctx);
    expect((await appFor(ctx)("/v1/activity?since=yesterday", { headers })).status).toBe(422);
    expect((await appFor(ctx)("/v1/activity?since=2026-10-27T11:00:00Z")).status).toBe(401);
  });

  it("returns nothing for demo sessions without calling GitHub", async () => {
    const ctx = testContext();
    ctx.net.on("POST", "https://challenges.cloudflare.com/turnstile/v0/siteverify", () => json({ success: true }));
    const demo = (await (
      await appFor(ctx)("/v1/auth/demo", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ turnstileToken: "t", platform: "ios" }),
      })
    ).json()) as { session: { token: string } };
    const res = await appFor(ctx)("/v1/activity?since=2026-10-27T11:00:00Z", {
      headers: { authorization: `Bearer ${demo.session.token}` },
    });
    expect((await res.json()) as unknown).toMatchObject({ items: [] });
    expect(ctx.net.calls.every((c) => !c.url.startsWith(GH))).toBe(true);
  });

  it("is removed with the account", async () => {
    const ctx = testContext();
    const { headers, userId } = await signIn(ctx);
    mockAccess(ctx, ["acme/api"]);
    await appFor(ctx)("/v1/activity?since=2026-10-27T11:00:00Z", { headers });
    ctx.net.on("DELETE", `${GH}/applications/Iv-test-client/grant`, () => new Response(null, { status: 204 }));
    expect((await appFor(ctx)("/v1/account", { method: "DELETE", headers })).status).toBe(204);
    expect(ctx.db.rows("SELECT * FROM user_repo_access WHERE user_id = ?", userId)).toHaveLength(0);
    expect(ctx.db.rows("SELECT * FROM user_access_checks WHERE user_id = ?", userId)).toHaveLength(0);
  });
});

describe("webhook recovery boundaries", () => {
  it("deduplicates simultaneous delivery attempts and applies retries idempotently", async () => {
    const ctx = testContext(); const delivery = crypto.randomUUID();
    const responses = await Promise.all(Array.from({ length: 8 }, () => deliver(ctx, "pull_request", prPayload(7), { delivery })));
    expect(responses.every(r => [200, 202].includes(r.status))).toBe(true);
    expect(ctx.db.rows("SELECT * FROM github_deliveries")).toHaveLength(1);
    expect(ctx.queued.length).toBeGreaterThanOrEqual(1);
    const message = ctx.queued[0]; await drain(ctx); ctx.queued.push(message); await drain(ctx);
    expect(ctx.db.rows("SELECT number FROM pr_activity")).toEqual([{ number: 7 }]);
  });
  it("redelivers after queue failure without losing a durable delivery", async () => {
    const ctx = testContext(); let down = true;
    const queue = ctx.env.GITHUB_EVENTS;
    if (!queue) throw new Error("Missing fixture queue");
    const send = queue.send.bind(queue);
    queue.send = async body => { if (down) throw new Error("offline"); return send(body); };
    const delivery = crypto.randomUUID();
    expect((await deliver(ctx, "pull_request", prPayload(7), { delivery })).status).toBe(502);
    down = false;
    expect((await deliver(ctx, "pull_request", prPayload(7), { delivery })).status).toBe(202);
    expect(ctx.queued).toHaveLength(1);
  });
  it("records Stripe dead-letter IDs without retaining payloads", async () => {
    for (const queue of ["mergemate-stripe-events-local-dlq", "mergemate-stripe-events-dev-dlq", "mergemate-stripe-events-dlq"]) {
      const ctx = testContext(); const ackAll = vi.fn();
      await handleQueue({ queue, messages: [{body: {eventId: "evt_failed", raw: "private payload"}}], ackAll } as unknown as MessageBatch<unknown>, ctx.env, ctx.time.now());
      expect(ackAll).toHaveBeenCalledOnce();
      expect(ctx.db.rows("SELECT source,delivery_id,event FROM webhook_dead_letters")).toEqual([{source:"stripe",delivery_id:"evt_failed",event:null}]);
      expect(JSON.stringify(ctx.db.rows("SELECT * FROM webhook_dead_letters"))).not.toContain("private payload");
    }
  });
});
it("repairs a crash after the delivery insert and before queue acknowledgement", async () => {
  const ctx = testContext(); const delivery = crypto.randomUUID();
  await ctx.db.prepare("INSERT INTO github_deliveries(delivery_id,event,received_at,queued) VALUES(?,?,?,0)").bind(delivery,"pull_request",ctx.time.now().toISOString()).run();
  expect((await deliver(ctx,"pull_request",prPayload(9),{delivery})).status).toBe(202);
  expect(ctx.queued).toHaveLength(1);
  expect(ctx.db.rows("SELECT queued FROM github_deliveries")).toEqual([{queued:1}]);
});
it("retries malformed queue messages with bounded backoff instead of silently acknowledging", async () => {
  const ctx = testContext(); const ack = vi.fn(); const retry = vi.fn();
  await handleQueue({queue:"mergemate-github-events-dev",messages:[{body:{data:{kind:"unknown"}},attempts:100,ack,retry}]} as unknown as MessageBatch<unknown>,ctx.env,ctx.time.now());
  expect(ack).not.toHaveBeenCalled(); expect(retry).toHaveBeenCalledWith({delaySeconds:300});
});
it("allows an operator to redeliver a GitHub event after durable dead-letter recording", async () => {
  const ctx=testContext();const delivery=crypto.randomUUID();
  await deliver(ctx,"pull_request",prPayload(5),{delivery});
  await drain(ctx,"mergemate-github-events-local-dlq");
  expect(ctx.db.rows("SELECT * FROM github_deliveries")).toHaveLength(0);
  expect(ctx.db.rows("SELECT delivery_id FROM webhook_dead_letters")).toEqual([{delivery_id:delivery}]);
  expect((await deliver(ctx,"pull_request",prPayload(5),{delivery})).status).toBe(202);
  await drain(ctx);
  expect(ctx.db.rows("SELECT number FROM pr_activity")).toEqual([{number:5}]);
});
it("records malformed Stripe messages before acknowledging them", async () => {
  const ctx=testContext();const ack=vi.fn();
  await handleQueue({queue:"mergemate-stripe-events-dev",messages:[{body:{eventId:""},ack}]} as unknown as MessageBatch<unknown>,ctx.env,ctx.time.now());
  expect(ack).toHaveBeenCalledOnce();
  expect(ctx.db.rows("SELECT source,event FROM webhook_dead_letters")).toEqual([{source:"stripe",event:"invalid_message"}]);
});
