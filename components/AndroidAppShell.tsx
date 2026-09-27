"use client";

import { useEffect } from "react";
import { IS_ANDROID_APP } from "@/lib/platform";

/**
 * Android アプリ（Capacitor）でだけ動く常駐処理の入口。何も描かない。
 * Web 版では IS_ANDROID_APP が false に畳まれ、中身ごと消える（lib/native/ も
 * 読み込まれない）。処理本体は lib/native/android-shell.ts。
 */
export default function AndroidAppShell() {
  useEffect(() => {
    if (!IS_ANDROID_APP) return;
    let disposed = false;
    let cleanup: (() => void) | null = null;
    void import("@/lib/native/android-shell")
      .then(({ installAndroidShell }) => installAndroidShell())
      .then((dispose) => {
        if (disposed) dispose();
        else cleanup = dispose;
      });
    return () => {
      disposed = true;
      cleanup?.();
    };
  }, []);

  return null;
}
