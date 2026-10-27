import { createApp } from './app';
import type { Env } from './env';
import { checkPushReceipts } from './lib/push';
import { handleQueue } from './queues';

export { TokenRefresher } from './token-refresher';

const app = createApp();

export default {
  fetch: app.fetch,
  queue: (batch: MessageBatch<unknown>, env: Env) => handleQueue(batch, env),
  scheduled: async (_event: ScheduledController, env: Env) => {
    await checkPushReceipts(env, { fetch: (input, init) => fetch(input, init), now: () => new Date() });
  },
} satisfies ExportedHandler<Env>;
