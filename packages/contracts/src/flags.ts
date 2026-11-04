import { z } from 'zod';

/** Public, non-user feature switches. Unknown flags are never part of the contract. */
export const FeatureFlags = z.object({
  voice_readout: z.boolean().default(false),
  voice_notes: z.boolean().default(false),
  highlight: z.boolean().default(false),
  /** The brain (boards for coding agents). Sent only when on, so app builds that predate it still parse the document. */
  brain: z.boolean().optional(),
}).strict();
export type FeatureFlags = z.infer<typeof FeatureFlags>;
