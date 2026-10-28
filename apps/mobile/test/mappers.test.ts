import { describe, it, expect } from "vitest";
import { githubUrl, httpsUrlOnHosts } from "../src/api/urls";
import { MockApiClient } from "../src/api/mock";
import { mapPostSummary } from "../src/api/mappers";

describe("link checks", () => {
  it("accepts https links on GitHub only", () => {
    expect(githubUrl("https://github.com/octo/repo/pull/7")).toBe("https://github.com/octo/repo/pull/7");
    expect(githubUrl("https://gist.github.com/x")).toBeTruthy();
    for (const bad of [
      "http://github.com/x",
      "https://github.com.evil.example/x",
      "https://evilgithub.com/x",
      "https://user:pw@github.com/x",
      "javascript:alert(1)",
      "mergemate://auth/callback?code=1",
      "",
      null,
      undefined,
    ]) {
      expect(githubUrl(bad as string | null | undefined)).toBeNull();
    }
  });

  it("checks Stripe hosts exactly", () => {
    expect(httpsUrlOnHosts("https://checkout.stripe.com/c/pay/x", ["checkout.stripe.com"])).toBeTruthy();
    expect(httpsUrlOnHosts("https://billing.stripe.com/p/x", ["checkout.stripe.com"])).toBeNull();
  });
});

describe("posts", () => {
  it("shows the excerpt and a plain date", () => {
    expect(
      mapPostSummary({ slug: "a", type: "changelog", title: "T", excerpt: "E", publishedAt: "2026-10-27T10:00:00.000Z" }),
    ).toMatchObject({ date: "2026-10-27", summary: "E", content: "E", type: "changelog" });
  });

  it("safely unescapes literal escaped newlines from JSON content", () => {
    expect(
      mapPostSummary({
        slug: "b",
        type: "news",
        title: "Newline Test",
        excerpt: "Line 1\\n\\nLine 2\\r\\nLine 3",
        publishedAt: "2026-10-27T12:00:00.000Z",
      }),
    ).toMatchObject({
      summary: "Line 1\n\nLine 2\nLine 3",
      content: "Line 1\n\nLine 2\nLine 3",
    });
  });
});

describe("sample-data client keeps up with the interface", () => {
  it("serves the new settings shape and installation list", async () => {
    const client = new MockApiClient();
    const settings = await client.getSettings();
    expect(settings.notifications).toEqual({ review: true, mention: true, mine: true });
    const updated = await client.updateSettings({ notifications: { review: false, mention: true, mine: true } });
    expect(updated.notifications.review).toBe(false);
    expect(updated.notifications.mention).toBe(true);

    const { items, installUrl } = await client.getOrgInstallations();
    expect(items.length).toBeGreaterThan(0);
    expect(installUrl).toMatch(/^https:\/\/github\.com\//);
  });
});
