"use client";

import { useEffect, useRef } from "react";
import { usePathname } from "next/navigation";
import type { User } from "@supabase/supabase-js";
import { supabase } from "@/lib/supabase";
import { useAuthStore } from "@/store/useAuthStore";
import { useAdminStore } from "@/store/useAdminStore";
import { useSynthStore } from "@/store/useSynthStore";
import { useBrainProfileStore } from "@/store/useBrainProfileStore";
import { useCustomAudioStore } from "@/store/useCustomAudioStore";
import { useBaselineStore } from "@/store/useBaselineStore";
import { useCloudSyncStore } from "@/store/useCloudSyncStore";
import { useSyncTreeStore } from "@/store/useSyncTreeStore";
import { setActiveCloudUserId } from "@/lib/sync/per-user-storage";
import { runFirstLoginMigration } from "@/lib/sync/migrate";
import { ensureCloudOutbox, releaseCloudOutbox } from "@/lib/sync/outbox";
import { refreshAccountViews } from "@/lib/sync/account-views";
import { startSyncTreeRuntime } from "@/lib/sync/tree-runtime";
import { isDesktopRoute } from "@/lib/desktop";
import AuthModal from "@/components/AuthModal";

async function hydrateForUser(user: User) {
  setActiveCloudUserId(user.id);
  // Sync Tree はアカウントにだけある。読み込みは失敗しても reject しないが、
  // 下の Promise.all には入れない——木の都合で初回ログインの移行を待たせない。
  void useSyncTreeStore.getState().loadForUser(user.id);
  await Promise.all([
    useSynthStore.getState().loadFromCloud(user.id),
    useBrainProfileStore.getState().loadFromCloud(user.id),
    useCustomAudioStore.getState().loadFromCloud(user.id),
    useBaselineStore.getState().loadCloudChecks(user.id),
  ]);
  await runFirstLoginMigration(user);
}

function clearAllForLogout() {
  useSynthStore.getState().clearForLogout();
  useBrainProfileStore.getState().clearForLogout();
  useCustomAudioStore.getState().clearForLogout();
  useBaselineStore.getState().clearCloudChecks();
  useSyncTreeStore.getState().clear();
  setActiveCloudUserId(null);
}

/** この端末が結びついているアカウントを覚える（記録の宛先に使う。useCloudSyncStore）。 */
function rememberAccount(user: User) {
  useCloudSyncStore.getState().setAccount({ id: user.id, email: user.email ?? null });
}

export default function AuthProvider({ children }: { children: React.ReactNode }) {
  const setUser = useAuthStore((s) => s.setUser);
  const setLoading = useAuthStore((s) => s.setLoading);
  const loadRole = useAdminStore((s) => s.loadRole);
  const clearRole = useAdminStore((s) => s.clearRole);

  // デスクトップ測定アプリ（/desktop）はログインして記録を送るだけの画面で、
  // 合成器・カスタム音源・脳特性の一覧・管理者権限は使わない。読み込むと
  // トークン更新のたびに全件を読み直すうえ、メモの同期（note-sync）が二重に
  // 書くので、ここではユーザーの追跡だけにする。アプリはこの画面から動かない
  // ので、判定は ref で持てば足りる（購読を張り直さない）。
  const desktop = isDesktopRoute(usePathname());
  const desktopRef = useRef(desktop);
  useEffect(() => {
    desktopRef.current = desktop;
  }, [desktop]);

  useEffect(() => {
    if (!supabase) {
      setLoading(false);
      return;
    }

    const onSession = (user: User | null) => {
      setUser(user);
      if (!user) return;
      rememberAccount(user);
      if (desktopRef.current) return;
      loadRole(user.id);
      hydrateForUser(user).catch((err) => console.error("[auth] hydrate failed:", err));
    };

    // Check existing session. Offline with an expired token, supabase-js retries
    // the refresh for up to ~30s and can even reject (its session lock taken over
    // by another call) — loading must still end, or the UI waits forever.
    supabase.auth
      .getSession()
      .then(({ data: { session } }) => onSession(session?.user ?? null))
      .catch((err) => console.error("[auth] getSession failed:", err))
      .finally(() => setLoading(false));

    // Listen for auth state changes (login, logout, token refresh, OAuth redirect)
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event, session) => {
      if (session?.user) {
        onSession(session.user);
        return;
      }
      setUser(null);
      // 結びつきを外すのは本当のログアウト（トークン失効を含む）だけ。オフライン
      // 起動でトークンを更新できない間もセッション無しで届くが、それは違う。
      if (event === "SIGNED_OUT") useCloudSyncStore.getState().setAccount(null);
      if (desktopRef.current) return;
      clearRole();
      clearAllForLogout();
    });

    return () => {
      subscription.unsubscribe();
    };
  }, [setUser, setLoading, loadRole, clearRole]);

  // 端末に残した記録をアカウントへ送る係（Web・デスクトップ共通）。
  useEffect(() => {
    ensureCloudOutbox();
    return () => releaseCloudOutbox();
  }, []);

  // Sync Tree：リスニングの積算と、送れていない出来事の送り直し。デスクトップ
  // 測定アプリには木も再生も無い（そもそも木を読み込まない）。
  useEffect(() => {
    if (desktop) return;
    return startSyncTreeRuntime();
  }, [desktop]);

  // タブに戻ったら記録を読み直す：デスクトップ測定アプリで測ってからブラウザに
  // 切り替えると、そのまま新しい記録が見える。
  useEffect(() => {
    if (desktop) return;
    const onVisible = () => {
      if (document.visibilityState === "visible") refreshAccountViews();
    };
    window.addEventListener("focus", onVisible);
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      window.removeEventListener("focus", onVisible);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [desktop]);

  return (
    <>
      {children}
      <AuthModal />
    </>
  );
}
