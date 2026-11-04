import { spawn } from "node:child_process";
import { describe, expect, it, vi } from "vitest";
import { BrainApiClient } from "../src/client";
import { handleLine } from "../src/server";

const stubClient = (): BrainApiClient => {
  const fetchImpl = vi.fn(async () => ({ status: 200, text: async () => "{}" }));
  const client = new BrainApiClient({ baseUrl: "https://api.example.test", agentToken: "tok", fetchImpl });
  (client as unknown as Record<string, (...args: unknown[]) => Promise<unknown>>)["boardRead"] = async () => ({ project: {}, cards: [], trackTail: [] });
  return client;
};

const rpc = (id: number | null, method: string, params?: unknown): string =>
  JSON.stringify({ jsonrpc: "2.0", ...(id === null ? {} : { id }), method, ...(params === undefined ? {} : { params }) });

describe("stdio MCP server", () => {
  it("answers initialize, lists the 7 tools and routes calls", async () => {
    const client = stubClient();
    const init = JSON.parse((await handleLine(client, rpc(1, "initialize", { protocolVersion: "2024-11-05" }))) as string) as {
      result: { serverInfo: { name: string }; capabilities: { tools: unknown } };
    };
    expect(init.result.serverInfo.name).toBe("mergemate-brain");
    expect(init.result.capabilities.tools).toEqual({});
    const list = JSON.parse((await handleLine(client, rpc(2, "tools/list"))) as string) as {
      result: { tools: Array<{ name: string }> };
    };
    expect(list.result.tools.map((t) => t.name)).toHaveLength(7);
    const call = JSON.parse(
      (await handleLine(client, rpc(3, "tools/call", { name: "board_read", arguments: {} }))) as string,
    ) as { result: { content: Array<{ text: string }> } };
    expect(call.result.content[0]?.text).toContain("cards");
    const missing = JSON.parse(
      (await handleLine(client, rpc(4, "tools/call", { name: "nope", arguments: {} }))) as string,
    ) as { result: { isError: boolean } };
    expect(missing.result.isError).toBe(true);
  });

  it("never answers notifications and reports parse errors", async () => {
    const client = stubClient();
    expect(await handleLine(client, rpc(99, "notifications/initialized"))).toBeNull();
    expect(await handleLine(client, "  ")).toBeNull();
    const bad = JSON.parse((await handleLine(client, "{oops")) as string) as { error: { code: number } };
    expect(bad.error.code).toBe(-32700);
    const unknown = JSON.parse((await handleLine(client, rpc(5, "resources/list"))) as string) as {
      error: { code: number };
    };
    expect(unknown.error.code).toBe(-32601);
  });

  it("serves initialize and tools/list over a real stdio round trip", async () => {
    const child = spawn("node", ["dist/server.js"], {
      cwd: new URL("..", import.meta.url),
      env: { ...process.env, BRAIN_API_BASE_URL: "https://api.example.test", BRAIN_AGENT_TOKEN: "tok" },
      stdio: ["pipe", "pipe", "pipe"],
    });
    const lines: string[] = [];
    let buffer = "";
    const done = new Promise<void>((resolve) => {
      child.stdout.on("data", (chunk: Buffer) => {
        buffer += chunk.toString();
        const parts = buffer.split("\n");
        buffer = parts.pop() ?? "";
        for (const line of parts) if (line.trim()) lines.push(line);
        if (lines.length >= 2) resolve();
      });
      // Fail fast on child crash instead of hanging until the test timeout.
      child.on("error", () => resolve());
      child.on("exit", () => resolve());
    });
    child.stdin.write(rpc(1, "initialize", { protocolVersion: "2024-11-05" }) + "\n");
    child.stdin.write(rpc(2, "tools/list") + "\n");
    await done;
    child.kill();
    await new Promise((resolve) => child.on("close", resolve));
    expect(lines).toHaveLength(2);
    expect(JSON.parse(lines[0] as string)).toMatchObject({ id: 1, result: { serverInfo: { name: "mergemate-brain" } } });
    expect((JSON.parse(lines[1] as string) as { result: { tools: unknown[] } }).result.tools).toHaveLength(7);
  }, 30000);
});
