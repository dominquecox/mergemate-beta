export interface TourStep {
  title: string;
  body: string;
}

/** The two-minute path through the high-risk sample pull request. Sample data only. */
export const DEMO_TOUR_STEPS: readonly TourStep[] = [
  { title: "1 of 4 · Summary", body: "Read what changed and why it matters in two sentences, then the parts worth your attention." },
  { title: "2 of 4 · Risk", body: "The risk rating comes with plain-English reasons, each tied to the file or check that earned it." },
  { title: "3 of 4 · Review plan", body: "A suggested reading order with a reason for each file and a checklist to verify before approving." },
  { title: "4 of 4 · Ask this PR", body: "Ask a question and get an answer that cites only this pull request's real files." },
];

/** The sample pull request the tour opens on. It exists only in demo data. */
export const DEMO_TOUR_PATH = "/pr/ploonu-llc/typepress/412?tour=1";

export function clampTourStep(step: number): number {
  if (!Number.isFinite(step)) return 0;
  return Math.min(Math.max(Math.trunc(step), 0), DEMO_TOUR_STEPS.length - 1);
}
