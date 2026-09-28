import { useMemo } from "react";
import { create } from "zustand";

/**
 * 表示言語（日本語／英語）。既定は日本語で、設定の「アカウント」から切り替える。
 *
 * 文言はキーで引く辞書ではなく、**日本語と英語を書いた場所に並べて持つ**：
 *
 *   const t = useT();
 *   <p>{t("水やり", "Watering")}</p>
 *   <p>{t(`「${name}」に育ちました`, `Grew into “${nameEn}”`)}</p>
 *
 * 画面の日本語は設計の説明（コメント）と一緒に読まれてきた一次資料なので、
 * 別ファイルの辞書へ抜き出すと「なぜこの言い回しか」から切り離される。隣に
 * 英語を足すだけなら、どの文言にも両方が揃っているかを差分で確かめられる。
 * モジュールの定数に持つ文言は `{ ja, en }`（LocalizedText）で書き、描画時に
 * `t(text)` で選ぶ。
 *
 * 言語は**端末ごと**に localStorage へ保存する（未ログインでも切り替えられる
 * ——日本語が読めない人が、ログインより先に言語を変えられる必要がある）。
 *
 * **描画中は必ずフック（useLocale / useT）で読む**。静的書き出しの HTML は
 * 日本語で焼かれているので、hydration の間は日本語を描き、直後に保存済みの
 * 言語で描き直す——zustand v5 の useStore はサーバースナップショットに
 * ストアの初期状態（日本語）を使うので、食い違いのエラーにはならない。
 * getLocale() を描画中に呼ぶと、hydration の最初の描画から英語になって
 * 食い違う。getLocale() はイベント処理・effect・React の外でだけ使う。
 */

export type Locale = "ja" | "en";

export const DEFAULT_LOCALE: Locale = "ja";

/** 両方の言語の文言。モジュールの定数（ナビの見出しなど）はこの形で持つ。 */
export interface LocalizedText {
  ja: string;
  en: string;
}

/** `t("日本語", "English")` と `t({ ja, en })` のどちらでも呼べる。 */
export interface TFunction {
  (ja: string, en: string): string;
  (text: LocalizedText): string;
}

const STORAGE_KEY = "app-locale";

function isLocale(v: unknown): v is Locale {
  return v === "ja" || v === "en";
}

function readStoredLocale(): Locale | null {
  try {
    const v = localStorage.getItem(STORAGE_KEY);
    return isLocale(v) ? v : null;
  } catch {
    return null;
  }
}

const useLocaleStore = create<{ locale: Locale }>()(() => ({ locale: DEFAULT_LOCALE }));

if (typeof window !== "undefined") {
  // 保存済みの言語はモジュールを読んだ時点で採る。初期状態（日本語）は
  // 書き換えないので、hydration の描画は日本語のまま（上の説明）。
  const stored = readStoredLocale();
  if (stored) useLocaleStore.setState({ locale: stored });
  // 別のタブで切り替えたら、このタブも追従する。
  window.addEventListener("storage", (e) => {
    if (e.key !== STORAGE_KEY) return;
    useLocaleStore.setState({ locale: readStoredLocale() ?? DEFAULT_LOCALE });
  });
}

export function pick(text: LocalizedText, locale: Locale): string {
  return locale === "en" ? text.en : text.ja;
}

/** React の外でも使える訳し分け。フックの中では useT() を使う。 */
export function translator(locale: Locale): TFunction {
  return ((a: string | LocalizedText, b?: string) =>
    typeof a === "string" ? (locale === "en" ? (b ?? a) : a) : pick(a, locale)) as TFunction;
}

/** いまの表示言語（描画中に読む）。 */
export function useLocale(): Locale {
  return useLocaleStore((s) => s.locale);
}

/** 描画中の訳し分け。 */
export function useT(): TFunction {
  const locale = useLocale();
  return useMemo(() => translator(locale), [locale]);
}

/** いまの表示言語（イベント処理・effect・React の外で読む。描画中は useLocale）。 */
export function getLocale(): Locale {
  return useLocaleStore.getState().locale;
}

export function setLocale(locale: Locale): void {
  try {
    localStorage.setItem(STORAGE_KEY, locale);
  } catch {
    // 保存できない（プライベートモード等）ときも、このページのあいだは切り替わる
  }
  useLocaleStore.setState({ locale });
}

/** Intl（toLocaleDateString など）に渡す言語タグ。 */
export function intlLocale(locale: Locale): "ja-JP" | "en-US" {
  return locale === "en" ? "en-US" : "ja-JP";
}
