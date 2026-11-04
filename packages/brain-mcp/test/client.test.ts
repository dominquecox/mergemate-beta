import { describe, expect, it, vi } from "vitest";
import { BrainApiClient, BrainUnavailableError } from "../src/client";

const ok = (body: unknown, status = 200): { status: number; text: () => Promise<string> } => ({
  status,
  text: async () => (typeof body === "string" ? body : JSON.stringify(body)),
});

const project = {
  id: "owner/repo",
  owner: "owner",
  repo: "repo",
  rules: "Follow the rules.",
  createdAt: "2026-11-04T14:00:00Z",
};
const card = {
  id: "card-1",
  projectId: "owner/repo",
  position: 0,
  title: "Fix the label",
  details: "The label is wrong.",
  priority: "P1",
  status: "open",
  doneWhen: "Label reads correctly.",
  updatedAt: "2026-11-04T14:00:00Z",
};
const lock = { cardId: "card-1", agent: "muse", tool: "muse", since: "2026-11-04T14:00:00Z", expiresAt: "2026-11-04T15:00:00Z" };

describe("brain API client transport", () => {
  it("uses the runtime fetch when no stub is given, with the token only in the Authorization header", async () => {
    const seen: { url: string; init: RequestInit }[] = [];
    vi.stubGlobal("fetch", async (url: string, init: RequestInit) => {
      seen.push({ url, init });
      return new Response(JSON.stringify({ project, cards: [card], trackTail: [] }), { status: 200 });
    });
    try {
      const client = new BrainApiClient({ baseUrl: "https://api.example.test/", agentToken: "mmb_secret" });
      await expect(client.boardRead()).resolves.toMatchObject({ cards: [{ id: "card-1" }] });
      expect(seen[0]?.url).toBe("https://api.example.test/agent/v1/brain/board");
      expect((seen[0]?.init.headers as Record<string, string>)["authorization"]).toBe("Bearer mmb_secret");
      expect(seen[0]?.url).not.toContain("mmb_secret");
      expect(seen[0]?.init.redirect).toBe("error");
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it("passes the API's error code and message through, without the token", async () => {
    const client = new BrainApiClient({
      baseUrl: "https://api.example.test",
      agentToken: "mmb_secret",
      fetchImpl: async () => ok({ error: { code: "not_found", message: "No open card is free right now.", requestId: "r1" } }, 404),
    });
    const failure = client.proceedWithTrack("p1");
    await expect(failure).rejects.toThrow("brain_api_error: not_found: No open card is free right now.");
    await expect(failure).rejects.not.toThrow(/mmb_secret/);
  });
});

describe("brain API client (merged routes)", () => {
  it("reads the board with GET and the token, parsing contracts", async () => {
    const fetchImpl = vi.fn(async () => ok({ project, cards: [card], trackTail: [] }));
    const client = new BrainApiClient({ baseUrl: "https://api.example.test", agentToken: "tok", fetchImpl });
    const board = await client.boardRead();
    expect(fetchImpl).toHaveBeenCalledOnce();
    const [url, init] = fetchImpl.mock.calls[0] as unknown as [string, { method: string; headers: Record<string, string> }];
    expect(url).toBe("https://api.example.test/agent/v1/brain/board");
    expect(init.method).toBe("GET");
    expect(init.headers["authorization"]).toBe("Bearer tok");
    expect(board.cards).toHaveLength(1);
  });

  it("proceeds with only the project id and parses the full context", async () => {
    const fetchImpl = vi.fn(async (url: string, init: { body?: string }) => {
      expect(url).toBe("https://api.example.test/agent/v1/brain/proceed");
      expect(JSON.parse(init.body ?? "{}")).toEqual({ projectId: "owner/repo" });
      return ok({ card, lock, rules: "Follow the rules.", boardTop: [card], trackTail: [] });
    });
    const client = new BrainApiClient({ baseUrl: "https://api.example.test/", agentToken: "tok", fetchImpl });
    const response = await client.proceedWithTrack("owner/repo");
    expect(response.rules).toBe("Follow the rules.");
  });

  it("sends projectId on lock, heartbeat, handoff and PR link", async () => {
    const seen: Array<{ url: string; body: unknown }> = [];
    const fetchImpl = vi.fn(async (url: string, init: { body?: string }) => {
      seen.push({ url, body: JSON.parse(init.body ?? "{}") });
      if (url.endsWith("/lock") || url.endsWith("/heartbeat")) return ok({ lock });
      if (url.endsWith("/handoff")) return ok({ handedOff: true });
      if (url.endsWith("/pr")) return ok({ card });
      throw new Error(`unexpected ${url}`);
    });
    const client = new BrainApiClient({ baseUrl: "https://api.example.test", agentToken: "tok", fetchImpl });
    await client.cardLock({ projectId: "o/r", cardId: "c", agent: "a", tool: "muse", ttlSeconds: 600 });
    await client.cardHeartbeat({ projectId: "o/r", cardId: "c", agent: "a", tool: "muse" });
    await client.cardHandoff({ projectId: "o/r", cardId: "c", agent: "a", stoppedAt: "done", next: "merge" });
    await client.prLink({ projectId: "o/r", cardId: "c", prNumber: 7, head: "a".repeat(40) });
    expect(seen.map((s) => s.url)).toEqual([
      "https://api.example.test/agent/v1/brain/lock",
      "https://api.example.test/agent/v1/brain/heartbeat",
      "https://api.example.test/agent/v1/brain/handoff",
      "https://api.example.test/agent/v1/brain/pr",
    ]);
    for (const s of seen) expect(s.body).toMatchObject({ projectId: "o/r" });
  });

  it("logs only client kinds and posts to /log", async () => {
    const fetchImpl = vi.fn(async (url: string) => {
      expect(url).toBe("https://api.example.test/agent/v1/brain/log");
      return ok({ logged: true });
    });
    const client = new BrainApiClient({ baseUrl: "https://api.example.test", agentToken: "tok", fetchImpl });
    await expect(client.trackLog({ projectId: "o/r", kind: "note", actor: "a", text: "t" })).resolves.toEqual({ logged: true });
  });

  it("fails closed on missing API, refuses bad shapes and oversized bodies", async () => {
    const failing = vi.fn(async () => ({ status: 404, text: async () => "nope" }));
    const missing = new BrainApiClient({ baseUrl: "https://api.example.test", agentToken: "tok", fetchImpl: failing });
    await expect(missing.boardRead()).rejects.toBeInstanceOf(BrainUnavailableError);
    const shapeless = new BrainApiClient({
      baseUrl: "https://api.example.test",
      agentToken: "tok",
      fetchImpl: async () => ok({ wrong: true }),
    });
    await expect(shapeless.boardRead()).rejects.toThrow(/invalid shape/);
    const big = new BrainApiClient({
      baseUrl: "https://api.example.test",
      agentToken: "tok",
      fetchImpl: async () => ({ status: 200, text: async () => "x".repeat(17 * 1024 * 1024) }),
    });
    await expect(big.boardRead()).rejects.toThrow(/too large/);
    expect(() => new BrainApiClient({ baseUrl: "http://api.example.test", agentToken: "tok" })).toThrow(
      BrainUnavailableError,
    );
    expect(() => new BrainApiClient({ baseUrl: "https://api.example.test", agentToken: "" })).toThrow(
      BrainUnavailableError,
    );
  });
});
