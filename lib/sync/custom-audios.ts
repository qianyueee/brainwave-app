import { supabase } from "@/lib/supabase";
import type { CustomAudioMeta } from "@/store/useCustomAudioStore";
import { getAudioBlob, saveAudio, deleteAudio as idbDelete } from "@/lib/custom-audio-db";

const BUCKET = "user-audio";

export interface CustomAudioRow {
  id: string;
  user_id: string;
  name: string;
  mime_type: string;
  storage_path: string;
  size_bytes: number | null;
  duration_sec: number | null;
  created_at: string;
}

export interface CustomAudioRemote extends CustomAudioMeta {
  storagePath: string;
  sizeBytes: number | null;
  durationSec: number | null;
  createdAt: string;
}

function assertClient() {
  if (!supabase) throw new Error("Supabase client not initialized");
  return supabase;
}

function rowToRemote(row: CustomAudioRow): CustomAudioRemote {
  return {
    id: row.id,
    name: row.name,
    mimeType: row.mime_type,
    storagePath: row.storage_path,
    sizeBytes: row.size_bytes,
    durationSec: row.duration_sec,
    createdAt: row.created_at,
  };
}

function inferExt(mimeType: string): string {
  if (mimeType.includes("mpeg") || mimeType.includes("mp3")) return "mp3";
  if (mimeType.includes("wav")) return "wav";
  if (mimeType.includes("ogg")) return "ogg";
  if (mimeType.includes("webm")) return "webm";
  if (mimeType.includes("aac")) return "aac";
  if (mimeType.includes("mp4") || mimeType.includes("m4a")) return "m4a";
  return "bin";
}

export async function listAudios(userId: string): Promise<CustomAudioRemote[]> {
  const sb = assertClient();
  const { data, error } = await sb
    .from("user_custom_audios")
    .select("*")
    .eq("user_id", userId)
    .order("created_at", { ascending: true });
  if (error) throw error;
  return (data as CustomAudioRow[]).map(rowToRemote);
}

export async function uploadAudio(
  userId: string,
  id: string,
  blob: Blob,
  name: string,
  mimeType: string,
  durationSec?: number,
): Promise<CustomAudioRemote> {
  const sb = assertClient();
  const ext = inferExt(mimeType);
  const storagePath = `${userId}/${id}.${ext}`;

  const { error: upErr } = await sb.storage
    .from(BUCKET)
    .upload(storagePath, blob, { contentType: mimeType, upsert: true });
  if (upErr) throw upErr;

  const { data, error } = await sb
    .from("user_custom_audios")
    .upsert({
      id,
      user_id: userId,
      name,
      mime_type: mimeType,
      storage_path: storagePath,
      size_bytes: blob.size,
      duration_sec: durationSec ?? null,
    })
    .select()
    .single();
  if (error) {
    // Best-effort cleanup of orphan storage object
    await sb.storage.from(BUCKET).remove([storagePath]).catch(() => undefined);
    throw error;
  }
  return rowToRemote(data as CustomAudioRow);
}

export async function deleteAudio(userId: string, id: string, storagePath: string): Promise<void> {
  const sb = assertClient();
  const { error: dbErr } = await sb
    .from("user_custom_audios")
    .delete()
    .eq("user_id", userId)
    .eq("id", id);
  if (dbErr) throw dbErr;

  // Tolerate Storage 404 (object already gone)
  await sb.storage.from(BUCKET).remove([storagePath]).catch(() => undefined);
  await idbDelete(id).catch(() => undefined);
}

export async function getSignedUrl(storagePath: string, ttlSec = 3600): Promise<string> {
  const sb = assertClient();
  const { data, error } = await sb.storage.from(BUCKET).createSignedUrl(storagePath, ttlSec);
  if (error || !data) throw error ?? new Error("Failed to sign url");
  return data.signedUrl;
}

export async function ensureBlobCached(meta: CustomAudioRemote): Promise<Blob> {
  const cached = await getAudioBlob(meta.id);
  if (cached) return cached;
  const url = await getSignedUrl(meta.storagePath);
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Failed to download audio: ${res.status}`);
  const blob = await res.blob();
  await saveAudio({ id: meta.id, name: meta.name, mimeType: meta.mimeType, blob });
  return blob;
}
