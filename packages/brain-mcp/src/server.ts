/**
 * MM-119: stdio MCP server exposing the 7 brain tools.
 *
 * Speaks JSON-RPC 2.0 with newline-delimited messages on stdio (the same
 * framing MCP stdio transports use): `initialize`, `tools/list`,
 * `tools/call`, plus `ping`. Any agent host (Codex, Copilot, Claude Code)
 * runs it and points it at the merged brain API:
 *
 *   npm run build && node /path/to/packages/brain-mcp/dist/server.js
 *
 * with `BRAIN_API_BASE_URL` (e.g. https://api.mergemate.dev) and
 * `BRAIN_AGENT_TOKEN` (the `mmb_…` project token) in the environment.
 * The token travels only in the Authorization header, never in logs.
 */
import { realpathSync } from "node:fs";
import { pathToFileURL } from "node:url";
import { BrainApiClient, BrainUnavailableError } from "./client.ts";
import { TOOL_DEFINITIONS, dispatchTool } from "./tools.ts";

export const BRAIN_MCP_PROTOCOL_VERSION = "2024-11-05";
export const BRAIN_MCP_SERVER_NAME = "mergemate-brain";
export const BRAIN_MCP_SERVER_VERSION = "0.0.0";

interface JsonRpcRequest {
  jsonrpc: "2.0";
  id: string | number | null;
  method: string;
  params?: unknown;
}

interface JsonRpcResponse {
  jsonrpc: "2.0";
  id: string | number | null;
  result?: unknown;
  error?: { code: number; message: string };
}

const isRequest = (value: unknown): value is JsonRpcRequest =>
  typeof value === "object" &&
  value !== null &&
  (value as Record<string, unknown>)["jsonrpc"] === "2.0" &&
  typeof (value as Record<string, unknown>)["method"] === "string" &&
  ("id" in (value as Record<string, unknown>)
    ? (value as Record<string, unknown>)["id"] === null ||
      typeof (value as Record<string, unknown>)["id"] === "string" ||
      typeof (value as Record<string, unknown>)["id"] === "number"
    : true);

const ok = (id: string | number | null, result: unknown): JsonRpcResponse => ({ jsonrpc: "2.0", id, result });
const fail = (id: string | number | null, code: number, message: string): JsonRpcResponse => ({
  jsonrpc: "2.0",
  id,
  error: { code, message },
});

const toolResult = (value: unknown): unknown => ({
  content: [{ type: "text", text: typeof value === "string" ? value : JSON.stringify(value) }],
});

const toolError = (message: string): unknown => ({
  content: [{ type: "text", text: message }],
  isError: true,
});

/**
 * Handles one parsed JSON-RPC message. Returns the response, or null for
 * notifications (no `id`) and `notifications/*` (never answered).
 */
export const handleMessage = async (client: BrainApiClient, message: unknown): Promise<JsonRpcResponse | null> => {
  if (!isRequest(message)) return fail(null, -32600, "Invalid Request");
  const { id, method, params } = message;
  const notified = id === undefined;
  if (method.startsWith("notifications/")) return null;
  if (notified) return null;
  if (method === "initialize") {
    return ok(id, {
      protocolVersion: BRAIN_MCP_PROTOCOL_VERSION,
      capabilities: { tools: {} },
      serverInfo: { name: BRAIN_MCP_SERVER_NAME, version: BRAIN_MCP_SERVER_VERSION },
    });
  }
  if (method === "ping") return ok(id, {});
  if (method === "tools/list") return ok(id, { tools: TOOL_DEFINITIONS });
  if (method === "tools/call") {
    const name =
      typeof params === "object" && params !== null
        ? (params as Record<string, unknown>)["name"]
        : undefined;
    const args =
      typeof params === "object" && params !== null ? (params as Record<string, unknown>)["arguments"] ?? {} : {};
    if (typeof name !== "string") return fail(id, -32602, "tools/call requires a tool name");
    try {
      return ok(id, toolResult(await dispatchTool(client, name, args)));
    } catch (error) {
      const messageText = error instanceof Error ? error.message : "Tool call failed";
      if (error instanceof BrainUnavailableError) return ok(id, toolError(`brain_unavailable: ${messageText}`));
      return ok(id, toolError(messageText));
    }
  }
  return fail(id, -32601, `Method not found: ${method}`);
};

/** Parses one stdio line; unparseable lines answer with a JSON-RPC parse error. */
export const handleLine = async (client: BrainApiClient, line: string): Promise<string | null> => {
  if (!line.trim()) return null;
  let message: unknown;
  try {
    message = JSON.parse(line) as unknown;
  } catch {
    return JSON.stringify(fail(null, -32700, "Parse error"));
  }
  const response = await handleMessage(client, message);
  return response ? JSON.stringify(response) : null;
};

export interface BrainServerEnv {
  BRAIN_API_BASE_URL?: string | undefined;
  BRAIN_AGENT_TOKEN?: string | undefined;
}

/** Builds the API client from the environment. Throws when misconfigured. */
export const clientFromEnv = (env: BrainServerEnv, fetchImpl?: ConstructorParameters<typeof BrainApiClient>[0]["fetchImpl"]): BrainApiClient =>
  new BrainApiClient({ baseUrl: env.BRAIN_API_BASE_URL ?? "", agentToken: env.BRAIN_AGENT_TOKEN ?? "", ...(fetchImpl ? { fetchImpl } : {}) });

/**
 * Entry point when run directly:
 * `node dist/server.js` (after `npm run build`) with `BRAIN_API_BASE_URL`
 * and `BRAIN_AGENT_TOKEN` set. Exits 2 on misconfiguration.
 */
export const main = async (
  env: NodeJS.ProcessEnv = process.env,
  stdin: NodeJS.ReadableStream & AsyncIterable<string> = process.stdin,
  stdout: { write: (line: string) => void } = process.stdout,
): Promise<void> => {
  stdin.setEncoding("utf8");
  await runStdio(clientFromEnv(env), stdin as AsyncIterable<string>, stdout);
};

/** Runs the server on stdio. Resolves when stdin closes. */
export const runStdio = async (
  client: BrainApiClient,
  stdin: AsyncIterable<string>,
  stdout: { write: (line: string) => void },
): Promise<void> => {
  let buffer = "";
  const flush = async (): Promise<void> => {
    const lines = buffer.split("\n");
    buffer = lines.pop() ?? "";
    for (const line of lines) {
      const out = await handleLine(client, line);
      if (out !== null) stdout.write(out + "\n");
    }
  };
  for await (const chunk of stdin) {
    buffer += chunk;
    await flush();
  }
  if (buffer.trim()) {
    const out = await handleLine(client, buffer);
    if (out !== null) stdout.write(out + "\n");
  }
};

const invokedAsMain = (() => {
  if (typeof process.argv[1] !== "string") return false;
  try {
    // Compare real paths, so a symlinked or spaced install path still starts the server.
    return pathToFileURL(realpathSync(process.argv[1])).href === pathToFileURL(realpathSync(new URL(import.meta.url))).href;
  } catch {
    return false;
  }
})();
if (invokedAsMain) {
  main().catch((error: unknown) => {
    process.stderr.write(error instanceof Error ? error.message + "\n" : "brain-mcp failed\n");
    process.exitCode = 2;
  });
}
