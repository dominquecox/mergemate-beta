import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";

/** Reads a source file and returns the style object of the element whose props contain `marker`. */
function styleNear(file: string, marker: string): string {
  const source = fs.readFileSync(path.resolve(__dirname, "..", file), "utf8");
  const at = source.indexOf(marker);
  expect(at, `${marker} not found in ${file}`).toBeGreaterThanOrEqual(0);
  const tagStart = source.lastIndexOf("<TouchableOpacity", at);
  const tagEnd = source.indexOf(">", source.indexOf("style={{", at));
  return source.slice(tagStart, tagEnd);
}

describe("tap targets on the PR workspace header", () => {
  it("Refresh keeps a 44px hit area", () => {
    const tag = styleNear("app/pr/[owner]/[repo]/[number].tsx", 'accessibilityLabel="Refresh workspace"');
    expect(tag).toMatch(/minHeight:\s*44/);
    expect(tag).toMatch(/minWidth:\s*44/);
  });

  it("the model telemetry chip keeps a 44px hit area in every size", () => {
    const tag = styleNear("src/components/MetaTelemetryModal.tsx", "accessibilityLabel={telemetryLabel(");
    expect(tag).toMatch(/minHeight:\s*44[,}]/);
    expect(tag).toMatch(/minWidth:\s*44[,}]/);
    expect(tag).not.toMatch(/min(Height|Width):\s*compact\s*\?/);
  });
});
