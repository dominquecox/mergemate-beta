import { z } from "zod";

/** Browsers disallow dynamic code compilation under our CSP; schema validation still runs normally. */
export function configureBrowserValidation(isBrowser = "document" in globalThis): void {
  if (isBrowser) z.config({ jitless: true });
}

configureBrowserValidation();
