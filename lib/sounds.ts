const BASE_PATH = process.env.NEXT_PUBLIC_BASE_PATH ?? "";

/**
 * `/sounds/*`（自然音・プログラムの曲・星座の曲、計 約300MB）の置き場所。
 *
 * Web 版は同じ origin（basePath 配下）。Android アプリは APK を小さく保つために
 * 音源を同梱せず、Web 版（GitHub Pages）から取る——scripts/build-android.mjs が
 * NEXT_PUBLIC_SOUNDS_BASE にその URL を焼き込む。GitHub Pages は
 * `Access-Control-Allow-Origin: *` を返すので、アプリの origin
 * （https://localhost）からの fetch＋decodeAudioData もそのまま通る。
 * 振る舞いはスマホのブラウザと同じ：初めて鳴らすときに通信が要り、繋がらなければ
 * 伴奏が無いだけでビートは合成どおり鳴る。
 */
export const SOUNDS_BASE = process.env.NEXT_PUBLIC_SOUNDS_BASE || BASE_PATH;

/** `soundUrl("zodiac/aries-b10.mp3")` → `<SOUNDS_BASE>/sounds/zodiac/aries-b10.mp3` */
export function soundUrl(relative: string): string {
  return `${SOUNDS_BASE}/sounds/${relative}`;
}
