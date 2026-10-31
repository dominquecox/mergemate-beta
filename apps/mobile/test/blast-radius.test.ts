import { describe, expect, it } from "vitest";
import type { PrFile } from "../src/types";
import { detectBlastRadius } from "../src/workspace/blastRadius";

function makeFile(filename: string, additions = 10, deletions = 2): PrFile {
  return {
    filename,
    status: "modified",
    additions,
    deletions,
  };
}

describe("detectBlastRadius", () => {
  it("returns empty array when files is empty", () => {
    expect(detectBlastRadius([])).toEqual([]);
  });

  it("detects auth, database, and billing domains with high severity", () => {
    const files = [
      makeFile("apps/api/src/routes/auth.ts"),
      makeFile("apps/api/migrations/0014_session.sql"),
      makeFile("apps/api/src/routes/billing.ts"),
    ];

    const domains = detectBlastRadius(files);
    expect(domains.map((d) => d.id)).toContain("auth");
    expect(domains.map((d) => d.id)).toContain("database");
    expect(domains.map((d) => d.id)).toContain("billing");

    const authDomain = domains.find((d) => d.id === "auth");
    expect(authDomain?.severity).toBe("high");
    expect(authDomain?.files).toContain("apps/api/src/routes/auth.ts");
  });

  it("detects dependency changes and API endpoints", () => {
    const files = [
      makeFile("package.json"),
      makeFile("apps/api/src/routes/webhooks.ts"),
    ];

    const domains = detectBlastRadius(files);
    expect(domains.map((d) => d.id)).toContain("dependencies");
    expect(domains.map((d) => d.id)).toContain("api");
  });

  it("detects UI components with low severity", () => {
    const files = [makeFile("apps/mobile/src/components/Button.tsx")];

    const domains = detectBlastRadius(files);
    expect(domains).toHaveLength(1);
    expect(domains[0].id).toBe("ui");
    expect(domains[0].severity).toBe("low");
  });

  it("adjusts high severity to medium if only test files match a sensitive pattern", () => {
    const files = [makeFile("apps/api/test/auth.test.ts")];

    const domains = detectBlastRadius(files);
    const authDomain = domains.find((d) => d.id === "auth");
    expect(authDomain?.severity).toBe("medium");
  });

  it("sorts high severity domains first", () => {
    const files = [
      makeFile("apps/mobile/src/components/Header.tsx"),
      makeFile("apps/api/src/routes/session.ts"),
      makeFile("apps/api/src/routes/data.ts"),
    ];

    const domains = detectBlastRadius(files);
    expect(domains[0].severity).toBe("high");
    expect(domains[0].id).toBe("auth");
  });
});
