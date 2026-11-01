import { describe, expect, it } from "vitest";
import { detectAgentProvenance } from "../src/workspace/provenance";

describe("detectAgentProvenance", () => {
  it("detects agent branch prefixes like claude/, cursor/, codex/, jules/", () => {
    const claudePr = detectAgentProvenance({
      author: "dominquecox",
      headBranch: "claude/project-thread-w0tprn",
      title: "docs(cos): CoS pickup pack",
    });
    expect(claudePr.isAgentAuthored).toBe(true);
    expect(claudePr.agentName).toBe("Claude");
    expect(claudePr.badgeLabel).toContain("Co-authored by Claude");

    const cursorPr = detectAgentProvenance({
      author: "dominquecox",
      headBranch: "cursor/fix-layout",
      title: "fix: layout gutters",
    });
    expect(cursorPr.isAgentAuthored).toBe(true);
    expect(cursorPr.agentName).toBe("Cursor");

    const codexPr = detectAgentProvenance({
      author: "dominquecox",
      headBranch: "codex/j001-summary-readout",
      title: "feat: summary readout",
    });
    expect(codexPr.isAgentAuthored).toBe(true);
    expect(codexPr.agentName).toBe("Codex");
  });

  it("detects bot authors like dependabot[bot] and github-actions", () => {
    const botPr = detectAgentProvenance({
      author: "dependabot[bot]",
      headBranch: "dependabot/npm_and_yarn/types-node",
      title: "chore(deps): bump types/node",
    });
    expect(botPr.isAgentAuthored).toBe(true);
    expect(botPr.agentName).toBe("Dependabot");
  });

  it("detects agent tags in PR title", () => {
    const titlePr = detectAgentProvenance({
      author: "someuser",
      headBranch: "patch-1",
      title: "[agent] automated schema alignment",
    });
    expect(titlePr.isAgentAuthored).toBe(true);
    expect(titlePr.agentName).toBe("AI Agent");
  });

  it("returns isAgentAuthored false for standard human branches and authors", () => {
    const humanPr = detectAgentProvenance({
      author: "octocat",
      headBranch: "feature/user-dashboard",
      title: "feat: add user dashboard profile view",
    });
    expect(humanPr.isAgentAuthored).toBe(false);
    expect(humanPr.agentName).toBeNull();
    expect(humanPr.badgeLabel).toBe("");
  });
});
