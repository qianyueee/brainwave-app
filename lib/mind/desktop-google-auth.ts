import { supabase, SUPABASE_ANON_KEY, SUPABASE_URL } from "@/lib/supabase";
import { useDesktopBridgeStore } from "@/store/useDesktopBridgeStore";
import { useDesktopLoginStore } from "@/store/useDesktopLoginStore";
import type { DesktopAuthCallback } from "./desktop-bridge";

/**
 * デスクトップ測定アプリの Google ログイン（ネイティブアプリ向けの定石＝
 * RFC 8252 の「既定のブラウザ＋ループバック＋PKCE」）。
 *
 * Google はアプリに埋め込まれた WebView の中でのログインを拒むので、ログイン
 * ページは既定のブラウザで開く（window.open → pywebview がブラウザへ回す）。
 * 終わると Supabase がそのブラウザを測定アプリの HTTP サーバ
 * （http://127.0.0.1:17860/auth/callback、state.authCallbackUrl）へ戻し、Python が
 * code をローカル WS でこの画面へ渡す（bridge/static_server.py → local_server.py）。
 * 画面は、最初に作っておいた verifier と code を引き換えてセッションを得る。
 *
 * - verifier はこの画面の中（sessionStorage）にしか無いので、途中で code を見た
 *   ほかのプログラムがあっても、それだけではログインできない。1回使ったら捨てる。
 * - アプリ全体の supabase クライアントは implicit フローのまま——Web 版の Google
 *   ログインや、メールの確認リンクの動きは変えない。ここだけ PKCE の交換を
 *   GoTrue の API へ直接頼む（auth-js の exchangeCodeForSession と同じ呼び方）。
 * - Supabase 側の flow state は /authorize から5分で切れる。
 */

const PENDING_KEY = "desktop-google-login";
/** GoTrue の flow state の寿命（/authorize から）。 */
export const DESKTOP_LOGIN_TTL_MS = 5 * 60_000;

const TIMEOUT_MESSAGE =
  "時間がかかりすぎたため、ログインを完了できませんでした。もう一度「Googleでログイン」からお試しください";

export interface PreparedGoogleLogin {
  url: string;
  verifier: string;
}

interface Pending {
  verifier: string;
  startedAt: number;
}

// sessionStorage が使えない環境の控え（同じ画面の中でしか使わない）。
let pendingInMemory: Pending | null = null;

function base64url(bytes: Uint8Array): string {
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

/**
 * ログインページの URL と verifier を用意する。ボタンを押す前（ダイアログを
 * 開いたとき）に済ませておく——押した瞬間に同期で window.open しないと、
 * ブラウザによってはポップアップとして止められる。測定アプリと繋がっていない
 * （戻り先が分からない）・アカウント機能の無いビルドでは null。
 */
export async function prepareDesktopGoogleLogin(): Promise<PreparedGoogleLogin | null> {
  const callback = useDesktopBridgeStore.getState().state?.authCallbackUrl;
  if (!SUPABASE_URL || !callback || typeof crypto === "undefined" || !crypto.subtle) return null;
  const verifier = base64url(crypto.getRandomValues(new Uint8Array(32)));
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(verifier));
  const params = new URLSearchParams({
    provider: "google",
    redirect_to: callback,
    code_challenge: base64url(new Uint8Array(digest)),
    code_challenge_method: "s256",
  });
  return { url: `${SUPABASE_URL}/auth/v1/authorize?${params.toString()}`, verifier };
}

/** ボタンを押したとき（同期）：戻りを待つ状態にして、既定のブラウザでログインページを開く。 */
export function beginDesktopGoogleLogin(prepared: PreparedGoogleLogin): void {
  const pending: Pending = { verifier: prepared.verifier, startedAt: Date.now() };
  pendingInMemory = pending;
  try {
    sessionStorage.setItem(PENDING_KEY, JSON.stringify(pending));
  } catch {
    // 使えなくてもメモリの控えで足りる
  }
  useDesktopLoginStore.getState().setWaiting(prepared.url);
  window.open(prepared.url, "_blank");
}

function clearPending(): void {
  pendingInMemory = null;
  try {
    sessionStorage.removeItem(PENDING_KEY);
  } catch {
    // noop
  }
}

export function cancelDesktopGoogleLogin(): void {
  clearPending();
  useDesktopLoginStore.getState().reset();
}

/** 待っているログインの verifier を取り出して捨てる（1回きり）。 */
function takePending(): Pending | null {
  let pending = pendingInMemory;
  try {
    const raw = sessionStorage.getItem(PENDING_KEY);
    if (raw) pending = JSON.parse(raw) as Pending;
  } catch {
    // noop
  }
  clearPending();
  return pending && typeof pending.verifier === "string" ? pending : null;
}

function describeError(ev: DesktopAuthCallback): string {
  if (ev.error === "access_denied") return "Google ログインがキャンセルされました";
  if (ev.errorCode === "flow_state_expired") return TIMEOUT_MESSAGE;
  return "Google ログインに失敗しました。もう一度お試しください";
}

/**
 * ローカル WS から Google ログインの戻りが届いたとき（/desktop のページが常時
 * 購読している）。待っているログインが無ければ何もしない——別の画面が始めた
 * もの、もう使ったもの、よそから差し込まれたものは受け付けない。
 */
export async function completeDesktopGoogleLogin(ev: DesktopAuthCallback): Promise<void> {
  const pending = takePending();
  if (!pending) return;
  const store = useDesktopLoginStore.getState();
  if (ev.error || !ev.code) {
    store.setError(describeError(ev));
    return;
  }
  if (Date.now() - pending.startedAt > DESKTOP_LOGIN_TTL_MS) {
    store.setError(TIMEOUT_MESSAGE);
    return;
  }
  if (!supabase || !SUPABASE_URL || !SUPABASE_ANON_KEY) {
    store.setError("このアプリはログインに対応していません");
    return;
  }
  store.setExchanging();
  try {
    const res = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=pkce`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        apikey: SUPABASE_ANON_KEY,
        Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
      },
      body: JSON.stringify({ auth_code: ev.code, code_verifier: pending.verifier }),
    });
    const body = (await res.json().catch(() => ({}))) as {
      access_token?: string;
      refresh_token?: string;
      error_code?: string;
    };
    if (!res.ok || !body.access_token || !body.refresh_token) {
      store.setError(
        body.error_code === "flow_state_expired"
          ? TIMEOUT_MESSAGE
          : "ログインを完了できませんでした。もう一度お試しください"
      );
      return;
    }
    // 以降は通常のログインと同じ：SIGNED_IN を AuthProvider が受け取る。
    const { error } = await supabase.auth.setSession({
      access_token: body.access_token,
      refresh_token: body.refresh_token,
    });
    if (error) {
      store.setError("ログインを完了できませんでした。もう一度お試しください");
      return;
    }
    store.reset();
  } catch {
    store.setError("インターネットに接続できませんでした。接続を確認して、もう一度お試しください");
  }
}

/** 期限切れ（AuthModal のタイマー）：待つのをやめる。後から戻りが届いても使わない。 */
export function expireDesktopGoogleLogin(): void {
  clearPending();
  useDesktopLoginStore
    .getState()
    .setError(
      `${TIMEOUT_MESSAGE}。ブラウザでログインしたあと Web版の画面が開いてしまう場合は、管理者に Supabase のリダイレクト URL 設定を確認してもらってください`
    );
}
