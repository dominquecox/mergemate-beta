import { StorageService } from "../storage";
import React, { createContext, useContext, useState, useEffect } from "react";
import { useColorScheme } from "react-native";
import { palette, spacing, typography, radius } from "../theme";
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
  const [themeMode, updateThemeMode] = useState<ThemeMode>("dark");

  useEffect(() => { void StorageService.getThemeMode().then(updateThemeMode); }, []);
  const setThemeMode = (mode:ThemeMode) => { updateThemeMode(mode); void StorageService.setThemeMode(mode); };
  const isDark = themeMode === "system" ? systemScheme === "dark" : themeMode === "dark";
  const colors = isDark ? palette.dark : palette.light;

  return (
    <ThemeContext.Provider
      value={{
        themeMode,
        isDark,
        colors,
        spacing,
        typography: typography,
        radius: radius,
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
