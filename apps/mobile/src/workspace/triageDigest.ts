import type { TriageItem } from "../types";

export interface TriageDigest {
  needsYou: number;
  fyi: number;
  ignore: number;
  /** One plain sentence built from the suggested lanes. No model call. */
  sentence: string;
}

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

/** Counts of what is still in the deck, by suggested lane, with one sentence that says where to start. */
export function triageDigest(queue: readonly TriageItem[]): TriageDigest {
  const count = (lane: TriageItem["lane"]) => queue.filter((item) => item.lane === lane).length;
  const needsYou = count("needs_you");
  const fyi = count("fyi");
  const ignore = count("ignore");
  const sentence =
    queue.length === 0
      ? "Deck cleared. Nothing left to sort."
      : needsYou > 0
        ? `${plural(needsYou, "pull request needs", "pull requests need")} you. ${fyi + ignore > 0 ? `${plural(fyi + ignore, "other can", "others can")} wait.` : "Nothing else is waiting."}`
        : `Nothing needs you right now. ${plural(fyi + ignore, "item is", "items are")} FYI or ignorable.`;
  return { needsYou, fyi, ignore, sentence };
}
