const BASE_PATH = process.env.NEXT_PUBLIC_BASE_PATH ?? "";

/**
 * `/sounds/*`（自然音 4 種など、計 約3MB）の置き場所。プログラムの曲は下の
 * MUSIC_BASE（別リポジトリ）にある。
 *
 * Web 版は同じ origin（basePath 配下）。Android アプリと Windows アプリは音源を
 * 同梱せず、Web 版（GitHub Pages）から取る——scripts/build-android.mjs・
 * build-desktop.mjs が NEXT_PUBLIC_SOUNDS_BASE にその URL を焼き込む。GitHub Pages は
 * `Access-Control-Allow-Origin: *` を返すので、アプリの origin
 * （https://localhost・http://127.0.0.1:17860）からの fetch＋decodeAudioData もそのまま通る。
 * 振る舞いはスマホのブラウザと同じ：初めて鳴らすときに通信が要り、繋がらなければ
 * 伴奏が無いだけでビートは合成どおり鳴る。
 */
export const SOUNDS_BASE = process.env.NEXT_PUBLIC_SOUNDS_BASE || BASE_PATH;

/** `soundUrl("rain.mp3")` → `<SOUNDS_BASE>/sounds/rain.mp3` */
export function soundUrl(relative: string): string {
  return `${SOUNDS_BASE}/sounds/${relative}`;
}

/**
 * プログラムの曲（星座 96・デフォルト 4・Target 42・Energy 13、計 約500MB）の置き場所＝
 * 別リポジトリ qianyueee/brainwave-sounds の GitHub Pages。このリポジトリの履歴と
 * Pages（公開サイト 1GB まで）を曲の重さから切り離すために分けた。
 *
 * 三端とも同じ URL から取る。Web 版とは origin が同じ（https://qianyueee.github.io）、
 * Android・Windows からは上と同じく ACAO:* で通る。ファイル名は納品時のまま
 * （日本語・空白・括弧入り）なので、パスは区切りごとに URL エンコードする。
 */
export const MUSIC_BASE = (
  process.env.NEXT_PUBLIC_MUSIC_BASE || "https://qianyueee.github.io/brainwave-sounds"
).replace(/\/+$/, "");

/** `musicUrl("Astroプログラム/魚座 (174Hz)_…_2Hz.mp3")` → `<MUSIC_BASE>/Astro%E3%83%97…` */
export function musicUrl(path: string): string {
  return `${MUSIC_BASE}/${path.split("/").map(encodeURIComponent).join("/")}`;
}
