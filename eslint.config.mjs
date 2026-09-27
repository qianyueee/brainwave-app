import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Android アプリ（Capacitor）のコードは lib/native/ に閉じ込め、外からは
  // IS_ANDROID_APP の分岐の中で動的 import() する——そうしないと Web 版の画面も
  // Capacitor を読み込んでしまう（lib/platform.ts）。静的 import だけを禁じる
  // （型だけの import と import() は通す）。
  {
    files: ["**/*.{ts,tsx,mts}"],
    ignores: ["lib/native/**", "capacitor.config.ts"],
    rules: {
      "@typescript-eslint/no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              group: ["@capacitor/*"],
              allowTypeImports: true,
              message: "Capacitor は lib/native/ の中だけで使う（外からは IS_ANDROID_APP の中で import() する）",
            },
            {
              group: ["@/lib/native/*", "./native/*", "../native/*"],
              allowTypeImports: true,
              message: "lib/native/ は IS_ANDROID_APP の中で import() する（Web 版に Capacitor を読み込ませない）",
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
    // Vendored Claude Code skills (third-party scripts, not app code)
    ".claude/**",
    // Desktop app bundle — a copy of out/ that `pnpm build:desktop` drops into
    // bridge/web/ for PyInstaller to pick up (generated, minified, gitignored)
    "bridge/web/**",
    // Android app: the bundle `pnpm build:android` writes (and `cap sync`
    // copies into android/app/src/main/assets), plus the Gradle project
    "android-web/**",
    "android/**",
  ]),
]);

export default eslintConfig;
