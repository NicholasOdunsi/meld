import js from "@eslint/js";
import globals from "globals";
import tseslint from "typescript-eslint";

// Covers only the files that live outside a workspace package: the Playwright
// suite, the SQL/convention/provider-adapter guards in scripts/, and the root
// tool configs.
// Flat config does not merge with nested configs, so apps/* and packages/*
// are ignored here and linted by their own eslint.config.mjs.
export default tseslint.config(
  {
    ignores: [
      "apps/**",
      "packages/**",
      "test-results/**",
      "playwright-report/**",
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    languageOptions: {
      globals: globals.node,
    },
  },
);
