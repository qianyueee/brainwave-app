"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { useAuthStore } from "@/store/useAuthStore";
import { useDesktopBridgeStore } from "@/store/useDesktopBridgeStore";
import { useDesktopLoginStore } from "@/store/useDesktopLoginStore";
import { supabase } from "@/lib/supabase";
import { isDesktopRoute } from "@/lib/desktop";
import { useT } from "@/lib/i18n";
import { IS_ANDROID_APP, IS_DESKTOP_APP } from "@/lib/platform";
import {
  beginDesktopGoogleLogin,
  cancelDesktopGoogleLogin,
  expireDesktopGoogleLogin,
  prepareDesktopGoogleLogin,
  DESKTOP_LOGIN_TTL_MS,
  type PreparedGoogleLogin,
} from "@/lib/mind/desktop-google-auth";
import { X, Eye, EyeOff, LoaderCircle } from "lucide-react";

export default function AuthModal() {
  const t = useT();
  const open = useAuthStore((s) => s.authModalOpen);
  const view = useAuthStore((s) => s.authModalView);
  const setView = useAuthStore((s) => s.setAuthModalView);
  const closeAuthModal = useAuthStore((s) => s.closeAuthModal);
  const user = useAuthStore((s) => s.user);

  // Windows アプリ・旧いデスクトップ測定アプリ（/desktop）・Android アプリの中では、
  // Google ログインを外のブラウザで行う（WebView 内のログインは Google が拒む。
  // lib/mind/desktop-google-auth.ts）。`desktop` は前の2つ（戻りは測定アプリの
  // ローカル WS）、`nativeLogin` は3つ全部。
  const desktop = isDesktopRoute(usePathname()) || IS_DESKTOP_APP;
  const nativeLogin = desktop || IS_ANDROID_APP;
  const callbackUrl = useDesktopBridgeStore((s) => s.state?.authCallbackUrl);
  const googleStatus = useDesktopLoginStore((s) => s.status);
  const googleMessage = useDesktopLoginStore((s) => s.message);
  const googleUrl = useDesktopLoginStore((s) => s.url);
  const googleStartedAt = useDesktopLoginStore((s) => s.startedAt);
  const [prepared, setPrepared] = useState<PreparedGoogleLogin | null>(null);
  const googleBusy = nativeLogin && (googleStatus === "waiting" || googleStatus === "exchanging");

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);

  const resetForm = () => {
    setEmail("");
    setPassword("");
    setConfirmPassword("");
    setError("");
    setMessage("");
    setShowPassword(false);
    setShowConfirmPassword(false);
  };

  const switchView = (v: "login" | "signup" | "forgot") => {
    resetForm();
    setView(v);
  };

  const closeModal = () => {
    // 失敗の案内は閉じたら片付ける（待機中のログインはそのまま——ブラウザで
    // 終われば、閉じていてもログインは完了する）。
    if (googleStatus === "error") useDesktopLoginStore.getState().reset();
    closeAuthModal();
  };

  const handleLogin = async () => {
    if (!supabase) {
      setError(t("サービスに接続できません", "Can't connect to the service"));
      return;
    }
    setError("");
    setLoading(true);
    const { error: err } = await supabase.auth.signInWithPassword({
      email,
      password,
    });
    setLoading(false);
    if (err) {
      setError(err.message === "Invalid login credentials"
        ? t("メールアドレスまたはパスワードが正しくありません", "Incorrect email address or password")
        : err.message);
    } else {
      resetForm();
      closeModal();
    }
  };

  const handleSignup = async () => {
    if (!supabase) {
      setError(t("サービスに接続できません", "Can't connect to the service"));
      return;
    }
    if (password !== confirmPassword) {
      setError(t("パスワードが一致しません", "The passwords don't match"));
      return;
    }
    if (password.length < 6) {
      setError(t("パスワードは6文字以上にしてください", "Your password must be at least 6 characters"));
      return;
    }
    setError("");
    setLoading(true);
    const { error: err } = await supabase.auth.signUp({ email, password });
    setLoading(false);
    if (err) {
      setError(err.message);
    } else {
      setMessage(
        nativeLogin
          ? t(
              "確認メールを送信しました。メールのリンクを開いて登録を済ませたあと、このアプリに戻ってログインしてください。",
              "We've sent you a confirmation email. Open the link in it to finish signing up, then come back to this app and log in."
            )
          : t(
              "確認メールを送信しました。メールを確認してください。",
              "We've sent you a confirmation email. Please check your inbox."
            )
      );
    }
  };

  const handleForgotPassword = async () => {
    if (!supabase) {
      setError(t("サービスに接続できません", "Can't connect to the service"));
      return;
    }
    setError("");
    setLoading(true);
    const { error: err } = await supabase.auth.resetPasswordForEmail(email);
    setLoading(false);
    if (err) {
      setError(err.message);
    } else {
      setMessage(t("パスワードリセットメールを送信しました。", "We've sent you a password reset email."));
    }
  };

  // ボタンを押す前に PKCE を用意しておく（押した瞬間に同期で開くため）。
  useEffect(() => {
    if (!open || !nativeLogin || googleBusy) return;
    let alive = true;
    void prepareDesktopGoogleLogin().then((p) => {
      if (alive) setPrepared(p);
    });
    return () => {
      alive = false;
    };
  }, [open, nativeLogin, googleBusy, callbackUrl]);

  // ブラウザでのログインが済んで、この画面にセッションが届いたら閉じる。
  useEffect(() => {
    if (open && nativeLogin && user) closeAuthModal();
  }, [open, nativeLogin, user, closeAuthModal]);

  // Supabase 側の期限（5分）を過ぎても戻らなければ、待つのをやめて案内する。
  useEffect(() => {
    if (googleStatus !== "waiting" || googleStartedAt === null) return;
    const t = setTimeout(
      () => expireDesktopGoogleLogin(),
      Math.max(0, googleStartedAt + DESKTOP_LOGIN_TTL_MS - Date.now())
    );
    return () => clearTimeout(t);
  }, [googleStatus, googleStartedAt]);

  const handleGoogleLogin = async () => {
    if (!supabase) {
      setError(t("サービスに接続できません", "Can't connect to the service"));
      return;
    }
    setError("");
    if (IS_ANDROID_APP) {
      if (!prepared) {
        setError("Google ログインの準備ができていません。少し待ってから、もう一度お試しください");
        return;
      }
      // Custom Tab で開く（lib/native/android-google-auth.ts）。戻りはアプリの起動時
      // から聞いている appUrlOpen が受け取る。
      beginDesktopGoogleLogin(prepared, (url) => {
        void import("@/lib/native/android-google-auth").then((m) => m.openGoogleLoginPage(url));
      });
      setPrepared(null);
      return;
    }
    if (desktop) {
      if (!prepared) {
        setError(
          t(
            "測定アプリとの接続を確認して、もう一度お試しください",
            "Please check the connection to the measuring app and try again."
          )
        );
        return;
      }
      beginDesktopGoogleLogin(prepared);
      setPrepared(null);
      return;
    }
    const basePath = process.env.NEXT_PUBLIC_BASE_PATH || "";
    const redirectTo = typeof window !== "undefined"
      ? `${window.location.origin}${basePath}/`
      : undefined;
    const { error: err } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo },
    });
    if (err) {
      setError(err.message);
    }
  };

  const handleSubmit = () => {
    if (view === "login") handleLogin();
    else if (view === "signup") handleSignup();
    else handleForgotPassword();
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !loading) handleSubmit();
  };

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[60] flex items-end sm:items-center justify-center bg-black/60"
      onClick={closeModal}
    >
      <div
        className="w-full max-w-[480px] bg-surface border border-surface-border rounded-t-3xl sm:rounded-3xl p-6 flex flex-col gap-5 neu-raised-lg animate-slide-up"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-bold text-text-primary">
            {view === "login" && t("ログイン", "Log in")}
            {view === "signup" && t("アカウント作成", "Create account")}
            {view === "forgot" && t("パスワードリセット", "Reset password")}
          </h2>
          <button
            onClick={closeModal}
            aria-label={t("閉じる", "Close")}
            className="w-12 h-12 flex items-center justify-center rounded-xl text-text-muted active:scale-95 focus-visible:ring-2 focus-visible:ring-primary focus-visible:outline-none"
          >
            <X size={22} />
          </button>
        </div>

        {/* Error / Message */}
        {(error || (nativeLogin && googleStatus === "error" && googleMessage)) && (
          <p role="alert" className="text-sm text-danger bg-danger/10 rounded-2xl px-4 py-3">
            {error || (googleMessage && t(googleMessage))}
          </p>
        )}
        {message && (
          <p role="status" className="text-sm text-success bg-success/10 rounded-2xl px-4 py-3">
            {message}
          </p>
        )}

        {/* デスクトップの Google ログイン：ブラウザ側で進んでいる間の画面 */}
        {googleBusy && (
          <div className="flex flex-col items-center gap-4 text-center py-2">
            <LoaderCircle size={32} className="text-primary animate-spin" />
            {googleStatus === "exchanging" ? (
              <p className="text-base text-text-primary">{t("ログインしています…", "Logging in…")}</p>
            ) : (
              <>
                <p className="text-base text-text-primary">
                  {t(
                    "ブラウザで Google ログインを続けてください",
                    "Please continue logging in with Google in your browser"
                  )}
                </p>
                <p className="text-sm text-text-secondary">
                  {t(
                    "終わると、この画面に自動で戻ります。",
                    "When you're done, you'll come back to this screen automatically."
                  )}
                </p>
                {googleUrl && (
                  <a
                    href={googleUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="text-sm text-primary underline min-h-12 flex items-center"
                  >
                    {t("ブラウザが開かない場合はこちら", "If your browser didn't open, click here")}
                  </a>
                )}
                <button
                  onClick={cancelDesktopGoogleLogin}
                  className="w-full h-12 rounded-2xl bg-navy text-text-secondary text-base font-bold active:scale-95 neu-raised-sm neu-press"
                >
                  {t("キャンセル", "Cancel")}
                </button>
              </>
            )}
          </div>
        )}

        {!message && !googleBusy && (
          <>
            {/* Email input */}
            <div>
              <label htmlFor="auth-email" className="text-sm text-text-secondary mb-1 block">
                {t("メールアドレス", "Email address")}
              </label>
              <input
                id="auth-email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="example@email.com"
                className="w-full h-12 px-4 rounded-2xl bg-navy text-base text-text-primary placeholder:text-text-muted border border-surface-border focus:border-primary focus:outline-none focus-visible:ring-2 focus-visible:ring-primary neu-inset"
                autoComplete="email"
              />
            </div>

            {/* Password input */}
            {view !== "forgot" && (
              <div>
                <label htmlFor="auth-password" className="text-sm text-text-secondary mb-1 block">
                  {t("パスワード", "Password")}
                </label>
                <div className="relative">
                  <input
                    id="auth-password"
                    type={showPassword ? "text" : "password"}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    onKeyDown={handleKeyDown}
                    placeholder={t("6文字以上", "At least 6 characters")}
                    className="w-full h-12 px-4 pr-12 rounded-2xl bg-navy text-base text-text-primary placeholder:text-text-muted border border-surface-border focus:border-primary focus:outline-none focus-visible:ring-2 focus-visible:ring-primary neu-inset"
                    autoComplete={view === "login" ? "current-password" : "new-password"}
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    aria-label={
                      showPassword
                        ? t("パスワードを隠す", "Hide password")
                        : t("パスワードを表示", "Show password")
                    }
                    className="absolute right-3 top-1/2 -translate-y-1/2 w-12 h-12 flex items-center justify-center text-text-muted active:opacity-70 focus-visible:ring-2 focus-visible:ring-primary focus-visible:outline-none rounded-lg"
                  >
                    {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                  </button>
                </div>
              </div>
            )}

            {/* Confirm password */}
            {view === "signup" && (
              <div>
                <label className="text-sm text-text-secondary mb-1 block">
                  {t("パスワード確認", "Confirm password")}
                </label>
                <input
                  type="password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  placeholder={t("もう一度入力", "Enter it again")}
                  className="w-full h-12 px-4 rounded-2xl bg-navy text-base text-text-primary placeholder:text-text-muted border border-surface-border focus:border-primary focus:outline-none neu-inset"
                  autoComplete="new-password"
                />
              </div>
            )}

            {/* Submit button */}
            <button
              onClick={handleSubmit}
              disabled={loading}
              className="w-full h-12 rounded-2xl bg-primary text-on-primary text-base font-bold active:scale-95 transition-all neu-raised neu-press disabled:opacity-50"
            >
              {loading ? (
                <span className="flex items-center justify-center gap-2">
                  <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  {t("処理中...", "Please wait...")}
                </span>
              ) : (
                <>
                  {view === "login" && t("ログイン", "Log in")}
                  {view === "signup" && t("アカウント作成", "Create account")}
                  {view === "forgot" && t("リセットメール送信", "Send reset email")}
                </>
              )}
            </button>

            {/* Divider */}
            {view !== "forgot" && (
              <div className="flex items-center gap-3">
                <div className="flex-1 h-px bg-surface-border" />
                <span className="text-xs text-text-muted">{t("または", "or")}</span>
                <div className="flex-1 h-px bg-surface-border" />
              </div>
            )}

            {/* Google login */}
            {view !== "forgot" && (
              <button
                onClick={handleGoogleLogin}
                disabled={loading}
                className="w-full h-12 rounded-2xl bg-navy text-text-primary text-base font-bold flex items-center justify-center gap-3 active:scale-95 transition-all neu-raised-sm neu-press disabled:opacity-50"
              >
                <svg viewBox="0 0 24 24" width="20" height="20">
                  <path
                    d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z"
                    fill="#4285F4"
                  />
                  <path
                    d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                    fill="#34A853"
                  />
                  <path
                    d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
                    fill="#FBBC05"
                  />
                  <path
                    d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
                    fill="#EA4335"
                  />
                </svg>
                {t("Googleでログイン", "Log in with Google")}
              </button>
            )}

            {/* Footer links */}
            <div className="flex flex-col items-center gap-2 pt-1">
              {view === "login" && (
                <>
                  <button
                    onClick={() => switchView("forgot")}
                    className="text-sm text-text-muted underline active:opacity-70"
                  >
                    {t("パスワードを忘れた方", "Forgot your password?")}
                  </button>
                  <button
                    onClick={() => switchView("signup")}
                    className="text-sm text-primary font-medium active:opacity-70"
                  >
                    {t("アカウントを作成する", "Create an account")}
                  </button>
                </>
              )}
              {view === "signup" && (
                <button
                  onClick={() => switchView("login")}
                  className="text-sm text-primary font-medium active:opacity-70"
                >
                  {t("すでにアカウントをお持ちの方", "Already have an account?")}
                </button>
              )}
              {view === "forgot" && (
                <button
                  onClick={() => switchView("login")}
                  className="text-sm text-primary font-medium active:opacity-70"
                >
                  {t("ログインに戻る", "Back to log in")}
                </button>
              )}
            </div>
          </>
        )}

        {/* Back to login after success message */}
        {message && (
          <button
            onClick={() => {
              resetForm();
              switchView("login");
            }}
            className="w-full h-12 rounded-2xl bg-navy text-text-secondary text-base font-bold active:scale-95 neu-raised-sm neu-press"
          >
            {t("ログインに戻る", "Back to log in")}
          </button>
        )}
      </div>
    </div>
  );
}
