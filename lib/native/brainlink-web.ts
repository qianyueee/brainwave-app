import { WebPlugin } from "@capacitor/core";
import { ThinkGearSynth } from "@/lib/mind/thinkgear-synth";
import type {
  BrainLinkErrorCode,
  BrainLinkPermissions,
  BrainLinkPlugin,
  BtAdapterState,
  BtDevice,
  BtPermission,
} from "./brainlink";

/**
 * ブラウザで Android 版の画面を開発するときの「脳波計の替え玉」
 * （`NEXT_PUBLIC_APP_PLATFORM=android pnpm dev`）。本物の BrainLinkPlugin と同じ形で
 * 振る舞い、合成の ThinkGear（lib/mind/thinkgear-synth.ts）を 100ms ごとに流す。
 * ここからの測定は lib/mind/bluetooth-link.ts が合成データ（synthetic）にするので、
 * 実測として保存・送信されることはない。
 *
 * 画面の各状態を試せるよう、localStorage の "brainlink-mock" に JSON で指定できる：
 *   { "adapter": "off" | "unsupported", "connect": "prompt" | "denied", "scan": ...,
 *     "failConnect": true, "dropAfterSec": 20, "rawRate": 481 }
 */
interface MockConfig {
  adapter?: BtAdapterState;
  connect?: BtPermission;
  scan?: BtPermission;
  failConnect?: boolean;
  dropAfterSec?: number;
  rawRate?: number;
}

function readConfig(): MockConfig {
  try {
    return JSON.parse(localStorage.getItem("brainlink-mock") ?? "{}") as MockConfig;
  } catch {
    return {};
  }
}

function fail(code: BrainLinkErrorCode, message: string = code): Error {
  return Object.assign(new Error(message), { code });
}

function toBase64(bytes: Uint8Array): string {
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin);
}

const PAIRED: BtDevice[] = [
  { address: "00:1A:7D:DA:71:13", name: "BrainLink_Pro", bonded: true },
  { address: "4C:87:5D:12:34:56", name: "Galaxy Buds2", bonded: true },
];
const NEARBY: BtDevice[] = [
  { address: "00:1A:7D:DA:71:99", name: "BrainLink_Lite", bonded: false },
  { address: "F0:99:B6:00:11:22", name: null, bonded: false },
];

export class BrainLinkWeb extends WebPlugin implements Omit<BrainLinkPlugin, "addListener"> {
  private config = readConfig();
  private adapter: BtAdapterState = this.config.adapter ?? "on";
  private perms: BrainLinkPermissions = {
    connect: this.config.connect ?? "prompt",
    scan: this.config.scan ?? "prompt",
  };
  private bonded = new Set(PAIRED.map((d) => d.address));
  private stream: ReturnType<typeof setInterval> | null = null;
  private connected: string | null = null;
  private discoveryTimers: ReturnType<typeof setTimeout>[] = [];

  async getState() {
    return { adapter: this.adapter, scanNeedsLocation: false, locationEnabled: true };
  }

  async checkPermissions() {
    return { ...this.perms };
  }

  async requestPermissions(options?: { permissions?: ("connect" | "scan")[] }) {
    const wanted = options?.permissions ?? ["connect", "scan"];
    for (const p of wanted) if (this.perms[p] !== "denied") this.perms[p] = "granted";
    return { ...this.perms };
  }

  async requestEnable() {
    if (this.adapter === "unsupported") throw fail("UNSUPPORTED");
    this.adapter = "on";
    this.notifyListeners("adapterState", { adapter: "on" });
    return { enabled: true };
  }

  async openSettings() {}

  async getBondedDevices() {
    this.usable();
    return { devices: [...PAIRED, ...NEARBY].filter((d) => this.bonded.has(d.address)).map((d) => ({ ...d, bonded: true })) };
  }

  async startDiscovery() {
    this.usable();
    if (this.perms.scan !== "granted") throw fail("PERMISSION_DENIED");
    this.stopTimers();
    NEARBY.forEach((d, i) => {
      this.discoveryTimers.push(
        setTimeout(() => this.notifyListeners("deviceFound", { ...d, bonded: this.bonded.has(d.address) }), 700 * (i + 1))
      );
    });
    this.discoveryTimers.push(setTimeout(() => this.notifyListeners("discoveryFinished", {}), 4000));
  }

  async stopDiscovery() {
    this.stopTimers();
  }

  async connect({ address }: { address: string }) {
    this.usable();
    if (this.connected === address) return;
    this.halt();
    const device = [...PAIRED, ...NEARBY].find((d) => d.address === address);
    if (!device) throw fail("NOT_FOUND");
    if (!this.bonded.has(address)) {
      this.notifyListeners("connection", { state: "pairing", address });
      await new Promise((r) => setTimeout(r, 1200));
      this.bonded.add(address);
    }
    await new Promise((r) => setTimeout(r, 800));
    if (this.config.failConnect) throw fail("CONNECT_FAILED", "read failed, socket might closed or timeout");
    this.connected = address;
    this.notifyListeners("connection", { state: "connected", address });

    const synth = new ThinkGearSynth({ seed: Date.now() % 100000, rawRate: this.config.rawRate ?? 512 });
    let second = synth.nextSecond();
    let tick = 0;
    let elapsed = 0;
    this.stream = setInterval(() => {
      // 1秒ぶんを10回に分けて流す（実機の約50ms ごとの束に近い粒度）。
      const size = Math.ceil(second.length / 10);
      const part = second.subarray(tick * size, (tick + 1) * size);
      this.notifyListeners("data", { data: toBase64(part), t: Date.now() });
      tick += 1;
      if (tick >= 10) {
        tick = 0;
        second = synth.nextSecond();
        elapsed += 1;
        if (this.config.dropAfterSec && elapsed >= this.config.dropAfterSec) {
          this.halt();
          this.notifyListeners("connection", { state: "disconnected", address, error: "IO", message: "mock drop" });
        }
      }
    }, 100);
  }

  async disconnect() {
    const address = this.connected;
    this.halt();
    if (address) this.notifyListeners("connection", { state: "disconnected", address });
  }

  private usable(): void {
    if (this.adapter === "unsupported") throw fail("UNSUPPORTED");
    if (this.adapter !== "on") throw fail("BT_OFF");
    if (this.perms.connect !== "granted") throw fail("PERMISSION_DENIED");
  }

  private halt(): void {
    if (this.stream !== null) clearInterval(this.stream);
    this.stream = null;
    this.connected = null;
  }

  private stopTimers(): void {
    this.discoveryTimers.forEach(clearTimeout);
    this.discoveryTimers = [];
  }
}
