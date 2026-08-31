/**
 * デスクトップ測定アプリ（bridge/desktop_app.py）に同梱する静的ビルド。
 *
 * 通常の `pnpm build` と違うのは3点だけ:
 * - basePath を空にする（WebView2 は http://127.0.0.1:17860/ 直下から読む。
 *   /brainwave-app 前提の絶対パスはローカル配信で 404 になる）
 * - Supabase の env を渡さない（supabase クライアントが null になり、UI からの
 *   クラウド呼び出しがビルド時点で全て無効化される。クラウド送信は Python 側の
 *   クラウド同時配信だけが持つ）
 * - 出力を bridge/web/ へコピーする。public/sounds（約300MBの音楽素材）は
 *   測定ページでは使わないので除外——入れると exe がそのぶん膨らむ。
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
delete env.NEXT_PUBLIC_SUPABASE_URL;
delete env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

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
console.log("build-desktop: bridge/web を書き出しました");
