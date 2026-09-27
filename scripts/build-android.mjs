/**
 * Android アプリ（Capacitor、capacitor.config.ts）に同梱する静的ビルド。
 *
 * 骨格は build-desktop.mjs と同じで、違いは次のとおり:
 * - NEXT_PUBLIC_APP_PLATFORM=android を焼き込む（lib/platform.ts の
 *   IS_ANDROID_APP。ビルド時の定数なので静的 HTML も Android 版で描かれる）
 * - NEXT_PUBLIC_SOUNDS_BASE に Web 版（GitHub Pages）の URL を焼き込む。
 *   public/sounds（約300MB）は APK に入れず、スマホのブラウザと同じく Web 版
 *   から取る（lib/sounds.ts）。
 * - 出力は android-web/（capacitor.config.ts の webDir）。最後に
 *   `cap sync android` で android/app/src/main/assets/public へ写す
 *   （`--no-sync` で省略）。
 *
 * Supabase の env は Web 版と同じものを焼き込む（ログイン・アカウント同期）。
 * CI で無ければ失敗させる——ログインできない APK を気付かずに配らないため。
 */
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const outDir = path.join(root, "out");
const webDir = path.join(root, "android-web");
const noSync = process.argv.includes("--no-sync");

const webAppUrl = process.env.NEXT_PUBLIC_WEB_APP_URL || "https://qianyueee.github.io/brainwave-app/";
const soundsBase = (process.env.NEXT_PUBLIC_SOUNDS_BASE || webAppUrl).replace(/\/+$/, "");

const env = {
  ...process.env,
  NEXT_PUBLIC_BASE_PATH: "",
  NEXT_PUBLIC_APP_PLATFORM: "android",
  NEXT_PUBLIC_SOUNDS_BASE: soundsBase,
};

const fail = (msg) => {
  console.error(`build-android: ${msg}`);
  process.exit(1);
};

// .env.local 等は next build 自身が読むので、ここで見えるのはシェル／CI の env だけ。
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
if (!supabaseUrl || !process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY) {
  if (process.env.CI) {
    fail(
      "NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY がありません" +
        "（リポジトリ変数を build-android.yml に渡してください）。ログインできない APK になるため中止します"
    );
  }
  console.warn(
    "build-android: Supabase の env がシェルにありません——.env.local も無ければ、ログイン・同期の無いビルドになります"
  );
}

const run = (cmd, args) => {
  const res = spawnSync(cmd, args, {
    cwd: root,
    env,
    stdio: "inherit",
    shell: process.platform === "win32",
  });
  if (res.status !== 0) process.exit(res.status ?? 1);
};

run("pnpm", ["exec", "next", "build"]);

fs.rmSync(webDir, { recursive: true, force: true });
fs.cpSync(outDir, webDir, {
  recursive: true,
  filter: (src) => {
    const rel = path.relative(outDir, src);
    return !(rel === "sounds" || rel.startsWith(`sounds${path.sep}`));
  },
});

const walk = (dir, pick) => {
  const found = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, entry.name);
    if (entry.isDirectory()) found.push(...walk(p, pick));
    else if (pick(p)) found.push(p);
  }
  return found;
};

if (!fs.existsSync(path.join(webDir, "index.html"))) fail("android-web/index.html がありません");
// 端末内の静的サーバはページを `<route>.html` で探す（android/ の
// ExportRouteWebViewClient）。trailingSlash を変えて brain/index.html 形式に
// なったら、その対応も一緒に直すこと。
if (!fs.existsSync(path.join(webDir, "brain.html"))) fail("android-web/brain.html がありません（書き出しの形が変わった？）");
if (fs.existsSync(path.join(webDir, "sounds"))) fail("android-web/sounds が残っています（APK が 300MB 膨らむ）");

// basePath の残留は HTML だけを見る——JS には Web 版の URL（lib/desktop.ts の
// WEB_APP_URL と、上の NEXT_PUBLIC_SOUNDS_BASE）が正当に入っている。HTML でも
// 「https://qianyueee.github.io/brainwave-app/」への外部リンクは正当なので、
// 自分の origin の絶対パスとしての /brainwave-app/ だけを咎める。
const basePathResidue = /(?<!github\.io)\/brainwave-app\//;
const htmlFiles = walk(webDir, (p) => p.endsWith(".html"));
const leaked = htmlFiles.filter((p) => basePathResidue.test(fs.readFileSync(p, "utf8")));
if (leaked.length > 0) {
  fail(`/brainwave-app 前提のパスが焼き込まれています（NEXT_PUBLIC_BASE_PATH が効いていない）: ${leaked.map((p) => path.relative(webDir, p)).join(", ")}`);
}

const jsFiles = walk(path.join(webDir, "_next", "static"), (p) => p.endsWith(".js"));
const bundleHas = (needle) => jsFiles.some((p) => fs.readFileSync(p, "utf8").includes(needle));

// IS_ANDROID_APP が効いたか：app/layout.tsx は Android ビルドのときだけ
// <html data-app-platform="android"> を付ける。
const indexHtml = fs.readFileSync(path.join(webDir, "index.html"), "utf8");
if (!indexHtml.includes('data-app-platform="android"')) {
  fail("index.html が Android 版で描かれていません（NEXT_PUBLIC_APP_PLATFORM が効いていない）");
}
// 音源の取り先が Web 版になっているか（lib/sounds.ts の SOUNDS_BASE）。
if (!bundleHas(`${soundsBase}/sounds/`) && !bundleHas(`"${soundsBase}"`)) {
  fail(`音源の URL（${soundsBase}）がバンドルにありません`);
}
// env を渡したのに URL がバンドルに入っていない＝ログインできない APK。
if (supabaseUrl && !bundleHas(supabaseUrl)) fail("Supabase の URL がバンドルに見つかりません（ログインできないビルド）");

console.log(`build-android: android-web を書き出しました（HTML ${htmlFiles.length} 件、音源は ${soundsBase} から）`);

if (noSync) process.exit(0);
if (!fs.existsSync(path.join(root, "android"))) {
  console.warn("build-android: android/ がありません。初回は `pnpm exec cap add android` を実行してください");
  process.exit(0);
}
run("pnpm", ["exec", "cap", "sync", "android"]);
