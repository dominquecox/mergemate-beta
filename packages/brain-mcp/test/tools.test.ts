import { describe, expect, it, vi } from "vitest";
import { BrainApiClient } from "../src/client";
import { TOOL_DEFINITIONS, dispatchTool } from "../src/tools";

const stubClient = (): { client: BrainApiClient; calls: { name: string; args: unknown[] }[] } => {
  const calls: { name: string; args: unknown[] }[] = [];
  const fetchImpl = vi.fn(async () => ({ status: 200, text: async () => "{}" }));
  const client = new BrainApiClient({ baseUrl: "https://api.example.test", agentToken: "tok", fetchImpl });
  for (const name of ["boardRead", "proceedWithTrack", "cardLock", "cardHeartbeat", "cardHandoff", "trackLog", "prLink"] as const) {
    (client as unknown as Record<string, (...args: unknown[]) => Promise<unknown>>)[name] = async (...args: unknown[]) => {
      calls.push({ name, args });
      return {};
    };
  }
  return { client, calls };
};

describe("brain MCP tools", () => {
  it("defines exactly the seven spec tools", () => {
    expect(TOOL_DEFINITIONS.map((tool) => tool.name)).toEqual([
      "board_read",
      "proceed_with_track",
      "card_lock",
      "card_heartbeat",
      "card_handoff",
      "track_log",
      "pr_link",
    ]);
  });

  it("marks ttlSeconds required on card_lock, as the contract does", () => {
    const lock = TOOL_DEFINITIONS.find((tool) => tool.name === "card_lock");
    expect((lock?.inputSchema as { required: string[] }).required).toContain("ttlSeconds");
  });

  it("routes each tool to its API call with the project id", async () => {
    const { client, calls } = stubClient();
    const head = "a".repeat(40);
    await dispatchTool(client, "board_read", {});
    await dispatchTool(client, "proceed_with_track", { projectId: "o/r" });
    await dispatchTool(client, "card_lock", { projectId: "o/r", cardId: "c", agent: "a", tool: "muse", ttlSeconds: 60 });
    await dispatchTool(client, "card_heartbeat", { projectId: "o/r", cardId: "c", agent: "a", tool: "muse" });
    await dispatchTool(client, "card_handoff", { projectId: "o/r", cardId: "c", agent: "a", stoppedAt: "done", next: "merge" });
    await dispatchTool(client, "track_log", { projectId: "o/r", kind: "note", actor: "a", text: "t" });
    await dispatchTool(client, "pr_link", { projectId: "o/r", cardId: "c", prNumber: 7, head });
    expect(calls.map((call) => call.name)).toEqual([
      "boardRead",
      "proceedWithTrack",
      "cardLock",
      "cardHeartbeat",
      "cardHandoff",
      "trackLog",
      "prLink",
    ]);
  });

  it("rejects unknown tools and server-owned event kinds before any request", async () => {
    const fetchImpl = vi.fn(async () => ({ status: 200, text: async () => "{}" }));
    const counting = new BrainApiClient({ baseUrl: "https://api.example.test", agentToken: "tok", fetchImpl });
    await expect(dispatchTool(counting, "nope", {})).rejects.toThrow(/unknown_tool/);
    await expect(
      dispatchTool(counting, "track_log", { projectId: "o/r", kind: "merged", actor: "a", text: "t" }),
    ).rejects.toThrow(/not client-loggable/);
    await expect(dispatchTool(counting, "pr_link", { projectId: "o/r", cardId: "c", prNumber: 7, head: "short" })).rejects.toThrow();
    expect(fetchImpl).not.toHaveBeenCalled();
  });
});
