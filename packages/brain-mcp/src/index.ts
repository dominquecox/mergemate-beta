/**
 * MM-119 entry point. Exports the 7 tool definitions, dispatch, the merged
 * API client, and the stdio MCP server. Run the server with:
 * `npm run build && node dist/server.js`
 * (BRAIN_API_BASE_URL + BRAIN_AGENT_TOKEN in the environment).
 */
export {
  BRAIN_UNAVAILABLE,
  BrainApiClient,
  BrainUnavailableError,
  CardHandoffRequestSchema,
  CardHeartbeatRequestSchema,
  CardLockRequestSchema,
  LinkPrRequestSchema,
  ProceedWithTrackRequestSchema,
  ToolSchema,
  TrackLogRequestSchema,
} from "./client.ts";
export type {
  BrainClientOptions,
  Card,
  CardHandoffRequest,
  CardHeartbeatRequest,
  CardLockRequest,
  FetchImpl,
  LinkPrRequest,
  Lock,
  ProceedWithTrackResponse,
  Project,
  Tool,
  TrackEvent,
  TrackLogRequest,
} from "./client.ts";
export { CLIENT_EVENT_KINDS, TOOL_DEFINITIONS, dispatchTool } from "./tools.ts";
export type { BrainToolName, ToolDefinition } from "./tools.ts";
export {
  BRAIN_MCP_PROTOCOL_VERSION,
  BRAIN_MCP_SERVER_NAME,
  BRAIN_MCP_SERVER_VERSION,
  clientFromEnv,
  handleLine,
  handleMessage,
  main,
  runStdio,
} from "./server.ts";
export type { BrainServerEnv } from "./server.ts";
