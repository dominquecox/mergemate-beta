export function codeNames(source: string): Set<string>;
export function fileNames(text: string): { set: Set<string>; optional: Set<string> };
export const ROTATION_ONLY: Set<string>;
export function compare(input: {
  code: Set<string>;
  example: { set: Set<string>; optional: Set<string> };
  local: { set: Set<string>; optional: Set<string> } | null;
}): { problems: string[]; warnings: string[] };
