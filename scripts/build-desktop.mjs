/**
 * デスクトップ測定アプリ（bridge/desktop_app.py）に同梱する静的ビルド。
 *
 * 通常の `pnpm build` と違うのは2点だけ:
 * - basePath を空にする（WebView2 は http://127.0.0.1:17860/ 直下から読む。
 *   /brainwave-app 前提の絶対パスはローカル配信で 404 になる）
 * - 出力を bridge/web/ へコピーする。public/sounds（約300MBの音楽素材）は
 *   測定ページでは使わないので除外——入れると exe がそのぶん膨らむ。
 *
 * Supabase の env（NEXT_PUBLIC_SUPABASE_URL / ANON_KEY）は Web 版と同じものを
 * そのまま焼き込む：アプリ右上のログインと、測定・10秒チェックのアカウントへの
 * 自動保存（lib/sync/outbox.ts）がこれを使う。無くてもビルドはできるが、その
 * exe はログイン無しの完全ローカル版になる——CI（env CI が立っている）では
 * 気付かずに配ってしまわないよう失敗させる。
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

const env = { ...process.env, NEXT_PUBLIC_BASE_PATH: "" };

// .env.local 等は next build 自身が読むので、ここで見えるのはシェル／CI の env だけ。
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
if (!supabaseUrl || !process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY) {
  if (process.env.CI) {
    console.error(
      "build-desktop: NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY がありません" +
        "（リポジトリ変数を build-desktop.yml に渡してください）。ログインできない exe になるため中止します"
    );
    process.exit(1);
  }
  console.warn(
    "build-desktop: Supabase の env がシェルにありません——.env.local も無ければ、ログイン・自動保存の無いビルドになります"
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

const desktopHtml = path.join(webDir, "desktop.html");
if (!fs.existsSync(desktopHtml)) {
  console.error("build-desktop: bridge/web/desktop.html がありません（/desktop ルートがビルドされていない）");
  process.exit(1);
}
if (fs.readFileSync(desktopHtml, "utf8").includes("/brainwave-app")) {
  console.error("build-desktop: desktop.html に /brainwave-app が焼き込まれています（NEXT_PUBLIC_BASE_PATH が効いていない）");
  process.exit(1);
}

// env を渡したのに URL がバンドルに入っていない＝ログインできない exe。
if (supabaseUrl) {
  const chunks = path.join(webDir, "_next", "static");
  const baked = (function walk(dir) {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const p = path.join(dir, entry.name);
      if (entry.isDirectory() ? walk(p) : p.endsWith(".js") && fs.readFileSync(p, "utf8").includes(supabaseUrl)) {
        return true;
      }
    }
    return false;
  })(chunks);
  if (!baked) {
    console.error("build-desktop: Supabase の URL がバンドルに見つかりません（ログインできないビルド）");
    process.exit(1);
  }
}
console.log("build-desktop: bridge/web を書き出しました");
