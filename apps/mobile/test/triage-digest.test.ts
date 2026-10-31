import { describe, expect, it } from "vitest";
import { triageDigest } from "../src/workspace/triageDigest";
import type { TriageItem } from "../src/types";

const item = (lane: TriageItem["lane"]): TriageItem => ({ prRef: `o/r#${Math.random()}`, lane, reason: "x" });

describe("triage digest", () => {
  it("counts the remaining deck by lane and says where to start", () => {
    const d = triageDigest([item("needs_you"), item("needs_you"), item("fyi"), item("ignore")]);
    expect(d).toMatchObject({ needsYou: 2, fyi: 1, ignore: 1 });
    expect(d.sentence).toBe("2 pull requests need you. 2 others can wait.");
  });
  it("handles one, none and an empty deck", () => {
    expect(triageDigest([item("needs_you")]).sentence).toBe("1 pull request needs you. Nothing else is waiting.");
    expect(triageDigest([item("fyi")]).sentence).toBe("Nothing needs you right now. 1 item is FYI or ignorable.");
    expect(triageDigest([]).sentence).toBe("Deck cleared. Nothing left to sort.");
  });
});
