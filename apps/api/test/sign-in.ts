import { createHash, randomBytes } from "node:crypto";
import { createApp } from "../src/app";
import { json, type TestContext } from "./helpers";

export const verifierPair = () => {
  const verifier = randomBytes(32).toString("base64url");
  return { verifier, challenge: createHash("sha256").update(verifier).digest("base64url") };
};

export const ghUser: { id: number; login: string; name: string | null; avatar_url: string } = { id: 4242, login: "octo-dev", name: "Octo Dev", avatar_url: "https://avatars.githubusercontent.com/u/4242" };

export const tokenResponse = (n = 1) => ({
  access_token: `ghu_testaccess${n}`,
  expires_in: 28800,
  refresh_token: `ghr_testrefresh${n}`,
  refresh_token_expires_in: 15897600,
  token_type: "bearer",
});

export const appFor = (ctx: TestContext) => {
  const app = createApp(ctx.deps);
  return (path: string, init: RequestInit = {}) => app.request(path, init, ctx.env);
};

export const post = (body: unknown, headers: Record<string, string> = {}): RequestInit => ({
  method: "POST",
  headers: { "content-type": "application/json", ...headers },
  body: JSON.stringify(body),
});

/** Runs start + callback against fake GitHub. Returns the credentials for later requests. */
export const signIn = async (ctx: TestContext, platform: "ios" | "android" | "web" = "ios", user = ghUser) => {
  const call = appFor(ctx);
  ctx.net
    .on("POST", "https://github.com/login/oauth/access_token", () => json(tokenResponse()))
    .on("GET", "https://api.github.com/user", user);
  const { verifier, challenge } = verifierPair();
  const start = (await (await call("/v1/auth/github/start", post({ codeChallenge: challenge, platform }))).json()) as {
    state: string;
  };
  const res = await call("/v1/auth/github/callback", post({ code: "test-code", state: start.state, codeVerifier: verifier }));
  if (res.status !== 200) throw new Error(`sign-in failed: ${res.status} ${await res.text()}`);
  const body = (await res.json()) as { session: { token?: string; csrfToken?: string }; user: { id: string } };
  const cookie = res.headers.get("set-cookie")?.split(";")[0];
  const headers: Record<string, string> =
    platform !== "web" ? { authorization: `Bearer ${body.session.token}` } : { cookie: cookie ?? "" };
  return { headers, csrf: body.session.csrfToken, userId: body.user.id, res, body };
};
