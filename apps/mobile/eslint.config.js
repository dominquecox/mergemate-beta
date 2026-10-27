import js from "@eslint/js";
import tsPlugin from "typescript-eslint";

export default [
  {
    ignores: [
      "dist/**",
      "node_modules/**",
      "coverage/**",
      ".expo/**",
      "web-build/**",
      "babel.config.js",
      "metro.config.js",
      "metro.config.cjs",
    ],
  },
  js.configs.recommended,
  ...tsPlugin.configs.recommended,
  {
    rules: {
      "@typescript-eslint/no-explicit-any": "off",
      "@typescript-eslint/no-unused-vars": "off",
      "@typescript-eslint/no-require-imports": "off",
      "prefer-const": "warn",
      "no-undef": "off",
    },
  },
];
