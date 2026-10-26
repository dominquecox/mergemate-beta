import { z } from "zod";

export const TelemetryEventName = z.enum([
  "app_open",
  "sign_in",
  "sign_out",
  "demo_start",
  "demo_exit",
  "inbox_view",
  "inbox_filter",
  "notification_done",
  "notification_snooze",
  "pr_open",
  "pr_open_github",
  "summary_view",
  "risk_view",
  "triage_swipe",
  "search",
  "highlight_upload",
  "settings_change",
  "upgrade_click",
  "account_delete",
]);
export type TelemetryEventName = z.infer<typeof TelemetryEventName>;

/** Product event. Props hold no personal data, code, tokens or repository content. */
export const TelemetryEvent = z.object({
  name: TelemetryEventName,
  props: z
    .record(z.string().regex(/^[a-z_]{1,32}$/), z.union([z.string().max(64), z.number(), z.boolean()]))
    .refine((value) => Object.keys(value).length <= 8, "at most 8 props")
    .optional(),
});
export type TelemetryEvent = z.infer<typeof TelemetryEvent>;

export const ClientError = z.object({
  message: z.string().min(1).max(500),
  /** App route where the error happened, e.g. `/pr/[owner]/[repo]/[number]` (pattern, not values). */
  route: z.string().max(200).optional(),
  platform: z.enum(["ios", "web"]),
  appVersion: z.string().max(32),
});
export type ClientError = z.infer<typeof ClientError>;
