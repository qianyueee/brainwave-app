"use client";

import { Globe, Languages } from "lucide-react";
import { setLocale, useLocale, type Locale } from "@/lib/i18n";

/**
 * 表示言語の切り替え。見出しは言語に関係なく「表示言語 / Language」の両方を
 * 出す——いまの言語が読めない人でも、ここだと分かるように。選択肢も
 * それぞれの言語で書く（「English」は英語で、「日本語」は日本語で）。
 */
const OPTIONS: readonly { value: Locale; label: string }[] = [
  { value: "ja", label: "日本語" },
  { value: "en", label: "English" },
];

/** 設定のアカウント欄に置く、2択の切り替え。 */
export default function LanguageSwitch() {
  const locale = useLocale();
  return (
    <div className="flex flex-col gap-2">
      <p id="language-switch-label" className="flex items-center gap-2 text-sm text-text-secondary">
        <Languages size={18} strokeWidth={1.5} className="shrink-0 text-primary" aria-hidden="true" />
        表示言語 / Language
      </p>
      <div
        role="group"
        aria-labelledby="language-switch-label"
        className="grid grid-cols-2 gap-1 rounded-2xl bg-navy neu-inset p-1"
      >
        {OPTIONS.map((o) => {
          const active = o.value === locale;
          return (
            <button
              key={o.value}
              type="button"
              lang={o.value}
              aria-pressed={active}
              onClick={() => setLocale(o.value)}
              className={`min-h-12 rounded-xl text-base font-bold transition-colors ${
                active ? "bg-primary text-on-primary neu-raised-sm" : "text-text-secondary"
              }`}
            >
              {o.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}

/**
 * 見出しの帯に置く小さな切り替え（デスクトップ測定アプリの /desktop 用：
 * 設定画面が無く、未ログインだとアカウントのメニューも出ないので）。
 * 押すともう一方の言語になる——ボタンには切り替え先の言語名を書く。
 */
export function LanguageToggleButton() {
  const locale = useLocale();
  const next: Locale = locale === "en" ? "ja" : "en";
  const label = next === "en" ? "English" : "日本語";
  return (
    <button
      type="button"
      lang={next}
      onClick={() => setLocale(next)}
      aria-label={next === "en" ? "Switch to English / 英語に切り替える" : "日本語に切り替える / Switch to Japanese"}
      className="flex items-center gap-1.5 h-12 px-3 rounded-2xl bg-navy text-text-secondary text-sm font-medium whitespace-nowrap neu-raised-sm neu-press active:scale-95"
    >
      <Globe size={18} strokeWidth={1.5} aria-hidden="true" />
      {label}
    </button>
  );
}
