import { describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { configureBrowserValidation } from "../src/browser-runtime";

describe("CSP-safe browser validation", () => {
  it("validates without dynamic Function compilation in browsers", () => {
    const before = z.config().jitless;
    configureBrowserValidation(true);
    const compile = vi.spyOn(globalThis, "Function").mockImplementation(() => { throw new Error("CSP blocks eval"); });
    try {
      const schema = z.object({ id: z.string(), count: z.number().int() });
      expect(schema.parse({ id: "fixture", count: 1 })).toEqual({ id: "fixture", count: 1 });
      expect(schema.safeParse({ id: "fixture", count: "bad" }).success).toBe(false);
      expect(compile).not.toHaveBeenCalled();
    } finally { compile.mockRestore(); z.config({ jitless: before }); }
  });
  it("does not change the non-browser runtime configuration", () => {
    const before = z.config().jitless;
    configureBrowserValidation(false);
    expect(z.config().jitless).toBe(before);
  });
});
