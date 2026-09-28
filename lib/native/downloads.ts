import { Capacitor, registerPlugin } from "@capacitor/core";
import { getLocale, translator } from "@/lib/i18n";

/**
 * 「ダウンロード」フォルダへの保存（android/…/DownloadsPlugin.java）。
 * lib/audio-export.ts の downloadBlob が Android アプリでだけ使う。
 *
 * WebView は blob: の <a download> を保存できないので、スマホの Chrome と同じく
 * 端末の「ダウンロード」に置く（終わると端末が知らせる）。10分の WAV は約106MB
 * あり、base64 で一度に渡すと WebView のメモリが持たないので 1MB ずつ送る。
 */
interface DownloadsPlugin {
  begin(options: { filename: string; mimeType: string }): Promise<{ id: string }>;
  append(options: { id: string; data: string }): Promise<void>;
  /** savedMessage：保存を知らせる言葉（表示言語で。無ければ日本語）。 */
  finish(options: { id: string; savedMessage?: string }): Promise<{ name: string }>;
  abort(options: { id: string }): Promise<void>;
}

const Downloads = registerPlugin<DownloadsPlugin>("NeuroSyncDownloads");

const CHUNK_BYTES = 1024 * 1024;

/** ネイティブで保存できるか（ブラウザで Android 版の画面を開発しているときは false）。 */
export function canSaveToDownloads(): boolean {
  return Capacitor.isNativePlatform();
}

function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(reader.error ?? new Error("read failed"));
    reader.onload = () => {
      const url = String(reader.result);
      resolve(url.slice(url.indexOf(",") + 1));
    };
    reader.readAsDataURL(blob);
  });
}

/**
 * ネイティブ（DownloadsPlugin.java）の失敗の言葉は日本語なので、英語の画面では
 * コードと段階から英語に替える（書き出しの画面は Error の message をそのまま出す）。
 * 日本語の画面では元のまま。
 */
const FAILED_EN: Record<"begin" | "append" | "finish", string> = {
  begin: "Couldn't start saving the file",
  append: "Couldn't write the file (check the free space)",
  finish: "Couldn't finish saving the file",
};

function localizedError(err: unknown, stage: "begin" | "append" | "finish"): unknown {
  if (getLocale() !== "en") return err;
  const code = (err as { code?: unknown } | null)?.code;
  if (code === "PERMISSION_DENIED") return new Error("Saving files wasn't allowed");
  return new Error(FAILED_EN[stage]);
}

export async function saveBlobToDownloads(blob: Blob, filename: string): Promise<void> {
  let stage: "begin" | "append" | "finish" = "begin";
  let id: string | null = null;
  try {
    ({ id } = await Downloads.begin({
      filename,
      mimeType: blob.type || "application/octet-stream",
    }));
    stage = "append";
    for (let offset = 0; offset < blob.size; offset += CHUNK_BYTES) {
      await Downloads.append({ id, data: await blobToBase64(blob.slice(offset, offset + CHUNK_BYTES)) });
    }
    stage = "finish";
    await Downloads.finish({
      id,
      savedMessage: translator(getLocale())("「ダウンロード」に保存しました：", "Saved to Downloads: "),
    });
  } catch (err) {
    if (id !== null) {
      const openId = id;
      await Downloads.abort({ id: openId }).catch(() => {});
    }
    throw localizedError(err, stage);
  }
}
