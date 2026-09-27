import { Directory, Filesystem } from "@capacitor/filesystem";
import { Share } from "@capacitor/share";

/**
 * Android アプリでの「ダウンロード」（lib/audio-export.ts の downloadBlob から）。
 *
 * WebView は blob: URL の <a download> を保存できないので、アプリのキャッシュに
 * 書き出してから Android の共有シートを開く（「ファイル」に保存・Drive・LINE など、
 * 行き先は利用者が選ぶ）。書き出しの画面そのものは Web 版と同じ。
 *
 * 10分の WAV は約106MB あり、base64 にして一度にネイティブへ渡すと WebView の
 * メモリが持たない。3MB ずつ追記する。
 */
const EXPORT_DIR = "exports";
const CHUNK_BYTES = 3 * 1024 * 1024;

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

export async function shareBlobAsFile(blob: Blob, filename: string): Promise<void> {
  // 前回の書き出しはもう要らない（キャッシュに100MB単位で溜めない）。
  await Filesystem.rmdir({ path: EXPORT_DIR, directory: Directory.Cache, recursive: true }).catch(() => {});
  const path = `${EXPORT_DIR}/${filename}`;
  await Filesystem.writeFile({
    path,
    data: await blobToBase64(blob.slice(0, CHUNK_BYTES)),
    directory: Directory.Cache,
    recursive: true,
  });
  for (let offset = CHUNK_BYTES; offset < blob.size; offset += CHUNK_BYTES) {
    await Filesystem.appendFile({
      path,
      data: await blobToBase64(blob.slice(offset, offset + CHUNK_BYTES)),
      directory: Directory.Cache,
    });
  }
  const { uri } = await Filesystem.getUri({ path, directory: Directory.Cache });
  try {
    await Share.share({ title: filename, files: [uri], dialogTitle: "書き出したファイルを保存・共有" });
  } catch {
    // 共有シートを閉じただけ（キャンセル）。
  }
}
