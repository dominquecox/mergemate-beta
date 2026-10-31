const DEFAULTS = ["What could break?", "Is this change tested?", "What should I read first?"];
const MIGRATION = /migrat/i;
const SENSITIVE = /(auth|login|session|password|payment|billing|stripe)/i;
const TEST = /(^|\/)(__tests__|tests?|spec)(\/|$)|\.(test|spec)\.[a-z]+$/i;

const base = (path: string): string => (path.split("/").pop() ?? path).slice(0, 40);

/** Three starter questions for Ask this PR, tied to the loaded files. Falls back to generic ones. */
export function suggestedQuestions(files: readonly string[]): string[] {
  const picks: string[] = [];
  const migration = files.find((f) => MIGRATION.test(f));
  const sensitive = files.find((f) => SENSITIVE.test(f) && !MIGRATION.test(f) && !TEST.test(f));
  const source = files.filter((f) => !TEST.test(f) && !MIGRATION.test(f));
  if (migration) picks.push(`Is ${base(migration)} safe to run on existing data?`);
  if (sensitive) picks.push(`Does ${base(sensitive)} change who can do what?`);
  if (files.length > 0 && !files.some((f) => TEST.test(f))) picks.push("Why are there no test changes?");
  else if (source[0]) picks.push(`Do the tests cover ${base(source[0])}?`);
  for (const q of DEFAULTS) if (picks.length < 3 && !picks.includes(q)) picks.push(q);
  return picks.slice(0, 3);
}
