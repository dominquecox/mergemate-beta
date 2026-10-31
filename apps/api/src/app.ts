import {searchPrs} from './routes/search';
import { Hono } from "hono";
import { bodyLimit } from "hono/body-limit";
import type { AppEnv, Deps } from "./env";
import { ApiError, ConfigError, errorResponse } from "./errors";
import { cors } from "./middleware/cors";
import { provideDeps } from "./middleware/deps";
import { requestId } from "./middleware/request-id";
import { securityHeaders } from "./middleware/security-headers";
import { flags } from "./routes/flags";
import { authenticate, limitPreflight } from "./middleware/session";
import { metaKey } from './routes/meta-key';
import { settings } from './routes/settings';
import { push } from './routes/push';
import { billing } from "./routes/billing";
import { billingWebhooks } from "./routes/billing-webhooks";
import { account } from "./routes/account";
import { activity } from "./routes/activity";
import { createAiRouter } from "./routes/ai";
import { aiEngine } from "./routes/ai-engine-info";
import { auth } from "./routes/auth";
import { createConsentRouter } from "./routes/consent";
import { github } from "./routes/github";
import { health } from "./routes/health";
import { createHighlightRouter } from "./routes/highlight";
import { createVoiceNotesRouter } from "./routes/voice-notes";
import {notes} from "./routes/notes";
import { notifications } from "./routes/notifications";
import { publicContent } from "./routes/public";
import { telemetry } from "./routes/telemetry";
import { createTriageRouter } from "./routes/triage";
import { webhooks } from "./routes/webhooks";

const MAX_BODY_BYTES = 1024 * 1024;
const MAX_UPLOAD_BYTES = 5 * 1024 * 1024;

const defaultDeps: Deps = { fetch: (input, init) => fetch(input, init), now: () => new Date() };

export const createApp = (deps: Deps = defaultDeps) => {
  const app = new Hono<AppEnv>();

  app.use(requestId());
  app.use(securityHeaders());
  app.use(provideDeps(deps));
  // Preflights are answered by CORS without reaching later middleware, so they are
  // IP-limited here; everything else is limited in authenticate(). CORS stays before
  // authenticate so 401/429 responses keep Access-Control-Allow-Origin for the web app.
  app.use(limitPreflight());
  app.use(cors());
  app.use(authenticate());
  const jsonLimit = bodyLimit({
    maxSize: MAX_BODY_BYTES,
    onError: (c) => errorResponse(c, "payload_too_large", "Request body is too large."),
  });
  const uploadLimit = bodyLimit({
    maxSize: MAX_UPLOAD_BYTES,
    onError: (c) => errorResponse(c, "payload_too_large", "Request body is too large."),
  });
  // The GitHub webhook enforces its own cap on the raw body; uploads keep a 5 MB cap here.
  app.use((c, next) => {
    if (c.req.path === "/v1/webhooks/github") return next();
    return c.req.path === "/v1/highlight" || c.req.path === "/v1/voice-notes" || c.req.path === "/v1/webhooks/stripe"
      ? uploadLimit(c, next)
      : jsonLimit(c, next);
  });

  app.route("/v1/health", health);
  // Flags rides the same IP limit as every other public route via authenticate().
  app.route("/v1", flags);
  app.route("/v1", auth);
  app.route("/v1", account);
  app.route("/v1", billing);
  app.route("/v1", settings);
  app.route("/v1", metaKey);
  app.route("/v1", push);
  app.route("/v1", billingWebhooks);
  app.route("/v1", github);
  app.route("/v1", notifications);
  app.route("/v1", notes);
  app.route("/v1", searchPrs);
  app.route("/v1", telemetry);
  app.route("/v1", activity);
  app.route("/v1", publicContent);
  app.route("/v1", webhooks);
  app.route("/v1/consent", createConsentRouter());
  app.route("/v1/ai", aiEngine);
  app.route("/v1/prs", createAiRouter());
  app.route("/v1/triage", createTriageRouter());
  app.route("/v1/highlight", createHighlightRouter());
  app.route("/v1/voice-notes", createVoiceNotesRouter());

  app.notFound((c) => errorResponse(c, "not_found", "Not found."));

  app.onError((err, c) => {
    const requestId = c.get("requestId");
    if (err instanceof ConfigError) {
      console.error(JSON.stringify({ requestId, code: err.code, detail: err.detail }));
    }
    if (err instanceof ApiError) {
      if (err.logDetail) console.error(JSON.stringify({ requestId, code: err.code, detail: err.logDetail, path: c.req.path }));
      return errorResponse(c, err.code, err.message, err.headers);
    }
    // Log only the error type: messages may carry request data.
    console.error(JSON.stringify({ requestId, code: "internal", error: err.name }));
    return errorResponse(c, "internal", "Something went wrong.");
  });

  return app;
};
