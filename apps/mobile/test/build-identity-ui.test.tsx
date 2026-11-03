import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { URL } from "node:url";

const platform = vi.hoisted(() => ({ OS: "ios" }));
vi.mock("react-native", () => ({ Platform: platform }));
vi.mock("expo-application", () => ({ nativeApplicationVersion: "0.2.0", nativeBuildVersion: "25" }));
vi.mock("expo-constants", () => ({ default: { expoConfig: { extra: { buildCommit: "b".repeat(40) } } } }));
vi.mock("../src/components/SettingsRows", () => ({
  SettingsGroup: ({ title, children }: { title: string; children: React.ReactNode }) => <section aria-label={title}>{children}</section>,
  SettingsRow: ({ label, detail }: { label: string; detail: string }) => <p>{label}: {detail}</p>,
}));
import { BuildIdentity } from "../src/components/BuildIdentity";

describe("About MergeMate", () => {
  it.each(["ios", "android"])("renders %s binary version/build and embedded commit in Settings", os => {
    platform.OS = os;
    const html = renderToStaticMarkup(<BuildIdentity />);
    expect(html).toContain('aria-label="About MergeMate"');
    expect(html).toContain("Version: 0.2.0");
    expect(html).toContain("Build number: 25");
    expect(html).toContain(`Source commit: ${"b".repeat(40)}`);
    const settings = readFileSync(new URL("../app/(tabs)/settings.tsx", import.meta.url), "utf8");
    expect(settings).toContain("<BuildIdentity />");
  });
});
