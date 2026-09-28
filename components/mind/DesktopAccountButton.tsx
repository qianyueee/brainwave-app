"use client";

import { useEffect, useMemo, useState, useSyncExternalStore } from "react";
import { createPortal } from "react-dom";
import { CloudOff, ExternalLink, LogOut, RefreshCw, User, X } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { WEB_APP_URL } from "@/lib/desktop";
import { markOwner, pendingCount, sessionRev, needsUpload } from "@/lib/sync/cloud-mark";
import { kickCloudOutbox } from "@/lib/sync/outbox";
import { useAuthStore } from "@/store/useAuthStore";
import { useMindStore } from "@/store/useMindStore";
import { useBaselineStore } from "@/store/useBaselineStore";
import { useCloudSyncStore } from "@/store/useCloudSyncStore";
import { useT } from "@/lib/i18n";
import ConfirmDialog from "@/components/ConfirmDialog";

const subscribeNoop = () => () => {};

/**
 * デスクトップ測定アプリの右上：ログインとアカウントへの保存状況（/desktop 専用）。
 *
 * ログインしていれば、測った記録は自動でアカウントに保存される（MindRecorder の
 * autoSave・10秒チェック→ lib/sync/outbox.ts）。ここはその状況を一目で見せる
 * ボタンと、詳細・再送・Web版への案内・ログアウトのダイアログ。
 *
 * 「ログイン中」の判定は useCloudSyncStore.account（この端末が結びついている
 * アカウント）——オフラインで起動してトークンを更新できない間も、ログアウト
 * したわけではないので「接続待ち」と見せる。アカウント機能の無いビルド
 * （Supabase 未設定）では何も出さない。
 */
export default function DesktopAccountButton() {
  const t = useT();
  const user = useAuthStore((s) => s.user);
  const loading = useAuthStore((s) => s.loading);
  const openAuthModal = useAuthStore((s) => s.openAuthModal);
  const signOut = useAuthStore((s) => s.signOut);
  const account = useCloudSyncStore((s) => s.account);
  const phase = useCloudSyncStore((s) => s.phase);
  const lastError = useCloudSyncStore((s) => s.lastError);
  const sessions = useMindStore((s) => s.sessions);
  const checks = useBaselineStore((s) => s.checks);

  const [open, setOpen] = useState(false);
  const [confirmLogout, setConfirmLogout] = useState(false);
  const [logoutError, setLogoutError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  // persist 由来の account・記録を読むので mount 後に出す（hydration 対策）。
  const mounted = useSyncExternalStore(subscribeNoop, () => true, () => false);

  const uid = account?.id ?? null;
  const pending = useMemo(
    () => (uid ? pendingCount(sessions, checks, uid) : 0),
    [sessions, checks, uid]
  );
  // 別のアカウント宛てのまま残っている記録（共用 PC でログインし直した場合）。
  const othersPending = useMemo(() => {
    let n = 0;
    for (const s of sessions) {
      const o = markOwner(s.cloud);
      if (o && o !== uid && needsUpload(s.cloud, sessionRev(s), o)) n += 1;
    }
    for (const c of checks) {
      const o = markOwner(c.cloud);
      if (o && o !== uid && needsUpload(c.cloud, 0, o)) n += 1;
    }
    return n;
  }, [sessions, checks, uid]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  if (!supabase || !mounted) return null;

  if (!account) {
    // 起動直後のセッション確認中は出さない（結びついたアカウントがあれば下で
    // 「接続待ち」と出す——オフラインだと supabase-js はトークン更新を最大30秒
    // 再試行するので、その間ボタンごと消えると「ログインが外れた」ように見える）。
    if (loading) return null;
    return (
      <button
        onClick={() => openAuthModal("login")}
        className="flex items-center gap-2 h-12 px-4 rounded-2xl bg-navy text-text-secondary text-sm font-medium whitespace-nowrap neu-raised-sm neu-press active:scale-95"
      >
        <User size={18} strokeWidth={1.5} />
        {t("ログイン", "Log in")}
      </button>
    );
  }

  const offline = !user;
  // ボタンの点：緑＝全部保存済み／橙＝未保存あり・接続待ち／赤＝送信に失敗中。
  const dot =
    phase === "error" && pending > 0
      ? "bg-danger"
      : offline || pending > 0
        ? "bg-warning"
        : "bg-success";
  const shortStatus = offline
    ? t("接続待ち", "Waiting to connect")
    : pending > 0
      ? t(`未保存 ${pending}件`, `${pending} unsaved`)
      : t("保存済み", "Saved");

  const doLogout = async () => {
    setBusy(true);
    setLogoutError(null);
    const { error } = await signOut();
    setBusy(false);
    if (error) {
      setLogoutError(
        t(
          "ログアウトできませんでした。インターネットの接続を確認して、もう一度お試しください",
          "Couldn't log out. Please check your internet connection and try again."
        )
      );
      return;
    }
    setOpen(false);
  };

  return (
    <>
      <button
        onClick={() => {
          setLogoutError(null);
          setOpen(true);
        }}
        aria-label={t(`アカウント（${shortStatus}）`, `Account (${shortStatus})`)}
        className="flex items-center gap-2 h-12 pl-2 pr-4 rounded-2xl bg-navy text-text-secondary text-sm font-medium whitespace-nowrap neu-raised-sm neu-press active:scale-95"
      >
        <span className="relative w-8 h-8 rounded-full bg-primary/20 flex items-center justify-center text-primary text-sm font-bold">
          {account.email?.charAt(0).toUpperCase() ?? "U"}
          <span
            className={`absolute -right-0.5 -bottom-0.5 w-3 h-3 rounded-full border-2 border-navy ${dot}`}
          />
        </span>
        {shortStatus}
      </button>

      {/* ダイアログは body 直下へ出す：このボタンは PageHeader（backdrop-blur の
          sticky 帯）の中にあり、backdrop-filter は fixed の基準を帯に変えてしまう
          ——そのままだと画面ではなく帯に対して配置されて上が切れる。 */}
      {open && createPortal(
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60"
          onClick={() => setOpen(false)}
          role="button"
          aria-label={t("閉じる", "Close")}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-label={t("アカウント", "Account")}
            className="w-full max-w-[420px] mx-4 max-h-[85vh] overflow-y-auto bg-surface border border-surface-border rounded-3xl p-6 flex flex-col gap-4 neu-raised-lg"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-bold text-text-primary">{t("アカウント", "Account")}</h2>
              <button
                onClick={() => setOpen(false)}
                aria-label={t("閉じる", "Close")}
                className="w-12 h-12 rounded-xl bg-navy neu-raised-sm flex items-center justify-center text-text-secondary"
              >
                <X size={20} />
              </button>
            </div>

            <p className="text-base text-text-primary break-all">{account.email}</p>

            {/* 保存状況 */}
            <div className="bg-navy rounded-2xl p-4 flex flex-col gap-2 neu-inset">
              {offline ? (
                <p className="flex items-start gap-2 text-base text-warning">
                  <CloudOff size={20} className="shrink-0 mt-0.5" />
                  <span>
                    {t("インターネットに接続できていません。", "You're not connected to the internet. ")}
                    {pending > 0
                      ? t(
                          `未保存の記録（${pending}件）は、つながると自動で保存します`,
                          pending === 1
                            ? "Your unsaved record will be saved automatically once you're connected."
                            : `Your ${pending} unsaved records will be saved automatically once you're connected.`
                        )
                      : t(
                          "つながると、この後の記録も自動で保存します",
                          "Once you're connected, new records will also be saved automatically."
                        )}
                  </span>
                </p>
              ) : pending === 0 ? (
                <p className="text-base text-success">
                  {t("すべての記録をアカウントに保存しました", "All records are saved to your account")}
                </p>
              ) : phase === "error" ? (
                <>
                  <p className="text-base text-warning">
                    {t(
                      `まだ保存できていない記録が ${pending}件 あります。通信が戻ると自動で保存します`,
                      pending === 1
                        ? "1 record hasn't been saved yet. It will be saved automatically when the connection is back."
                        : `${pending} records haven't been saved yet. They'll be saved automatically when the connection is back.`
                    )}
                  </p>
                  {lastError && <p className="text-xs text-text-muted break-all">{lastError}</p>}
                  <button
                    onClick={() => kickCloudOutbox({ resetBackoff: true })}
                    className="flex items-center justify-center gap-2 min-h-12 rounded-2xl bg-surface text-primary text-base font-bold neu-raised-sm neu-press"
                  >
                    <RefreshCw size={18} />
                    {t("今すぐ保存する", "Save now")}
                  </button>
                </>
              ) : (
                <p className="text-base text-text-secondary">
                  {t(
                    `アカウントに保存しています…（残り ${pending}件）`,
                    `Saving to your account… (${pending} left)`
                  )}
                </p>
              )}
              {othersPending > 0 && (
                <p className="text-sm text-text-muted">
                  {t(
                    `別のアカウントで測った未保存の記録が ${othersPending}件 あります（そのアカウントでログインすると保存されます）`,
                    othersPending === 1
                      ? "1 unsaved record was measured under another account (it will be saved when you log in with that account)."
                      : `${othersPending} unsaved records were measured under another account (they'll be saved when you log in with that account).`
                  )}
                </p>
              )}
            </div>

            <div className="flex flex-col gap-2">
              <p className="text-base text-text-secondary">
                {t(
                  "保存した記録は、Web版の Sync Report・Sync History で見られます。",
                  "You can view saved records in Sync Report and Sync History in the web app."
                )}
              </p>
              {/* target=_blank は pywebview が既定のブラウザで開く。 */}
              <a
                href={`${WEB_APP_URL}history`}
                target="_blank"
                rel="noreferrer"
                className="flex items-center justify-center gap-2 min-h-12 rounded-2xl bg-primary text-on-primary text-base font-bold neu-raised-sm neu-press"
              >
                <ExternalLink size={18} />
                {t("Web版で記録を見る", "View records in the web app")}
              </a>
              <p className="text-sm text-text-muted">
                {t(
                  "測定者の名前を Web版と同じにすると、ヒストリーで同じ人の記録としてまとまります",
                  "If you use the same person name as in the web app, History will show their records together."
                )}
              </p>
            </div>

            {logoutError && (
              <p role="alert" className="text-sm text-danger bg-danger/10 rounded-2xl px-4 py-3">
                {logoutError}
              </p>
            )}
            <button
              onClick={() => (pending > 0 ? setConfirmLogout(true) : void doLogout())}
              disabled={busy}
              className="flex items-center justify-center gap-2 min-h-12 rounded-2xl bg-navy text-danger text-base font-medium neu-raised-sm neu-press disabled:opacity-60"
            >
              <LogOut size={18} strokeWidth={1.5} />
              {t("ログアウト", "Log out")}
            </button>
          </div>
        </div>,
        document.body
      )}

      {confirmLogout &&
        createPortal(
          <ConfirmDialog
            open
            title={t("ログアウトしますか？", "Log out?")}
            message={t(
              `まだアカウントに保存していない記録が ${pending}件 あります。消えはしません——このアカウントでもう一度ログインすると保存されます。`,
              pending === 1
                ? "1 record isn't saved to your account yet. It won't be lost — it will be saved when you log in to this account again."
                : `${pending} records aren't saved to your account yet. They won't be lost — they'll be saved when you log in to this account again.`
            )}
            confirmLabel={t("ログアウト", "Log out")}
            onConfirm={() => {
              setConfirmLogout(false);
              void doLogout();
            }}
            onClose={() => setConfirmLogout(false)}
          />,
          document.body
        )}
    </>
  );
}
