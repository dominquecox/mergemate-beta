import { z } from "zod";
import { IsoDateTime } from "./common";
export const BillingPlan = z.object({
  plan: z.enum(["free", "pro"]),
  status: z.string(),
  renewsAt: IsoDateTime.nullable(),
  cancelAt: IsoDateTime.nullable(),
});
export type BillingPlan = z.infer<typeof BillingPlan>;
export const CheckoutRequest = z.object({ priceKey: z.enum(["pro_monthly", "pro_annual"]) }).strict();
export type CheckoutRequest = z.infer<typeof CheckoutRequest>;
export const BillingLink = z.object({ url: z.url() });
export type BillingLink = z.infer<typeof BillingLink>;
