import { isValidSample, type EegSample } from "./types";
import { useDesktopBridgeStore } from "@/store/useDesktopBridgeStore";

/**
 * デスクトップ測定アプリ（bridge/desktop_app.py）のローカル WS クライアント。
 *
 * 1 本のソケットにサンプルと制御を両方乗せる（プロトコルの正は
 * bridge/local_server.py のモジュールコメント）。ソケットをこのシングルトンが
 * 持ち LocalSource には持たせないのは、接続ダイアログがサンプル表示より先に
 * 制御（ポート一覧・クラウド切替）を必要とするから——画面がまだデモ表示の
 * うちからポートを選べる。
 *
 * 接続先は `ws://127.0.0.1:{port}`。ポートはページ URL の `?ws=`（desktop_app が
 * ウィンドウを開くときに実ポートを埋める）、無ければ既定の 17861（`pnpm dev` で
 * `--no-window` サーバへ繋ぐ開発フロー）。
 */

export interface DesktopPortInfo {
  device: string;
  description: string;
}

export interface DesktopBridgeState {
  running: boolean;
  mode: "serial" | "demo" | null;
  serial: {
    status: "disconnected" | "connecting" | "connected";
    port: string;
    /** シリアル再試行ループの直近の理由（日本語1行）。UI にそのまま出す。 */
    detail: string;
  };
  ports: DesktopPortInfo[];
  cloud: { enabled: boolean; connected: boolean; code: string };
  csvPath: string | null;
  sampleCount: number;
}

export type DesktopCommand =
  | { type: "scan" }
  | { type: "connect"; port: string }
  | { type: "disconnect" }
  | { type: "demo"; on: boolean }
  | { type: "cloud"; on: boolean; code?: string };

export const DEFAULT_WS_PORT = 17861;

const RETRY_BASE_MS = 500;
const RETRY_CAP_MS = 5000;

let socket: WebSocket | null = null;
let refCount = 0;
let attempt = 0;
let retryTimer: ReturnType<typeof setTimeout> | null = null;
const sampleListeners = new Set<(s: EegSample) => void>();

function wsUrl(): string {
  let port = DEFAULT_WS_PORT;
  if (typeof location !== "undefined") {
    const q = new URLSearchParams(location.search).get("ws");
    if (q && /^\d+$/.test(q)) port = Number(q);
  }
  return `ws://127.0.0.1:${port}`;
}

function connect(): void {
  if (socket !== null || typeof window === "undefined") return;
  const ws = new WebSocket(wsUrl());
  socket = ws;

  ws.onopen = () => {
    attempt = 0;
    useDesktopBridgeStore.getState().setWsConnected(true);
  };
  ws.onmessage = (ev) => {
    let msg: unknown;
    try {
      msg = JSON.parse(String(ev.data));
    } catch {
      return;
    }
    if (typeof msg !== "object" || msg === null) return;
    const m = msg as { type?: string; state?: DesktopBridgeState; sample?: unknown; msg?: string };
    if (m.type === "state" && m.state) {
      useDesktopBridgeStore.getState().setBridgeState(m.state);
    } else if (m.type === "sample" && isValidSample(m.sample)) {
      for (const fn of sampleListeners) fn(m.sample);
    } else if (m.type === "log" && typeof m.msg === "string") {
      console.info("[desktop-bridge]", m.msg);
      useDesktopBridgeStore.getState().setLastLog(m.msg);
    }
  };
  ws.onclose = () => {
    if (socket !== ws) return; // release() 済み・古い接続
    socket = null;
    useDesktopBridgeStore.getState().setWsConnected(false);
    if (refCount > 0) {
      // 測定アプリの再起動を待って指数バックオフで繋ぎ直す。
      const delay = Math.min(RETRY_BASE_MS * 2 ** attempt, RETRY_CAP_MS);
      attempt += 1;
      retryTimer = setTimeout(() => {
        retryTimer = null;
        connect();
      }, delay);
    }
  };
  ws.onerror = () => {
    ws.close();
  };
}

/** 参照カウント式：ページと LocalSource が重ねて呼んでも接続は 1 本のまま。 */
export function ensureDesktopBridge(): void {
  refCount += 1;
  connect();
}

export function releaseDesktopBridge(): void {
  refCount = Math.max(0, refCount - 1);
  if (refCount > 0) return;
  if (retryTimer !== null) {
    clearTimeout(retryTimer);
    retryTimer = null;
  }
  const ws = socket;
  socket = null;
  attempt = 0;
  ws?.close();
  useDesktopBridgeStore.getState().setWsConnected(false);
}

/** 送れたら true。切断中は false（コマンドはキューしない——state 全量が正なので、
 *  再接続時にサーバから最新 state が来て UI が追いつく）。 */
export function sendDesktopCommand(cmd: DesktopCommand): boolean {
  if (socket?.readyState === WebSocket.OPEN) {
    socket.send(JSON.stringify(cmd));
    return true;
  }
  return false;
}

export function subscribeDesktopSamples(fn: (s: EegSample) => void): () => void {
  sampleListeners.add(fn);
  return () => {
    sampleListeners.delete(fn);
  };
}
