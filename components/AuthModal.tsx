"use client";

import { useState } from "react";
import { useAuthStore } from "@/store/useAuthStore";
import { supabase } from "@/lib/supabase";
import { X } from "lucide-react";

export default function AuthModal() {
  const open = useAuthStore((s) => s.authModalOpen);
  const view = useAuthStore((s) => s.authModalView);
  const setView = useAuthStore((s) => s.setAuthModalView);
  const closeModal = useAuthStore((s) => s.closeAuthModal);

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);

  const resetForm = () => {
    setEmail("");
    setPassword("");
    setConfirmPassword("");
    setError("");
    setMessage("");
  };

  const switchView = (v: "login" | "signup" | "forgot") => {
    resetForm();
    setView(v);
  };

  const handleLogin = async () => {
    if (!supabase) {
      setError("サービスに接続できません");
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
        ? "メールアドレスまたはパスワードが正しくありません"
        : err.message);
    } else {
      resetForm();
      closeModal();
    }
  };

  const handleSignup = async () => {
    if (!supabase) {
      setError("サービスに接続できません");
      return;
    }
    if (password !== confirmPassword) {
      setError("パスワードが一致しません");
      return;
    }
    if (password.length < 6) {
      setError("パスワードは6文字以上にしてください");
      return;
    }
    setError("");
    setLoading(true);
    const { error: err } = await supabase.auth.signUp({ email, password });
    setLoading(false);
    if (err) {
      setError(err.message);
    } else {
      setMessage("確認メールを送信しました。メールを確認してください。");
    }
  };

  const handleForgotPassword = async () => {
    if (!supabase) {
      setError("サービスに接続できません");
      return;
    }
    setError("");
    setLoading(true);
    const { error: err } = await supabase.auth.resetPasswordForEmail(email);
    setLoading(false);
    if (err) {
      setError(err.message);
    } else {
      setMessage("パスワードリセットメールを送信しました。");
    }
  };

  const handleGoogleLogin = async () => {
    if (!supabase) {
      setError("サービスに接続できません");
      return;
    }
    setError("");
    const redirectTo = typeof window !== "undefined"
      ? `${window.location.origin}${window.location.pathname}`
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
            {view === "login" && "ログイン"}
            {view === "signup" && "アカウント作成"}
            {view === "forgot" && "パスワードリセット"}
          </h2>
          <button
            onClick={closeModal}
            className="w-10 h-10 flex items-center justify-center rounded-xl text-text-muted active:scale-95"
          >
            <X size={22} />
          </button>
        </div>

        {/* Error / Message */}
        {error && (
          <p className="text-sm text-red-400 bg-red-400/10 rounded-2xl px-4 py-3">
            {error}
          </p>
        )}
        {message && (
          <p className="text-sm text-emerald-400 bg-emerald-400/10 rounded-2xl px-4 py-3">
            {message}
          </p>
        )}

        {!message && (
          <>
            {/* Email input */}
            <div>
              <label className="text-sm text-text-secondary mb-1 block">
                メールアドレス
              </label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="example@email.com"
                className="w-full h-12 px-4 rounded-2xl bg-navy text-base text-text-primary placeholder:text-text-muted border border-surface-border focus:border-primary focus:outline-none neu-inset"
                autoComplete="email"
              />
            </div>

            {/* Password input */}
            {view !== "forgot" && (
              <div>
                <label className="text-sm text-text-secondary mb-1 block">
                  パスワード
                </label>
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="6文字以上"
                  className="w-full h-12 px-4 rounded-2xl bg-navy text-base text-text-primary placeholder:text-text-muted border border-surface-border focus:border-primary focus:outline-none neu-inset"
                  autoComplete={view === "login" ? "current-password" : "new-password"}
                />
              </div>
            )}

            {/* Confirm password */}
            {view === "signup" && (
              <div>
                <label className="text-sm text-text-secondary mb-1 block">
                  パスワード確認
                </label>
                <input
                  type="password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  placeholder="もう一度入力"
                  className="w-full h-12 px-4 rounded-2xl bg-navy text-base text-text-primary placeholder:text-text-muted border border-surface-border focus:border-primary focus:outline-none neu-inset"
                  autoComplete="new-password"
                />
              </div>
            )}

            {/* Submit button */}
            <button
              onClick={handleSubmit}
              disabled={loading}
              className="w-full h-12 rounded-2xl bg-primary text-white text-base font-bold active:scale-95 transition-all neu-raised neu-press disabled:opacity-50"
            >
              {loading ? (
                <span className="flex items-center justify-center gap-2">
                  <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  処理中...
                </span>
              ) : (
                <>
                  {view === "login" && "ログイン"}
                  {view === "signup" && "アカウント作成"}
                  {view === "forgot" && "リセットメール送信"}
                </>
              )}
            </button>

            {/* Divider */}
            {view !== "forgot" && (
              <div className="flex items-center gap-3">
                <div className="flex-1 h-px bg-surface-border" />
                <span className="text-xs text-text-muted">または</span>
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
                Googleでログイン
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
                    パスワードを忘れた方
                  </button>
                  <button
                    onClick={() => switchView("signup")}
                    className="text-sm text-primary font-medium active:opacity-70"
                  >
                    アカウントを作成する
                  </button>
                </>
              )}
              {view === "signup" && (
                <button
                  onClick={() => switchView("login")}
                  className="text-sm text-primary font-medium active:opacity-70"
                >
                  すでにアカウントをお持ちの方
                </button>
              )}
              {view === "forgot" && (
                <button
                  onClick={() => switchView("login")}
                  className="text-sm text-primary font-medium active:opacity-70"
                >
                  ログインに戻る
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
            ログインに戻る
          </button>
        )}
      </div>
    </div>
  );
}
