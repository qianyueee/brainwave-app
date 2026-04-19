import type { User } from "@supabase/supabase-js";
import type { SynthPreset } from "@/lib/synth-engine";
import type { CustomProgram } from "@/lib/programs";
import type { BrainProfile } from "@/lib/brain-profile";
import type { CustomAudioMeta } from "@/store/useCustomAudioStore";
import { bulkInsertPresets, listPresets } from "./presets";
import { bulkInsertPrograms, listPrograms } from "./programs";
import { getBrainProfile, upsertBrainProfile } from "./brain-profile";
import { listAudios, uploadAudio } from "./custom-audios";
import { getAudioBlob } from "@/lib/custom-audio-db";
import { useSynthStore } from "@/store/useSynthStore";
import { useBrainProfileStore } from "@/store/useBrainProfileStore";
import { useCustomAudioStore } from "@/store/useCustomAudioStore";

const MIGRATED_FLAG = (uid: string) => `cloud-sync-migrated::${uid}`;

const LEGACY_KEYS = {
  synth: "synth-presets",
  brain: "brain-profile",
  audio: "custom-audio-meta",
} as const;

type ZustandEnvelope<T> = { state?: T; version?: number };

function readJson<T>(key: string): T | null {
  if (typeof localStorage === "undefined") return null;
  const raw = localStorage.getItem(key);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

export async function runFirstLoginMigration(user: User): Promise<void> {
  if (typeof window === "undefined") return;
  const flagKey = MIGRATED_FLAG(user.id);
  if (localStorage.getItem(flagKey)) return;

  const userId = user.id;
  let allOk = true;

  // ─── Synth presets ─────────────────────────────────────────
  try {
    const env = readJson<ZustandEnvelope<{ savedPresets?: SynthPreset[] }>>(LEGACY_KEYS.synth);
    const localPresets = env?.state?.savedPresets ?? [];
    if (localPresets.length > 0) {
      const cloud = await listPresets(userId);
      if (cloud.length === 0) {
        await bulkInsertPresets(userId, localPresets);
        await useSynthStore.getState().loadFromCloud(userId);
      }
    }
  } catch (err) {
    console.error("[migrate] synth presets failed:", err);
    allOk = false;
  }

  // ─── Synth programs ────────────────────────────────────────
  try {
    const env = readJson<ZustandEnvelope<{ savedPrograms?: CustomProgram[] }>>(LEGACY_KEYS.synth);
    const localPrograms = env?.state?.savedPrograms ?? [];
    if (localPrograms.length > 0) {
      const cloud = await listPrograms(userId);
      if (cloud.length === 0) {
        await bulkInsertPrograms(userId, localPrograms);
        await useSynthStore.getState().loadFromCloud(userId);
      }
    }
  } catch (err) {
    console.error("[migrate] synth programs failed:", err);
    allOk = false;
  }

  // ─── Brain profile ─────────────────────────────────────────
  try {
    const env = readJson<ZustandEnvelope<{ profile?: BrainProfile | null }>>(LEGACY_KEYS.brain);
    const localProfile = env?.state?.profile;
    if (localProfile) {
      const cloud = await getBrainProfile(userId);
      if (!cloud) {
        await upsertBrainProfile(userId, localProfile);
        await useBrainProfileStore.getState().loadFromCloud(userId);
      }
    }
  } catch (err) {
    console.error("[migrate] brain profile failed:", err);
    allOk = false;
  }

  // ─── Custom audios (metadata + blobs) ──────────────────────
  try {
    const env = readJson<ZustandEnvelope<{ audios?: CustomAudioMeta[] }>>(LEGACY_KEYS.audio);
    const localAudios = env?.state?.audios ?? [];
    if (localAudios.length > 0) {
      const cloud = await listAudios(userId);
      if (cloud.length === 0) {
        for (const meta of localAudios) {
          try {
            const blob = await getAudioBlob(meta.id);
            if (!blob) continue;
            await uploadAudio(userId, meta.id, blob, meta.name, meta.mimeType);
          } catch (err) {
            console.error(`[migrate] audio ${meta.id} upload failed:`, err);
            allOk = false;
          }
        }
        await useCustomAudioStore.getState().loadFromCloud(userId);
        // Optional: clean IndexedDB blobs that were already uploaded.
        // We keep them as cache so playback doesn't need to re-download.
      }
    }
  } catch (err) {
    console.error("[migrate] custom audios failed:", err);
    allOk = false;
  }

  if (!allOk) return;

  // Clear legacy localStorage keys (per-user persist will rebuild with new naming)
  try {
    localStorage.removeItem(LEGACY_KEYS.synth);
    localStorage.removeItem(LEGACY_KEYS.brain);
    localStorage.removeItem(LEGACY_KEYS.audio);
  } catch {
    // noop
  }

  localStorage.setItem(flagKey, new Date().toISOString());
}
