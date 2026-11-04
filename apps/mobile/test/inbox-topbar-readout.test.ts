import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const inbox = readFileSync(join(__dirname, "..", "app", "(tabs)", "inbox.tsx"), "utf8");
const control = readFileSync(join(__dirname, "..", "src", "components", "CompactControl.tsx"), "utf8");

describe("Inbox readout in the top bar", () => {
  it("only rebuilds the readout when its narration text changes, so the focus effect does not loop", () => {
    expect(inbox).toContain('const narration=inboxNarration(items).join("\\n");');
    expect(inbox).toMatch(/useMemo\(\(\)=><ReadoutControls[^]*?,\[narration\]\)/);
  });

  it("uses the setter-only context, so setting the actions does not re-render the Inbox", () => {
    expect(inbox).toContain("useTopBarActionSetters()");
    expect(inbox).not.toMatch(/\buseTopBarActions\(\)/);
  });

  it("reports the on/off state of switch controls", () => {
    expect(control).toContain('accessibilityRole === "switch" || accessibilityRole === "checkbox" ? { disabled, checked: !!selected }');
  });
});
