import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  {
    files: ["**/*.{ts,tsx,mts}"],
    rules: {
      // One `../` reaches a sibling directory and stays readable. Two or
      // more means the file no longer tells you where the import comes
      // from, and the same target ends up written both ways -- this repo
      // had `@/lib/supabase/server` and `../../lib/application-origin` on
      // adjacent lines. The typescript-eslint variant is used so that
      // `import type` is covered too; the base rule ignores it.
      "no-restricted-imports": "off",
      "@typescript-eslint/no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              group: ["../../*", "../../**"],
              message:
                "Use the @/ alias instead of reaching up two or more directories.",
            },
          ],
        },
      ],
    },
  },
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    // The Playwright build cache. Gitignored and generated, but not covered by
    // the default ".next/**" ignore, so eslint would otherwise lint roughly a
    // thousand machine-written files and bury every real finding.
    ".next-e2e/**",
  ]),
]);

export default eslintConfig;
