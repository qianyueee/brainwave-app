import { Capacitor, registerPlugin } from "@capacitor/core";

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
  finish(options: { id: string }): Promise<{ name: string }>;
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

export async function saveBlobToDownloads(blob: Blob, filename: string): Promise<void> {
  const { id } = await Downloads.begin({
    filename,
    mimeType: blob.type || "application/octet-stream",
  });
  try {
    for (let offset = 0; offset < blob.size; offset += CHUNK_BYTES) {
      await Downloads.append({ id, data: await blobToBase64(blob.slice(offset, offset + CHUNK_BYTES)) });
    }
    await Downloads.finish({ id });
  } catch (err) {
    await Downloads.abort({ id }).catch(() => {});
    throw err;
  }
}
