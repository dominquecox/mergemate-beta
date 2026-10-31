import { describe, expect, it } from "vitest";
import { suggestedQuestions } from "../src/workspace/starters";

describe("Ask this PR starter questions", () => {
  it("always returns three", () => {
    for (const files of [[], ["a.ts"], ["db/migrations/001.sql", "src/auth/login.ts", "a.test.ts"]]) expect(suggestedQuestions(files)).toHaveLength(3);
  });
  it("falls back to the generic questions with no files", () => {
    expect(suggestedQuestions([])).toEqual(["What could break?", "Is this change tested?", "What should I read first?"]);
  });
  it("names the migration and auth files, using base names only", () => {
    const questions = suggestedQuestions(["db/migrations/001_users.sql", "src/auth/session.ts", "src/auth/session.test.ts"]);
    expect(questions[0]).toBe("Is 001_users.sql safe to run on existing data?");
    expect(questions[1]).toBe("Does session.ts change who can do what?");
    expect(questions.join(" ")).not.toContain("db/migrations");
  });
  it("asks about missing tests when no test file changed", () => {
    expect(suggestedQuestions(["src/a.ts"])).toContain("Why are there no test changes?");
  });
});
