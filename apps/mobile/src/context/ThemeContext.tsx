import React, { createContext, useContext, useState } from "react";
import { Platform, useColorScheme } from "react-native";
import { palette, spacing, typography, radius } from "../theme";
import { webPalette, webTypography, webRadius } from "../theme/web";
import { ThemeMode } from "../types";

interface ThemeContextType {
  themeMode: ThemeMode;
  isDark: boolean;
  colors: typeof palette.dark;
  spacing: typeof spacing;
  typography: typeof typography;
  radius: typeof radius;
  setThemeMode: (mode: ThemeMode) => void;
}

const ThemeContext = createContext<ThemeContextType | null>(null);

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const systemScheme = useColorScheme();
  const [themeMode, setThemeMode] = useState<ThemeMode>("dark");

  const isDark = themeMode === "system" ? systemScheme === "dark" : themeMode === "dark";
  const currentPalette = Platform.OS === "web" ? webPalette : palette;
  const colors = isDark ? currentPalette.dark : currentPalette.light;

  return (
    <ThemeContext.Provider
      value={{
        themeMode,
        isDark,
        colors,
        spacing,
        typography: Platform.OS === "web" ? webTypography : typography,
        radius: Platform.OS === "web" ? webRadius : radius,
        setThemeMode,
      }}
    >
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  const context = useContext(ThemeContext);
  if (!context) {
    throw new Error("useTheme must be used within a ThemeProvider");
  }
  return context;
}
