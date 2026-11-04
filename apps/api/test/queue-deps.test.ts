import { afterEach, describe, expect, it, vi } from "vitest";
import { defaultQueueDeps } from "../src/queues";

afterEach(() => vi.unstubAllGlobals());

describe("queue consumer fetch", () => {
  it("calls fetch the way Workers requires, so background GitHub reads do not fail as 'GitHub is unavailable'", async () => {
    // Workers' fetch rejects any `this` other than the global scope, as a detached method call does.
    const workersFetch = vi.fn(function (this: unknown) {
      if (this !== undefined && this !== globalThis) throw new TypeError("Illegal invocation");
      return Promise.resolve(new Response("{}", { status: 200 }));
    });
    vi.stubGlobal("fetch", workersFetch);
    const res = await defaultQueueDeps().fetch("https://api.github.com/repos/acme/api");
    expect(res.status).toBe(200);
    expect(workersFetch).toHaveBeenCalledTimes(1);
  });
});
