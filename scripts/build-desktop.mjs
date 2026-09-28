/**
 * Windows アプリ（bridge/desktop_app.py、NeuroSync.exe）に同梱する静的ビルド。
 *
 * 通常の `pnpm build` と違うのは次のとおり（build-android.mjs と同じ骨格）:
 * - basePath を空にする（WebView2 は http://127.0.0.1:17860/ 直下から読む。
 *   /brainwave-app 前提の絶対パスはローカル配信で 404 になる）
 * - NEXT_PUBLIC_APP_PLATFORM=desktop を焼き込む（lib/platform.ts の IS_DESKTOP_APP。
 *   Sync Brain の出どころ・Google ログイン・ローカル WS の常駐が Windows 用になる。
 *   ビルド時の定数なので静的 HTML も Windows 版で描かれる）
 * - NEXT_PUBLIC_SOUNDS_BASE に Web 版（GitHub Pages）の URL を焼き込む。public/sounds
 *   （約300MB）は exe に入れず、Web 版から取る（lib/sounds.ts）
 * - 出力を bridge/web/ へコピーする（sounds/ を除く）
 *
 * Supabase の env（NEXT_PUBLIC_SUPABASE_URL / ANON_KEY）は Web 版と同じものを
 * そのまま焼き込む：ログインと、記録のアカウント同期がこれを使う。無くてもビルドは
 * できるが、その exe はログイン無しの完全ローカル版になる——CI（env CI が立っている）
 * では気付かずに配ってしまわないよう失敗させる。
 *
 * env プレフィックスではなく Node スクリプトなのは、Windows の CI ランナーでも
 * 同じ1コマンドで動かすため。
 */
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const outDir = path.join(root, "out");
const webDir = path.join(root, "bridge", "web");

const webAppUrl = process.env.NEXT_PUBLIC_WEB_APP_URL || "https://qianyueee.github.io/brainwave-app/";
const soundsBase = (process.env.NEXT_PUBLIC_SOUNDS_BASE || webAppUrl).replace(/\/+$/, "");

const env = {
  ...process.env,
  NEXT_PUBLIC_BASE_PATH: "",
  NEXT_PUBLIC_APP_PLATFORM: "desktop",
  NEXT_PUBLIC_SOUNDS_BASE: soundsBase,
};

const fail = (msg) => {
  console.error(`build-desktop: ${msg}`);
  process.exit(1);
};

// .env.local 等は next build 自身が読むので、ここで見えるのはシェル／CI の env だけ。
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
if (!supabaseUrl || !process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY) {
  if (process.env.CI) {
    fail(
      "NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY がありません" +
        "（リポジトリ変数を build-desktop.yml に渡してください）。ログインできない exe になるため中止します"
    );
  }
  console.warn(
    "build-desktop: Supabase の env がシェルにありません——.env.local も無ければ、ログイン・同期の無いビルドになります"
  );
}

const res = spawnSync("pnpm", ["exec", "next", "build"], {
  cwd: root,
  env,
  stdio: "inherit",
  shell: process.platform === "win32",
});
if (res.status !== 0) process.exit(res.status ?? 1);

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

if (!fs.existsSync(path.join(webDir, "index.html"))) fail("bridge/web/index.html がありません");
// static_server は拡張子の無いパスを `<route>.html` で探す。trailingSlash を変えて
// brain/index.html 形式になったら、その対応も一緒に直すこと。
if (!fs.existsSync(path.join(webDir, "brain.html"))) fail("bridge/web/brain.html がありません（書き出しの形が変わった？）");
if (fs.existsSync(path.join(webDir, "sounds"))) fail("bridge/web/sounds が残っています（exe が 300MB 膨らむ）");

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

// IS_DESKTOP_APP が効いたか：app/layout.tsx は Windows ビルドのときだけ
// <html data-app-platform="desktop"> を付ける。
const indexHtml = fs.readFileSync(path.join(webDir, "index.html"), "utf8");
if (!indexHtml.includes('data-app-platform="desktop"')) {
  fail("index.html が Windows 版で描かれていません（NEXT_PUBLIC_APP_PLATFORM が効いていない）");
}
// 音源の取り先が Web 版になっているか（lib/sounds.ts の SOUNDS_BASE）。
if (!bundleHas(`${soundsBase}/sounds/`) && !bundleHas(`"${soundsBase}"`)) {
  fail(`音源の URL（${soundsBase}）がバンドルにありません`);
}
// env を渡したのに URL がバンドルに入っていない＝ログインできない exe。
if (supabaseUrl && !bundleHas(supabaseUrl)) fail("Supabase の URL がバンドルに見つかりません（ログインできないビルド）");

console.log(`build-desktop: bridge/web を書き出しました（HTML ${htmlFiles.length} 件、音源は ${soundsBase} から）`);
