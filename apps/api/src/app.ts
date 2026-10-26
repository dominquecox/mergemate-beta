import { Hono } from "hono";
import { bodyLimit } from "hono/body-limit";
import type { AppEnv } from "./env";
import { ApiError, ConfigError, errorResponse } from "./errors";
import { clientIp, rateLimit } from "./middleware/rate-limit";
import { requestId } from "./middleware/request-id";
import { securityHeaders } from "./middleware/security-headers";
import { health } from "./routes/health";

const MAX_BODY_BYTES = 1024 * 1024;

export const createApp = () => {
  const app = new Hono<AppEnv>();

  app.use(requestId());
  app.use(securityHeaders());
  app.use(
    rateLimit({
      name: "IP_RATE_LIMITER",
      limiter: (env) => env.IP_RATE_LIMITER,
      key: clientIp,
      retryAfter: 60,
    }),
  );
  app.use(
    bodyLimit({
      maxSize: MAX_BODY_BYTES,
      onError: (c) => errorResponse(c, "payload_too_large", "Request body is too large."),
    }),
  );

  app.route("/v1/health", health);

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
