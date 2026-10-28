import { nativeLinkPath } from "../src/navigation/links";

export function redirectSystemPath({ path }: { path: string; initial: boolean }): string {
  return nativeLinkPath(path);
}
