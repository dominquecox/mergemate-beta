import { describe, expect, it, vi } from "vitest";
import { readFileSync, mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { URL } from "node:url";
import { buildIdentityRows } from "../src/config/buildIdentity";
// Native-project parsing is exercised with fixtures, never a native build.
import { nativeBuildNumber, printReceipt } from "../scripts/build-receipt.mjs";
import { resolveBuildCommit } from "../app.config";

const commit = "a".repeat(40);
describe("installed build identity", () => {
  it.each(["ios", "android"])("shows %s binary values and full build commit", platform => {
    expect(buildIdentityRows({ platform, version: "0.2.0", build: "24", commit })).toEqual([
      { label: "Version", detail: "0.2.0" },
      { label: "Build number", detail: "24" },
      { label: "Source commit", detail: commit },
    ]);
  });
  it("never substitutes old configured build numbers for unknown native values", () => {
    expect(buildIdentityRows({ platform: "ios", version: null, build: null, commit: "bad" }).map(row => row.detail)).toEqual(["Unavailable", "Unavailable", "Unavailable"]);
    expect(buildIdentityRows({ platform: "web", version: null, build: null, commit })[1].detail).toBe("Not a native build");
  });
  it("embeds EAS archived source identity and rejects invalid metadata", () => {
    expect(resolveBuildCommit({ EAS_BUILD_GIT_COMMIT_HASH: commit })).toBe(commit);
    expect(() => resolveBuildCommit({ EAS_BUILD_GIT_COMMIT_HASH: "not-a-commit" })).toThrow();
  });
  it("uses remote atomic counters and increments both dev profiles on each invocation", () => {
    const config = JSON.parse(readFileSync(new URL("../eas.json", import.meta.url), "utf8"));
    expect(config.cli.appVersionSource).toBe("remote");
    for (const profile of ["ios-dev", "android-dev"]) expect(config.build[profile].autoIncrement).toBe(true);
  });
  it("prints generated native numbers for consecutive allocations, not app.json seeds", () => {
    const root = mkdtempSync(path.join(tmpdir(), "mm-build-"));
    const log = vi.spyOn(console, "log").mockImplementation(() => {});
    try {
      mkdirSync(path.join(root, "android/app"), { recursive: true });
      mkdirSync(path.join(root, "ios/MergeMate.xcodeproj"), { recursive: true });
      writeFileSync(path.join(root, "app.json"), JSON.stringify({ expo: { version: "0.2.0", ios: { buildNumber: "1" } } }));
      for (const number of [24, 25]) {
        writeFileSync(path.join(root, "android/app/build.gradle"), `versionCode ${number}`);
        writeFileSync(path.join(root, "ios/MergeMate.xcodeproj/project.pbxproj"), `CURRENT_PROJECT_VERSION = ${number};`);
        for (const platform of ["ios", "android"]) {
          expect(nativeBuildNumber(root, platform)).toBe(String(number));
          printReceipt(root, platform, { ...process.env, EAS_BUILD_GIT_COMMIT_HASH: commit });
          expect(log).toHaveBeenLastCalledWith(`MergeMate native receipt: platform=${platform} version=0.2.0 build=${number} commit=${commit}`);
        }
      }
      expect(() => nativeBuildNumber(root, "unknown")).toThrow();
    } finally { log.mockRestore(); rmSync(root, { recursive: true, force: true }); }
  });
});
