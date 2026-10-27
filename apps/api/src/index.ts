import { createApp } from "./app";
import type { Env } from "./env";
import { handleQueue } from "./queues";

export { TokenRefresher } from "./token-refresher";

const app = createApp();

export default {
  fetch: app.fetch,
  queue: (batch: MessageBatch<unknown>, env: Env) => handleQueue(batch, env),
} satisfies ExportedHandler<Env>;
