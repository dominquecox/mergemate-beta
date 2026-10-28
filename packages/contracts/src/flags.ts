import { z } from 'zod';

/** Public, non-user feature switches. Unknown flags are never part of the contract. */
export const FeatureFlags = z.object({
  voice_readout: z.boolean().default(false),
  voice_notes: z.boolean().default(false),
  highlight: z.boolean().default(false),
}).strict();
export type FeatureFlags = z.infer<typeof FeatureFlags>;
