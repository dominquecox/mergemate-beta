import { Hono } from "hono";
import { bodyLimit } from "hono/body-limit";
import type { AppEnv, Deps } from "./env";
import { ApiError, ConfigError, errorResponse } from "./errors";
import { cors } from "./middleware/cors";
import { provideDeps } from "./middleware/deps";
import { requestId } from "./middleware/request-id";
import { securityHeaders } from "./middleware/security-headers";
import { authenticate } from "./middleware/session";
import { billing } from "./routes/billing";
import { billingWebhooks } from "./routes/billing-webhooks";
import { account } from "./routes/account";
import { activity } from "./routes/activity";
import { auth } from "./routes/auth";
import { github } from "./routes/github";
import { health } from "./routes/health";
import { notifications } from "./routes/notifications";
import { publicContent } from "./routes/public";
import { telemetry } from "./routes/telemetry";
import { webhooks } from "./routes/webhooks";

const MAX_BODY_BYTES = 1024 * 1024;

const defaultDeps: Deps = { fetch: (input, init) => fetch(input, init), now: () => new Date() };

export const createApp = (deps: Deps = defaultDeps) => {
  const app = new Hono<AppEnv>();

  app.use(requestId());
  app.use(securityHeaders());
  app.use(provideDeps(deps));
  app.use(cors());
  // Rate limits and sessions run before any route logic.
  app.use(authenticate());
  const jsonLimit = bodyLimit({
    maxSize: MAX_BODY_BYTES,
    onError: (c) => errorResponse(c, "payload_too_large", "Request body is too large."),
  });
  const stripeLimit = bodyLimit({
    maxSize: 5 * MAX_BODY_BYTES,
    onError: (c) => errorResponse(c, "payload_too_large", "Request body is too large."),
  });
  // The GitHub webhook enforces its own cap on the raw body; Stripe keeps a 5 MB cap here.
  app.use((c, next) => {
    if (c.req.path === "/v1/webhooks/github") return next();
    return c.req.path === "/v1/webhooks/stripe" ? stripeLimit(c, next) : jsonLimit(c, next);
  });

  app.route("/v1/health", health);
  app.route("/v1", auth);
  app.route("/v1", account);
  app.route("/v1", billing);
  app.route("/v1", billingWebhooks);
  app.route("/v1", github);
  app.route("/v1", notifications);
  app.route("/v1", telemetry);
  app.route("/v1", activity);
  app.route("/v1", publicContent);
  app.route("/v1", webhooks);

  app.notFound((c) => errorResponse(c, "not_found", "Not found."));

  app.onError((err, c) => {
    const requestId = c.get("requestId");
    if (err instanceof ConfigError) {
      console.error(JSON.stringify({ requestId, code: err.code, detail: err.detail }));
    }
    if (err instanceof ApiError) {
      return errorResponse(c, err.code, err.message, err.headers);
    }
    // Log only the error type: messages may carry request data.
    console.error(JSON.stringify({ requestId, code: "internal", error: err.name }));
    return errorResponse(c, "internal", "Something went wrong.");
  });

  return app;
};
