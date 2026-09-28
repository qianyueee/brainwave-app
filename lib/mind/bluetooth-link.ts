import type { BrainLinkErrorCode, BrainLinkPlugin, BtDevice } from "@/lib/native/brainlink";
import { useBluetoothDeviceStore, useBluetoothStore, type BtTarget } from "@/store/useBluetoothStore";
import { ThinkGearParser } from "./thinkgear";
import type { EegSample } from "./types";
import type { LocalizedText } from "@/lib/i18n";

/**
 * Android アプリの Sync Brain：脳波計（BrainLink）との Bluetooth 接続（単一の係）。
 *
 * PC ではブリッジ（bridge/）がシリアルポートを読み、パースし、5秒ごとに繋ぎ直して
 * いた。その役目をアプリの中でする：
 * - ネイティブ（lib/native/brainlink.ts）から受け取ったバイトを ThinkGearParser
 *   （bridge/thinkgear.py の移植）に通し、EegSample を配る
 * - 意図せず切れたら、Sync Brain を開いている間は5秒ごとに繋ぎ直す（ブリッジと同じ）
 * - Sync Brain を開いていて繋がっている間は画面を消さない（消えると WebView が止まり
 *   測定が途切れる）
 *
 * ページが離れても接続そのものは切らない（PC ブリッジが送り続けるのと同じ）：戻れば
 * すぐ続きが見え、実測率の履歴も温まったまま。切るのは利用者の操作
 * （「デモデータに戻す」・別の機器を選ぶ）だけ。自動で許可ダイアログや「Bluetooth を
 * オンに」を出すことはない——それは画面のボタンからだけ。
 *
 * 状態は useBluetoothStore に書く。Capacitor は IS_ANDROID_APP の中でだけ呼ばれる
 * このファイルから動的 import する（Web 版に読み込ませない）。
 */

const RETRY_MS = 5000;

/**
 * 名前を名乗らない機器に付ける名前。最後に繋いだ機器として端末に残るので日本語の
 * まま持ち、英語の画面では接続ダイアログが「Headset」と出す。
 */
export const DEFAULT_DEVICE_NAME = "脳波計";

// ⚠ Capacitor のプラグインは「どんな名前のメソッドでも持っている」ように見える
// Proxy なので、Promise をプラグインそのもので resolve してはいけない（resolve が
// then を探して plugin.then() を呼び、"not implemented" で落ちる）。読み込みの
// Promise は void にして、本体は変数で渡す。
let loading: Promise<void> | null = null;
let plugin: BrainLinkPlugin | null = null;
/** 本物の装置か（ブラウザの替え玉なら false→サンプルを合成データにする）。 */
let real = false;

let parser: ThinkGearParser | null = null;
let lastTs = 0;
/** 利用者が繋ぎたい機器（null＝繋がない）。 */
let want: BtTarget | null = null;
let retryTimer: ReturnType<typeof setTimeout> | null = null;
/** 動いている BluetoothSource の数（＝Sync Brain を開いている）。 */
let active = 0;
let screenKeptOn = false;
const sampleListeners = new Set<(s: EegSample) => void>();

const store = () => useBluetoothStore.getState();

/** 読み込み（1回だけ）。プラグインは Proxy なので `{ p }` に包んで返す（上の注意）。 */
async function load(): Promise<{ p: BrainLinkPlugin }> {
  loading ??= (async () => {
    const m = await import("@/lib/native/brainlink");
    const p = m.BrainLink;
    real = m.isRealBrainLink();
    await p.addListener("data", ({ data, t }) => onData(data, t));
    await p.addListener("connection", (ev) => {
      if (ev.state === "pairing") {
        if (want?.address === ev.address) store().patch({ phase: "pairing", error: null });
      } else if (ev.state === "connected") {
        if (want?.address === ev.address) store().patch({ phase: "connected", error: null });
      } else if (want?.address === ev.address) {
        if (!ev.error) {
          store().patch({ phase: "idle" });
        } else if (ev.error === "BT_OFF") {
          store().patch({ phase: "error", error: messageFor("BT_OFF") });
        } else {
          store().patch({
            phase: "reconnecting",
            error: {
              ja: "接続が切れました。5秒ごとに再接続しています…",
              en: "The connection was lost. Reconnecting every 5 seconds…",
            },
          });
          scheduleRetry();
        }
      }
    });
    await p.addListener("adapterState", ({ adapter }) => {
      store().patch({ adapter });
      if (adapter === "on") void refreshDevices().then(autoConnect);
    });
    await p.addListener("deviceFound", (device) => {
      const found = store().found.filter((d) => d.address !== device.address);
      store().patch({ found: [...found, device] });
    });
    await p.addListener("discoveryFinished", () => store().patch({ discovering: false }));
    useBluetoothStore.subscribe(syncKeepScreenOn);
    plugin = p;
  })();
  await loading;
  return { p: plugin as BrainLinkPlugin };
}

function onData(base64: string, t: number): void {
  if (!parser) return;
  const bin = atob(base64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  for (const s of parser.feed(bytes, t)) {
    // 受信が滞った後は1秒ごとの包が1つの束に並んで届き、同じ時刻になりうる。
    // 10秒チェックは ts でサンプルを見分けるので、必ず前より大きくする。
    const ts = Math.max(s.ts, lastTs + 1);
    lastTs = ts;
    const sample: EegSample = real ? { ...s, ts } : { ...s, ts, synthetic: true };
    store().patch({ lastSampleAt: Date.now() });
    for (const fn of sampleListeners) fn(sample);
  }
}

/** 画面に出す言葉（日本語と英語。表示言語は画面が描画時に選ぶ）。 */
function messageFor(code: BrainLinkErrorCode | null): LocalizedText {
  switch (code) {
    case "UNSUPPORTED":
      return { ja: "この端末は Bluetooth に対応していません", en: "This device doesn't support Bluetooth" };
    case "BT_OFF":
      return { ja: "Bluetooth がオフになっています", en: "Bluetooth is off" };
    case "PERMISSION_DENIED":
      return {
        ja: "「付近のデバイス」へのアクセスが許可されていません",
        en: "Access to “Nearby devices” isn't allowed",
      };
    case "LOCATION_OFF":
      return {
        ja: "近くの機器を探すには、端末の位置情報をオンにしてください（Android 11 以前の決まりです）",
        en: "To find nearby devices, turn on Location on your phone (required on Android 11 and earlier)",
      };
    case "PAIR_FAILED":
      return {
        ja: "ペアリングできませんでした。脳波計の電源を入れ直して、もう一度選んでください",
        en: "Pairing failed. Turn the headset off and on again, then choose it again",
      };
    case "NOT_FOUND":
      return {
        ja: "この機器が見つかりません。もう一度探してください",
        en: "This device can't be found. Please search again",
      };
    case "CONNECT_FAILED":
    case "IO":
      return {
        ja: "つながりませんでした。脳波計の電源と、近くにあるかを確かめてください（5秒ごとに試し続けます）",
        en: "Couldn't connect. Check that the headset is on and nearby (retrying every 5 seconds)",
      };
    default:
      return { ja: "接続できませんでした。もう一度お試しください", en: "Couldn't connect. Please try again" };
  }
}

async function refreshDevices(): Promise<void> {
  const p = plugin;
  if (!p) return;
  try {
    const { devices } = await p.getBondedDevices();
    store().patch({ bonded: devices });
  } catch {
    store().patch({ bonded: [] });
  }
}

/** アダプタ・許可・ペアリング済みの一覧を取り直す。 */
export async function refreshBluetooth(): Promise<void> {
  const { p } = await load();
  const [state, permissions] = await Promise.all([p.getState(), p.checkPermissions()]);
  store().patch({
    ready: true,
    adapter: state.adapter,
    scanNeedsLocation: state.scanNeedsLocation,
    locationEnabled: state.locationEnabled,
    permissions,
  });
  if (state.adapter === "on" && permissions.connect === "granted") await refreshDevices();
}

/** Sync Brain を開いている間の自動接続：最後の機器へ。許可や Bluetooth が揃っていなければ何もしない。 */
function autoConnect(): void {
  if (active === 0) return;
  const s = store();
  if (s.phase === "connected" || s.phase === "connecting" || s.phase === "pairing") return;
  if (s.adapter !== "on" || s.permissions?.connect !== "granted") return;
  const target = want ?? useBluetoothDeviceStore.getState().lastDevice;
  if (!target) return;
  want = target;
  parser ??= new ThinkGearParser();
  void attempt(false);
}

async function attempt(isRetry: boolean): Promise<void> {
  const target = want;
  if (!target) return;
  const { p } = await load();
  store().patch({
    phase: isRetry ? "reconnecting" : "connecting",
    device: target,
    error: isRetry ? store().error : null,
  });
  try {
    await p.connect({ address: target.address });
    if (want?.address === target.address) store().patch({ phase: "connected", error: null });
  } catch (err) {
    const { brainLinkErrorCode } = await import("@/lib/native/brainlink");
    const code = brainLinkErrorCode(err);
    // 取り消し・別の機器に切り替わった・同じ機器へ接続中（その結果を待つ）。
    if (code === "CANCELLED" || code === "BUSY" || want?.address !== target.address) return;
    store().patch({ phase: "error", error: messageFor(code) });
    if (code === "CONNECT_FAILED" || code === "IO") scheduleRetry();
  }
}

function clearRetry(): void {
  if (retryTimer !== null) clearTimeout(retryTimer);
  retryTimer = null;
}

/** 5秒後に繋ぎ直す（Sync Brain を開いている間だけ）。 */
function scheduleRetry(): void {
  clearRetry();
  if (!want || active === 0) return;
  retryTimer = setTimeout(() => {
    retryTimer = null;
    if (want && active > 0) void attempt(true);
  }, RETRY_MS);
}

function syncKeepScreenOn(): void {
  const on = active > 0 && store().phase === "connected";
  if (on === screenKeptOn) return;
  screenKeptOn = on;
  void import("@/lib/native/app-chrome").then(({ AppChrome }) => AppChrome.setKeepScreenOn({ on }).catch(() => {}));
}

// ── 画面から ──

/**
 * BluetoothSource（＝Sync Brain を開いている間）から。状態を取り直し、最後の機器へ
 * 自動で繋ぐ。戻り値で解除。
 */
export function activateBluetooth(): () => void {
  active += 1;
  void refreshBluetooth()
    .then(autoConnect)
    .catch(() => store().patch({ ready: true, adapter: "unsupported" }));
  syncKeepScreenOn();
  return () => {
    active = Math.max(0, active - 1);
    if (active === 0) clearRetry();
    syncKeepScreenOn();
  };
}

export function subscribeBluetoothSamples(fn: (s: EegSample) => void): () => void {
  sampleListeners.add(fn);
  return () => {
    sampleListeners.delete(fn);
  };
}

/** 一覧の機器を選んだ：（必要ならペアリングして）繋ぐ。 */
export async function connectBluetoothDevice(device: BtDevice | BtTarget): Promise<void> {
  const target: BtTarget = { address: device.address, name: device.name || DEFAULT_DEVICE_NAME };
  if (want?.address !== target.address || !parser) {
    // 別の機器：パーサ（実測率の履歴など）も新しく。自動の繋ぎ直しでは使い回す
    // （ブリッジが同じ読み取りスレッドの中でパーサを使い回すのと同じ）。
    parser = new ThinkGearParser();
  }
  want = target;
  useBluetoothDeviceStore.getState().setLastDevice(target);
  clearRetry();
  await attempt(false);
}

/** 「デモデータに戻す」：接続をやめる（最後の機器は覚えておく）。 */
export async function disconnectBluetooth(): Promise<void> {
  want = null;
  clearRetry();
  store().patch({ phase: "idle", device: null, error: null });
  const p = plugin;
  if (p) await p.disconnect().catch(() => {});
}

export async function requestBluetoothPermission(): Promise<void> {
  const { p } = await load();
  const permissions = await p.requestPermissions({ permissions: ["connect", "scan"] });
  store().patch({ permissions });
  if (permissions.connect === "granted") {
    await refreshBluetooth();
    autoConnect();
  }
}

export async function requestBluetoothOn(): Promise<void> {
  const { p } = await load();
  try {
    await p.requestEnable();
  } catch {
    // 断られた・対応していない：状態の取り直しで画面が分かる
  }
  await refreshBluetooth();
  autoConnect();
}

export async function openBluetoothSettings(target: "app" | "bluetooth" | "location"): Promise<void> {
  const { p } = await load();
  await p.openSettings({ target }).catch(() => {});
}

/** 近くの機器を探す（約12秒。見つかった順に store.found へ）。 */
export async function startBluetoothScan(): Promise<void> {
  const { p } = await load();
  let permissions = store().permissions;
  if (permissions?.scan !== "granted") {
    permissions = await p.requestPermissions({ permissions: ["scan"] });
    store().patch({ permissions });
    if (permissions.scan !== "granted") {
      store().patch({
        error: store().scanNeedsLocation
          ? {
              ja: "近くの機器を探すには、位置情報の許可が必要です（Android 11 以前の決まりです）",
              en: "Finding nearby devices needs Location permission (required on Android 11 and earlier)",
            }
          : {
              ja: "近くの機器を探すには、「付近のデバイス」の許可が必要です",
              en: "Finding nearby devices needs the “Nearby devices” permission",
            },
      });
      return;
    }
  }
  store().patch({ found: [], discovering: true, error: null });
  try {
    await p.startDiscovery();
  } catch (err) {
    const { brainLinkErrorCode } = await import("@/lib/native/brainlink");
    store().patch({ discovering: false, error: messageFor(brainLinkErrorCode(err)) });
  }
}

export async function stopBluetoothScan(): Promise<void> {
  store().patch({ discovering: false });
  const p = plugin;
  if (p) await p.stopDiscovery().catch(() => {});
}
