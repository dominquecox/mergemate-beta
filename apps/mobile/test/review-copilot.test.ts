import { describe, expect, it } from "vitest";
import { modelDisplayName } from "../src/format/model";
import { ApiClientError } from "../src/api/errors";
import { errorResponse, jsonResponse, makeClient } from "./helpers";

const TOKEN = "tok_aaaaaaaaaaaaaaaaaaaaaa";
const native = (handler: Parameters<typeof makeClient>[0]) => makeClient(handler, { platform: "native", token: TOKEN });
const coverage = { analyzedFiles: 2, skippedFiles: 0, truncatedFiles: 0 };

describe("review plan and ask client", () => {
  it("posts for a plan and validates the shape", async () => {
    const plan = {
      readingOrder: [{ file: "src/a.ts", why: "Core change." }],
      verify: ["Tests cover it."],
      draftComment: "Looks good.",
      coverage,
      model: "meta:muse-spark-1.3",
    };
    const { client, calls } = native(() => jsonResponse(plan));
    expect((await client.getReviewPlan("octo", "repo", 7)).readingOrder[0]?.file).toBe("src/a.ts");
    expect(calls.map((c) => `${c.method} ${c.path}`)).toEqual(["POST /prs/octo/repo/7/plan"]);
  });

  it("sends the question as the body and parses the answer", async () => {
    const { client, calls } = native(() => jsonResponse({ answer: "Yes.", citations: [{ file: "src/a.ts" }], coverage }));
    const answer = await client.askPr("octo", "repo", 7, "Is it tested?");
    expect(answer.citations).toEqual([{ file: "src/a.ts" }]);
    expect(calls[0]?.body).toEqual({ question: "Is it tested?" });
  });

  it("surfaces API errors and rejects malformed answers", async () => {
    const limited = native(() => errorResponse("rate_limited", 429, "Daily AI limit reached. Resets at midnight."));
    await expect(limited.client.askPr("octo", "repo", 7, "Question?")).rejects.toBeInstanceOf(ApiClientError);
    const bad = native(() => jsonResponse({ nonsense: true }));
    await expect(bad.client.getReviewPlan("octo", "repo", 7)).rejects.toBeInstanceOf(ApiClientError);
  });
});

describe("modelDisplayName", () => {
  it("names Meta models and the engine behind them", () => {
    expect(modelDisplayName("meta:muse-spark-1.3")).toBe("Meta Muse Spark 1.3");
    expect(modelDisplayName("meta:sam-3.1")).toBe("Meta SAM 3.1");
    expect(modelDisplayName("workers-ai:meta/muse-spark-open")).toBe("Meta Muse Spark Open on Workers AI");
    expect(modelDisplayName("workers-ai:@cf/cloudflare/clef-flash")).toBe("Cloudflare Clef");
    expect(modelDisplayName("sample:demo")).toBe("Sample data");
    expect(modelDisplayName(undefined)).toBeNull();
  });
});

describe("getAiEngine", () => {
  it("returns the engine info, or null when the API has none", async () => {
    const info = { profile: "hackathon", jobs: [{ task: "summary", model: "meta:muse-spark-1.3" }] };
    const ok = native(() => jsonResponse(info));
    expect((await ok.client.getAiEngine())?.jobs[0]?.model).toBe("meta:muse-spark-1.3");
    const missing = native(() => errorResponse("not_found", 404));
    expect(await missing.client.getAiEngine()).toBeNull();
    const garbled = native(() => jsonResponse({ nonsense: true }));
    expect(await garbled.client.getAiEngine()).toBeNull();
  });
});
