import type { AnalysisCoverage, SecretFinding } from "@mergemate/contracts";

/** One credential pattern. The same set feeds redaction and the leak warning. */
export interface SecretRule {
  rule: string;
  pattern: RegExp;
}

export const SECRET_RULES: SecretRule[] = [
  { rule: "aws-access-key", pattern: /AKIA[0-9A-Z]{16}/g },
  { rule: "github-token", pattern: /gh[pousr]_[A-Za-z0-9]{16,}|github_pat_[A-Za-z0-9_]{20,}/g },
  { rule: "private-key", pattern: /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/g },
  {
    rule: "credential-assignment",
    pattern:
      /(?:api[_-]?key|client[_-]?secret|passwd|password|secret|token)\s*[:=]\s*['"]?[A-Za-z0-9_./+-]{12,}['"]?/gi,
  },
  {
    rule: "connection-string",
    pattern: /(?:postgres(?:ql)?|mysql|mongodb(?:\+srv)?|redis):\/\/[^\s'"]+/gi,
  },
  { rule: "bearer-token", pattern: /Bearer [A-Za-z0-9._~+/-]{12,}=*/g },
];

/** Replaces credential matches with [REDACTED] before any model call. */
export const redactSecrets = (text: string): { text: string; redacted: boolean } => {
  let redacted = false;
  let out = text;
  for (const { pattern } of SECRET_RULES) {
    pattern.lastIndex = 0;
    if (pattern.test(out)) {
      redacted = true;
      pattern.lastIndex = 0;
      out = out.replace(pattern, "[REDACTED]");
    }
  }
  return { text: out, redacted };
};

export const CREDENTIAL_NAME = /(?:api[_-]?key|client[_-]?secret|passwd|password|secret|token)[A-Za-z0-9_-]*/i;
// A quoted literal: `apiKey: "…"`, `password = '…'`. Template literals with `${` are code, not values.
export const QUOTED_CREDENTIAL = new RegExp(
  `${CREDENTIAL_NAME.source}['"]?\\s*[:=]\\s*(['"\`])([^'"\`\\s]{12,})\\1`, "i",
);
// An unquoted value that ends the line, as in .env or YAML: `API_KEY=…`, `token: …`.
export const BARE_CREDENTIAL = new RegExp(
  `${CREDENTIAL_NAME.source}['"]?\\s*[:=]\\s*([A-Za-z0-9_./+=-]{12,})\\s*(?:#.*)?$`, "i",
);
export const PLACEHOLDER = /^(?:x+|\*+|<.*>|\$\{.*\}|.*(?:changeme|example|placeholder|dummy|your[_-]|redacted).*)$/i;
// Words, identifiers and member chains without digits (`requireApiKey`, `config.apiKey`, `x-access-token`,
// `authorization_code`) are names, not values. Real generated credentials almost always contain digits.
export const NAME_LIKE = /^[A-Za-z_$][A-Za-z_$.-]*$/;
// URLs are endpoints; credentials embedded in a URL are caught by the connection-string rule.
export const URL_LIKE = /^[a-z][a-z0-9+.-]*:\/\//i;

export const credentialValue = (value: string | undefined): boolean =>
  !!value && !value.includes("${") && !PLACEHOLDER.test(value) && !NAME_LIKE.test(value) && !URL_LIKE.test(value);

/** True when a line assigns what looks like a real credential value to a credential-named key. */
export const assignsCredential = (line: string): boolean =>
  credentialValue(QUOTED_CREDENTIAL.exec(line)?.[2]) || credentialValue(BARE_CREDENTIAL.exec(line)?.[1]);

/** Warning rules: the precise credential check replaces the broad redaction pattern. */
export const DETECT_RULES: { rule: string; test: (line: string) => boolean }[] = SECRET_RULES.map(({ rule, pattern }) =>
  rule === "credential-assignment"
    ? { rule, test: assignsCredential }
    : { rule, test: (line: string) => { pattern.lastIndex = 0; return pattern.test(line); } },
);

export const HUNK = /^@@ -\d+(?:,\d+)? \+(\d+)(?:,\d+)? @@/;

/**
 * Finds possible leaked secrets in the lines this PR adds, with the file's own line number. Values are never
 * included. Removed and unchanged lines are not reported. A patch without hunk headers is read as new content.
 */
export const scanPatch = (file: string, patch: string): SecretFinding[] => {
  const findings: SecretFinding[] = [];
  let next = 1;
  let inHunk = false;
  for (const raw of patch.split("\n")) {
    const hunk = HUNK.exec(raw);
    if (hunk) {
      next = Number(hunk[1]);
      inHunk = true;
      continue;
    }
    if (raw.startsWith("\\")) continue; // "\ No newline at end of file"
    let text: string | null = raw;
    if (inHunk) {
      if (raw.startsWith("-")) continue;
      text = raw.startsWith("+") ? raw.slice(1) : null;
    }
    const line = next;
    next += 1;
    if (text === null) continue;
    for (const { rule, test } of DETECT_RULES) {
      if (test(text)) findings.push({ file, line, rule });
    }
  }
  return findings;
};

export interface PrFileInput {
  path: string;
  patch: string;
  additions?: number;
  deletions?: number;
}

export const SKIPPED_PATHS = [
  /package-lock\.json$/,
  /yarn\.lock$/,
  /pnpm-lock\.yaml$/,
  /Cargo\.lock$/,
  /Gemfile\.lock$/,
  /poetry\.lock$/,
  /\.min\.[^/]*$/,
  /(^|\/)(dist|build|vendor)\//,
  /\.snap$/,
  /\.map$/,
];
export const MAX_FILES = 300;
export const MAX_FILE_CHARS = 8000;
/** A truncated file shorter than this tells the model nothing; leave the room for smaller files instead. */
export const MIN_TRUNCATED_CHARS = 400;
export const FILE_SEPARATOR = "\n\n";
export const MAX_TOTAL_CHARS = 190000;
export const TRUNCATION_MARKER = "\n…[truncated]";

/** Trims a file list to the diff budget. Always reports analyzed, skipped and truncated counts. */
export const buildDiffContext = (
  input: {
    title: string;
    description: string;
    files: PrFileInput[];
  },
  maxTotalChars: number = MAX_TOTAL_CHARS,
): { context: string; coverage: AnalysisCoverage } => {
  const considered = input.files.slice(0, MAX_FILES);
  let skippedFiles = input.files.length - considered.length;
  const kept: { file: PrFileInput; changed: number }[] = [];
  for (const file of considered) {
    if (SKIPPED_PATHS.some((re) => re.test(file.path))) {
      skippedFiles += 1;
      continue;
    }
    kept.push({
      file,
      changed: (file.additions ?? 0) + (file.deletions ?? 0) || file.patch.length,
    });
  }
  kept.sort((a, b) => b.changed - a.changed);
  const head = `Title: ${input.title}\nDescription: ${input.description}\n`;
  let budget = Math.max(0, Math.min(maxTotalChars, MAX_TOTAL_CHARS) - head.length);
  const parts: string[] = [];
  let analyzedFiles = 0;
  let truncatedFiles = 0;
  for (const { file } of kept) {
    if (budget <= 0) {
      skippedFiles += 1;
      continue;
    }
    const body = `File: ${file.path}\n${file.patch}`;
    // The blank line that joins this part to the previous one counts against the budget too.
    const separator = parts.length > 0 ? FILE_SEPARATOR.length : 0;
    const room = Math.min(MAX_FILE_CHARS, budget - separator);
    if (body.length <= room) {
      parts.push(body);
      budget -= body.length + separator;
      analyzedFiles += 1;
    } else if (room >= MIN_TRUNCATED_CHARS) {
      // One long file uses at most its own share; the rest of the budget stays for the other files.
      parts.push(body.slice(0, room - TRUNCATION_MARKER.length) + TRUNCATION_MARKER);
      budget -= room + separator;
      truncatedFiles += 1;
    } else {
      skippedFiles += 1;
    }
  }
  return {
    context: head + parts.join(FILE_SEPARATOR),
    coverage: { analyzedFiles, skippedFiles, truncatedFiles },
  };
};
