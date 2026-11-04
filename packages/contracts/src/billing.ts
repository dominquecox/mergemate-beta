import { z } from "zod";
import { IsoDateTime } from "./common";
export const BillingPlan = z.object({
  plan: z.enum(["free", "pro"]),
  status: z.string(),
  renewsAt: IsoDateTime.nullable(),
  cancelAt: IsoDateTime.nullable(),
  /** True until this account has had a subscription; the 7-day trial is for a first subscription only. Missing (an older API) reads as false. */
  trialEligible: z.boolean().default(false),
  /** True when a billing account with history exists, so the portal can be opened (including after a fall back to Free). */
  canManage: z.boolean().default(false),
  /** Today's AI actions for this account's plan. Missing (an older API) means unknown. */
  aiActions: z.object({ limit: z.number().int().nonnegative(), remaining: z.number().int().nonnegative() }).optional(),
});
export type BillingPlan = z.infer<typeof BillingPlan>;
export const CheckoutRequest = z.object({ priceKey: z.enum(["pro_monthly", "pro_annual"]) }).strict();
export type CheckoutRequest = z.infer<typeof CheckoutRequest>;
export const BillingLink = z.object({ url: z.url() });
export type BillingLink = z.infer<typeof BillingLink>;
