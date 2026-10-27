import { Platform, useWindowDimensions } from "react-native";
import { getLayoutMode, LayoutMode } from "./breakpoints";

/** Current layout mode. Native always reports "phone" so the iOS layout never changes. */
export function useLayout(): { mode: LayoutMode; width: number; height: number; isDesktop: boolean } {
  const { width, height } = useWindowDimensions();
  const mode: LayoutMode = Platform.OS === "web" ? getLayoutMode(width) : "phone";
  return { mode, width, height, isDesktop: mode === "desktop" };
}
