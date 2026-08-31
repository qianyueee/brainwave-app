import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    // Vendored Claude Code skills (third-party scripts, not app code)
    ".claude/**",
    // Desktop app bundle — a copy of out/ that `pnpm build:desktop` drops into
    // bridge/web/ for PyInstaller to pick up (generated, minified, gitignored)
    "bridge/web/**",
  ]),
]);

export default eslintConfig;
