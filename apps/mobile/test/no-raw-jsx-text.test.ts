import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

// Native React Native throws "Text strings must be rendered within a <Text> component" for a bare string in a View,
// including whitespace that shares a line with a fragment opener (`<>   {expr}`). react-native-web ignores it, so
// the exported-browser fixtures cannot catch it.
const files = (dir: string): string[] =>
  readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return name === "node_modules" ? [] : files(path);
    return path.endsWith(".tsx") ? [path] : [];
  });

describe("native-safe JSX", () => {
  it("has no same-line whitespace between a fragment opener and an expression", () => {
    const offenders = [...files("app"), ...files("src")].filter((file) => /<>[ \t]+\{/.test(readFileSync(file, "utf8")));
    expect(offenders).toEqual([]);
  });
});
