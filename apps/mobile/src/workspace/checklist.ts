import type {ReviewPlan} from "../types";

/** The review plan as a Markdown task list, for pasting into notes. Copy only; MergeMate never posts it. */
export function checklistMarkdown(plan: Pick<ReviewPlan, "readingOrder" | "verify">, title = "Review checklist"): string {
  const lines = [`## ${title}`, ""];
  if (plan.readingOrder.length) {
    lines.push("**Read in this order**", "");
    plan.readingOrder.forEach((item, index) => lines.push(`${index + 1}. \`${item.file}\`: ${item.why}`));
    lines.push("");
  }
  lines.push("**Verify before approving**", "");
  if (plan.verify.length) for (const item of plan.verify) lines.push(`- [ ] ${item}`);
  else lines.push("- [ ] Nothing specific to verify");
  return `${lines.join("\n")}\n`;
}
