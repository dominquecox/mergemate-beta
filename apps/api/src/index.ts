import {purgeExpiredSessions} from './lib/sessions';
import { createApp } from './app';
import type { Env } from './env';
import { checkPushReceipts } from './lib/push';
import { handleQueue } from './queues';

export { RateAdmission } from './rate-admission';
export { TokenRefresher } from './token-refresher';

const app = createApp();

export default {
  fetch: app.fetch,
  queue: (batch: MessageBatch<unknown>, env: Env) => handleQueue(batch, env),
  scheduled: async (_event: ScheduledController, env: Env) => {
    if(env.DB)await purgeExpiredSessions(env.DB,new Date());
    await checkPushReceipts(env, { fetch: (input, init) => fetch(input, init), now: () => new Date() });
  },
} satisfies ExportedHandler<Env>;
