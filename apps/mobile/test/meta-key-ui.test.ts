import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { MockApiClient } from "../src/api/mock";
import { META_KEY_COPY } from "../src/config/metaKeyCopy";

const settings = fs.readFileSync(path.join(__dirname, "../app/(tabs)/settings.tsx"), "utf8");

describe("bring-your-own Meta key settings", () => {
  it("tells the user about the small verification call before they save", () => {
    expect(META_KEY_COPY.verifyNotice).toMatch(/one tiny test request/);
    expect(META_KEY_COPY.verifyNotice).toMatch(/never shown again/);
    expect(settings).toContain("META_KEY_COPY.verifyNotice");
    expect(settings).toContain("META_KEY_COPY.saveLabel");
  });

  it("clears the input after every submit and never reads the key back", () => {
    expect(settings).toMatch(/finally \{[^}]*setMetaKeyInput\(""\)/);
    expect(settings).toContain("secureTextEntry");
    expect(settings).not.toMatch(/StorageService[^\n]*[Mm]etaKey/);
  });

  it("keeps native status-only", () => {
    expect(settings).toContain("META_KEY_COPY.nativeNote");
  });

  it("fixture client reports status only after save and remove", async () => {
    const api = new MockApiClient();
    expect(await api.getMetaKeyStatus()).toEqual({ configured: false });
    await api.saveMetaKey("fixture-meta-key-not-real");
    const status = await api.getMetaKeyStatus();
    expect(status).toEqual({ configured: true });
    expect(JSON.stringify(status)).not.toContain("fixture-meta-key");
    await api.removeMetaKey();
    expect(await api.getMetaKeyStatus()).toEqual({ configured: false });
  });
});
