"use client";

import { useEffect } from "react";
import { useLocale } from "@/lib/i18n";

/**
 * `<html lang>` と文書タイトルを表示言語に合わせる。静的書き出しの HTML は
 * 日本語（lang="ja"）で焼かれているので、英語を選んだ端末ではここで直す
 * ——読み上げが英文を日本語の読みで読まないように。
 */
export default function LocaleSync() {
  const locale = useLocale();
  useEffect(() => {
    document.documentElement.lang = locale;
    document.title = locale === "en" ? "NeuroSync" : "NeuroSync（ニューロシンク）";
  }, [locale]);
  return null;
}
