import { create } from "zustand";
import { persist } from "zustand/middleware";
import {
  SynthLayer,
  SynthPreset,
  TimelineSegment,
  TremoloConfig,
  VibratoConfig,
  DEFAULT_TREMOLO,
  DEFAULT_VIBRATO,
} from "@/lib/synth-engine";
import type { CustomProgram } from "@/lib/programs";
import { createPerUserStorage } from "@/lib/sync/per-user-storage";
import {
  listPresets,
  upsertPreset,
  deletePreset as deletePresetCloud,
  bulkInsertPresets,
} from "@/lib/sync/presets";
import {
  listPrograms,
  upsertProgram,
  deleteProgram as deleteProgramCloud,
} from "@/lib/sync/programs";

export type EditorMode = "free" | "harmonic";
export type StereoChannel = "left" | "right";
export type MonitorChannel = "both" | "left" | "right";

const MAX_LAYERS = 8;
const HARMONIC_COUNT = 9;

function generateId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 10);
}

function createDefaultLayer(): SynthLayer {
  return {
    id: generateId(),
    frequency: 220,
    volume: 0.7,
    tone: "soft",
    tremolo: { ...DEFAULT_TREMOLO },
  };
}

function cloneLayers(layers: SynthLayer[]): SynthLayer[] {
  return layers.map((l) => ({
    ...l,
    id: generateId(),
    tremolo: { ...l.tremolo },
  }));
}

function createHarmonicLayers(baseFreq: number): SynthLayer[] {
  const layers: SynthLayer[] = [];
  for (let n = 1; n <= HARMONIC_COUNT; n++) {
    layers.push({
      id: generateId(),
      frequency: Math.round(baseFreq * n * 100) / 100,
      volume: Math.round(Math.pow(0.8, n - 1) * 100) / 100,
      tone: "soft",
      tremolo: { ...DEFAULT_TREMOLO },
    });
  }
  return layers;
}

// --- Timeline helpers ---
// The editor buffer (layers/leftLayers/rightLayers/vibrato/editorMode/isStereo)
// doubles as the ACTIVE timeline segment's working config. These convert between
// that buffer and a SynthPreset, mirroring savePreset (serialize) and loadPreset
// (hydrate, with fresh layer ids).

type EditorBuffer = {
  layers: SynthLayer[];
  leftLayers: SynthLayer[];
  rightLayers: SynthLayer[];
  vibrato: VibratoConfig;
  editorMode: EditorMode;
  isStereo: boolean;
};

function bufferToPreset(b: EditorBuffer): SynthPreset {
  return {
    id: generateId(),
    name: "",
    layers: b.layers.map((l) => ({ ...l, tremolo: { ...l.tremolo } })),
    leftLayers: b.leftLayers.map((l) => ({ ...l, tremolo: { ...l.tremolo } })),
    rightLayers: b.rightLayers.map((l) => ({ ...l, tremolo: { ...l.tremolo } })),
    vibrato: { ...b.vibrato },
    editorMode: b.isStereo ? `${b.editorMode}-stereo` : b.editorMode,
    createdAt: new Date().toISOString(),
  };
}

function presetToBuffer(preset: SynthPreset): EditorBuffer & { monitorChannel: MonitorChannel } {
  const raw = preset.editorMode ?? "free";
  const isStereo = raw.endsWith("-stereo");
  const editorMode = (isStereo ? raw.replace("-stereo", "") : raw) as EditorMode;
  const reId = (layers?: SynthLayer[]) =>
    (layers ?? [createDefaultLayer()]).map((l) => ({
      ...l,
      id: generateId(),
      tremolo: l.tremolo ? { ...l.tremolo } : { ...DEFAULT_TREMOLO },
    }));
  return {
    editorMode,
    isStereo,
    monitorChannel: "both",
    layers: reId(preset.layers),
    leftLayers: reId(preset.leftLayers),
    rightLayers: reId(preset.rightLayers),
    vibrato: preset.vibrato ? { ...preset.vibrato } : { ...DEFAULT_VIBRATO },
  };
}

function defaultSegmentPreset(): SynthPreset {
  return {
    id: generateId(),
    name: "",
    layers: [createDefaultLayer()],
    leftLayers: [createDefaultLayer()],
    rightLayers: [createDefaultLayer()],
    vibrato: { ...DEFAULT_VIBRATO },
    editorMode: "free",
    createdAt: new Date().toISOString(),
  };
}

function timelineSum(segments: TimelineSegment[]): number {
  return segments.reduce((sum, s) => sum + Math.max(1, s.durationSec), 0);
}

/** Build the program's top-level preset for a timeline (seg0 mirrored + nested timeline). */
function buildTimelinePreset(name: string, segments: TimelineSegment[]): SynthPreset {
  const seg0 = segments[0]?.preset;
  return {
    id: generateId(),
    name,
    layers: seg0?.layers ?? [createDefaultLayer()],
    leftLayers: seg0?.leftLayers,
    rightLayers: seg0?.rightLayers,
    vibrato: seg0?.vibrato ?? { ...DEFAULT_VIBRATO },
    editorMode: seg0?.editorMode ?? "free",
    createdAt: new Date().toISOString(),
    timeline: { segments },
  };
}

interface SynthState {
  // Editor state (not persisted)
  layers: SynthLayer[];           // mono layers (used when !isStereo)
  leftLayers: SynthLayer[];       // stereo left
  rightLayers: SynthLayer[];      // stereo right
  isSynthPlaying: boolean;
  vibrato: VibratoConfig;
  editorMode: EditorMode;
  isStereo: boolean;
  harmonicBaseFreq: number;
  harmonicBaseFreqLeft: number;
  harmonicBaseFreqRight: number;
  monitorChannel: MonitorChannel;

  // Timeline editor state (not persisted; the buffer above = active segment config)
  isTimelineMode: boolean;
  timelineSegments: TimelineSegment[];
  activeSegmentIndex: number;

  // Persisted (per-user cache)
  savedPresets: SynthPreset[];
  savedPrograms: CustomProgram[];
  cloudUserId: string | null;

  // Editing context (not persisted)
  editingPresetId: string | null;
  editingProgramId: string | null;

  // Actions — mode
  setEditorMode: (mode: EditorMode) => void;
  setIsStereo: (v: boolean) => void;
  generateHarmonics: (baseFreq: number, channel?: StereoChannel) => void;
  setMonitorChannel: (c: MonitorChannel) => void;

  // Actions — mono layer ops (used when !isStereo)
  addLayer: () => void;
  removeLayer: (id: string) => void;
  updateLayer: (id: string, patch: Partial<Pick<SynthLayer, "frequency" | "volume" | "tone">>) => void;
  updateLayerTremolo: (id: string, patch: Partial<TremoloConfig>) => void;

  // Actions — stereo layer ops
  addStereoLayer: (channel: StereoChannel) => void;
  removeStereoLayer: (channel: StereoChannel, id: string) => void;
  updateStereoLayer: (channel: StereoChannel, id: string, patch: Partial<Pick<SynthLayer, "frequency" | "volume" | "tone">>) => void;
  updateStereoLayerTremolo: (channel: StereoChannel, id: string, patch: Partial<TremoloConfig>) => void;

  // Actions — shared
  updateVibrato: (patch: Partial<VibratoConfig>) => void;
  setIsSynthPlaying: (v: boolean) => void;
  savePreset: (name: string) => Promise<void>;
  updatePreset: (id: string) => Promise<void>;
  deletePreset: (id: string) => Promise<void>;
  loadPreset: (preset: SynthPreset) => void;
  resetEditor: () => void;

  // Import/Export
  importPresets: (presets: SynthPreset[]) => Promise<void>;

  // Custom program actions
  saveAsProgram: (name: string, description?: string) => Promise<void>;
  updateProgram: (id: string, description?: string) => Promise<void>;
  deleteProgram: (id: string) => Promise<void>;
  loadProgramForEdit: (program: CustomProgram) => void;

  // Timeline editor actions
  setTimelineMode: (v: boolean) => void;
  flushActiveSegment: () => void;
  setActiveSegment: (i: number) => void;
  addSegment: () => void;
  removeSegment: (i: number) => void;
  reorderSegment: (from: number, to: number) => void;
  setSegmentDuration: (i: number, sec: number) => void;
  setSegmentCrossfade: (i: number, sec: number) => void;
  setSegmentName: (i: number, name: string) => void;
  saveAsTimelineProgram: (name: string, description?: string) => Promise<void>;

  // Cloud sync
  loadFromCloud: (userId: string) => Promise<void>;
  clearForLogout: () => void;
}

export const useSynthStore = create<SynthState>()(
  persist(
    (set, get) => ({
      layers: [createDefaultLayer()],
      leftLayers: [createDefaultLayer()],
      rightLayers: [createDefaultLayer()],
      isSynthPlaying: false,
      vibrato: { ...DEFAULT_VIBRATO },
      editorMode: "free" as EditorMode,
      isStereo: false,
      harmonicBaseFreq: 220,
      harmonicBaseFreqLeft: 220,
      harmonicBaseFreqRight: 220,
      monitorChannel: "both" as MonitorChannel,
      isTimelineMode: false,
      timelineSegments: [],
      activeSegmentIndex: 0,
      savedPresets: [],
      savedPrograms: [],
      cloudUserId: null,
      editingPresetId: null,
      editingProgramId: null,

      // --- Mode ---
      setEditorMode: (mode) => {
        const { editorMode, harmonicBaseFreq, harmonicBaseFreqLeft, harmonicBaseFreqRight, isStereo } = get();
        if (mode === editorMode) return;

        if (mode === "free") {
          if (isStereo) {
            set({ editorMode: mode, leftLayers: [createDefaultLayer()], rightLayers: [createDefaultLayer()] });
          } else {
            set({ editorMode: mode, layers: [createDefaultLayer()] });
          }
        } else {
          // harmonic
          if (isStereo) {
            set({
              editorMode: mode,
              leftLayers: createHarmonicLayers(harmonicBaseFreqLeft),
              rightLayers: createHarmonicLayers(harmonicBaseFreqRight),
            });
          } else {
            set({ editorMode: mode, layers: createHarmonicLayers(harmonicBaseFreq) });
          }
        }
      },

      setIsStereo: (v) => {
        const { isStereo, layers, leftLayers, harmonicBaseFreq, harmonicBaseFreqLeft } = get();
        if (v === isStereo) return;
        if (v) {
          // mono → stereo: copy layers to both channels; seed L/R base freq from mono
          set({
            isStereo: true,
            leftLayers: cloneLayers(layers),
            rightLayers: cloneLayers(layers),
            harmonicBaseFreqLeft: harmonicBaseFreq,
            harmonicBaseFreqRight: harmonicBaseFreq,
          });
        } else {
          // stereo → mono: take left channel and its base freq; reset monitor
          set({
            isStereo: false,
            layers: cloneLayers(leftLayers),
            harmonicBaseFreq: harmonicBaseFreqLeft,
            monitorChannel: "both",
          });
        }
      },

      setMonitorChannel: (c) => set({ monitorChannel: c }),

      generateHarmonics: (baseFreq, channel) => {
        const { isStereo } = get();
        const harmonics = createHarmonicLayers(baseFreq);
        if (isStereo && channel === "left") {
          set({ harmonicBaseFreqLeft: baseFreq, leftLayers: harmonics });
        } else if (isStereo && channel === "right") {
          set({ harmonicBaseFreqRight: baseFreq, rightLayers: harmonics });
        } else if (isStereo) {
          // no channel specified in stereo: update both
          set({
            harmonicBaseFreqLeft: baseFreq,
            harmonicBaseFreqRight: baseFreq,
            leftLayers: cloneLayers(harmonics),
            rightLayers: cloneLayers(harmonics),
          });
        } else {
          set({ harmonicBaseFreq: baseFreq, layers: harmonics });
        }
      },

      // --- Mono layer actions ---
      addLayer: () => {
        const { layers } = get();
        if (layers.length >= MAX_LAYERS) return;
        set({ layers: [...layers, createDefaultLayer()] });
      },

      removeLayer: (id) => {
        const { layers } = get();
        if (layers.length <= 1) return;
        set({ layers: layers.filter((l) => l.id !== id) });
      },

      updateLayer: (id, patch) => {
        set((state) => ({
          layers: state.layers.map((l) => (l.id === id ? { ...l, ...patch } : l)),
        }));
      },

      updateLayerTremolo: (id, patch) => {
        set((state) => ({
          layers: state.layers.map((l) =>
            l.id === id ? { ...l, tremolo: { ...l.tremolo, ...patch } } : l
          ),
        }));
      },

      // --- Stereo layer actions ---
      addStereoLayer: (channel) => {
        const key = channel === "left" ? "leftLayers" : "rightLayers";
        const arr = get()[key];
        if (arr.length >= MAX_LAYERS) return;
        set({ [key]: [...arr, createDefaultLayer()] });
      },

      removeStereoLayer: (channel, id) => {
        const key = channel === "left" ? "leftLayers" : "rightLayers";
        const arr = get()[key];
        if (arr.length <= 1) return;
        set({ [key]: arr.filter((l) => l.id !== id) });
      },

      updateStereoLayer: (channel, id, patch) => {
        const key = channel === "left" ? "leftLayers" : "rightLayers";
        set((state) => ({
          [key]: (state[key] as SynthLayer[]).map((l) => (l.id === id ? { ...l, ...patch } : l)),
        }));
      },

      updateStereoLayerTremolo: (channel, id, patch) => {
        const key = channel === "left" ? "leftLayers" : "rightLayers";
        set((state) => ({
          [key]: (state[key] as SynthLayer[]).map((l) =>
            l.id === id ? { ...l, tremolo: { ...l.tremolo, ...patch } } : l
          ),
        }));
      },

      // --- Shared ---
      updateVibrato: (patch) => {
        set((state) => ({ vibrato: { ...state.vibrato, ...patch } }));
      },

      setIsSynthPlaying: (v) => set({ isSynthPlaying: v }),

      savePreset: async (name) => {
        const { layers, leftLayers, rightLayers, vibrato, editorMode, isStereo, savedPresets } = get();
        const preset: SynthPreset = {
          id: generateId(),
          name,
          layers: layers.map((l) => ({ ...l, tremolo: { ...l.tremolo } })),
          leftLayers: leftLayers.map((l) => ({ ...l, tremolo: { ...l.tremolo } })),
          rightLayers: rightLayers.map((l) => ({ ...l, tremolo: { ...l.tremolo } })),
          vibrato: { ...vibrato },
          editorMode: isStereo ? `${editorMode}-stereo` : editorMode,
          createdAt: new Date().toISOString(),
        };
        const prevPresets = savedPresets;
        set({ savedPresets: [...savedPresets, preset], editingPresetId: preset.id });

        const uid = get().cloudUserId;
        if (!uid) return;
        try {
          await upsertPreset(uid, preset);
        } catch (err) {
          console.error("[synth] savePreset failed:", err);
          set({ savedPresets: prevPresets, editingPresetId: null });
          throw err;
        }
      },

      updatePreset: async (id) => {
        const { layers, leftLayers, rightLayers, vibrato, editorMode, isStereo, savedPresets } = get();
        const prevPresets = savedPresets;
        const next = savedPresets.map((p) =>
          p.id === id
            ? {
                ...p,
                layers: layers.map((l) => ({ ...l, tremolo: { ...l.tremolo } })),
                leftLayers: leftLayers.map((l) => ({ ...l, tremolo: { ...l.tremolo } })),
                rightLayers: rightLayers.map((l) => ({ ...l, tremolo: { ...l.tremolo } })),
                vibrato: { ...vibrato },
                editorMode: isStereo ? `${editorMode}-stereo` : editorMode,
              }
            : p
        );
        set({ savedPresets: next });

        const uid = get().cloudUserId;
        if (!uid) return;
        const updated = next.find((p) => p.id === id);
        if (!updated) return;
        try {
          await upsertPreset(uid, updated);
        } catch (err) {
          console.error("[synth] updatePreset failed:", err);
          set({ savedPresets: prevPresets });
          throw err;
        }
      },

      deletePreset: async (id) => {
        const prevPresets = get().savedPresets;
        set({ savedPresets: prevPresets.filter((p) => p.id !== id) });

        const uid = get().cloudUserId;
        if (!uid) return;
        try {
          await deletePresetCloud(uid, id);
        } catch (err) {
          console.error("[synth] deletePreset failed:", err);
          set({ savedPresets: prevPresets });
          throw err;
        }
      },

      loadPreset: (preset) => {
        const raw = preset.editorMode ?? "free";
        const isStereo = raw.endsWith("-stereo");
        const editorMode = (isStereo ? raw.replace("-stereo", "") : raw) as EditorMode;
        set({
          editorMode,
          isStereo,
          monitorChannel: "both",
          editingPresetId: preset.id,
          layers: (preset.layers ?? [createDefaultLayer()]).map((l) => ({
            ...l, id: generateId(), tremolo: l.tremolo ? { ...l.tremolo } : { ...DEFAULT_TREMOLO },
          })),
          leftLayers: (preset.leftLayers ?? [createDefaultLayer()]).map((l) => ({
            ...l, id: generateId(), tremolo: l.tremolo ? { ...l.tremolo } : { ...DEFAULT_TREMOLO },
          })),
          rightLayers: (preset.rightLayers ?? [createDefaultLayer()]).map((l) => ({
            ...l, id: generateId(), tremolo: l.tremolo ? { ...l.tremolo } : { ...DEFAULT_TREMOLO },
          })),
          vibrato: preset.vibrato ? { ...preset.vibrato } : { ...DEFAULT_VIBRATO },
        });
      },

      resetEditor: () => {
        set({
          layers: [createDefaultLayer()],
          leftLayers: [createDefaultLayer()],
          rightLayers: [createDefaultLayer()],
          isSynthPlaying: false,
          vibrato: { ...DEFAULT_VIBRATO },
          editorMode: "free" as EditorMode,
          isStereo: false,
          harmonicBaseFreq: 220,
          harmonicBaseFreqLeft: 220,
          harmonicBaseFreqRight: 220,
          monitorChannel: "both",
          isTimelineMode: false,
          timelineSegments: [],
          activeSegmentIndex: 0,
          editingPresetId: null,
          editingProgramId: null,
        });
      },

      // --- Import/Export ---
      importPresets: async (presets) => {
        const valid = presets.filter(
          (p) =>
            p &&
            typeof p.name === "string" &&
            Array.isArray(p.layers) &&
            p.vibrato &&
            typeof p.vibrato === "object"
        );
        if (valid.length === 0) return;
        const reIdLayers = (layers: SynthLayer[]) =>
          layers.map((l) => ({ ...l, id: generateId(), tremolo: { ...l.tremolo } }));
        const imported: SynthPreset[] = valid.map((p) => ({
          ...p,
          id: generateId(),
          layers: reIdLayers(p.layers),
          leftLayers: p.leftLayers ? reIdLayers(p.leftLayers) : undefined,
          rightLayers: p.rightLayers ? reIdLayers(p.rightLayers) : undefined,
          vibrato: { ...p.vibrato },
          createdAt: p.createdAt || new Date().toISOString(),
        }));
        const prevPresets = get().savedPresets;
        set({ savedPresets: [...prevPresets, ...imported] });

        const uid = get().cloudUserId;
        if (!uid) return;
        try {
          await bulkInsertPresets(uid, imported);
        } catch (err) {
          console.error("[synth] importPresets failed:", err);
          set({ savedPresets: prevPresets });
          throw err;
        }
      },

      // --- Custom program actions ---
      saveAsProgram: async (name, description) => {
        const { layers, leftLayers, rightLayers, vibrato, editorMode, isStereo, savedPrograms } = get();
        const preset: SynthPreset = {
          id: generateId(),
          name,
          layers: layers.map((l) => ({ ...l, tremolo: { ...l.tremolo } })),
          leftLayers: leftLayers.map((l) => ({ ...l, tremolo: { ...l.tremolo } })),
          rightLayers: rightLayers.map((l) => ({ ...l, tremolo: { ...l.tremolo } })),
          vibrato: { ...vibrato },
          editorMode: isStereo ? `${editorMode}-stereo` : editorMode,
          createdAt: new Date().toISOString(),
        };
        const layerCount = isStereo ? leftLayers.length + rightLayers.length : layers.length;
        const program: CustomProgram = {
          id: "custom-" + generateId(),
          name,
          description: description?.trim() || `カスタム・${layerCount}レイヤー合成`,
          icon: "\uD83C\uDFB9",
          defaultDuration: 15 * 60,
          preset,
          createdAt: new Date().toISOString(),
        };
        const prevPrograms = savedPrograms;
        set({ savedPrograms: [...savedPrograms, program], editingProgramId: program.id });

        const uid = get().cloudUserId;
        if (!uid) return;
        try {
          await upsertProgram(uid, program);
        } catch (err) {
          console.error("[synth] saveAsProgram failed:", err);
          set({ savedPrograms: prevPrograms, editingProgramId: null });
          throw err;
        }
      },

      updateProgram: async (id, description) => {
        if (get().isTimelineMode) {
          get().flushActiveSegment();
          const { timelineSegments, savedPrograms } = get();
          const segments = timelineSegments.map((seg) => ({ ...seg, preset: { ...seg.preset } }));
          const total = timelineSum(segments);
          const prevPrograms = savedPrograms;
          const next = savedPrograms.map((p) =>
            p.id === id
              ? {
                  ...p,
                  defaultDuration: total,
                  description: description?.trim() || `タイムライン・${segments.length}区間`,
                  preset: buildTimelinePreset(p.name, segments),
                }
              : p
          );
          set({ savedPrograms: next });
          const uid = get().cloudUserId;
          if (!uid) return;
          const updated = next.find((p) => p.id === id);
          if (!updated) return;
          try {
            await upsertProgram(uid, updated);
          } catch (err) {
            console.error("[synth] updateProgram (timeline) failed:", err);
            set({ savedPrograms: prevPrograms });
            throw err;
          }
          return;
        }
        const { layers, leftLayers, rightLayers, vibrato, editorMode, isStereo, savedPrograms } = get();
        const preset: SynthPreset = {
          id: generateId(),
          name: "",
          layers: layers.map((l) => ({ ...l, tremolo: { ...l.tremolo } })),
          leftLayers: leftLayers.map((l) => ({ ...l, tremolo: { ...l.tremolo } })),
          rightLayers: rightLayers.map((l) => ({ ...l, tremolo: { ...l.tremolo } })),
          vibrato: { ...vibrato },
          editorMode: isStereo ? `${editorMode}-stereo` : editorMode,
          createdAt: new Date().toISOString(),
        };
        const layerCount = isStereo ? leftLayers.length + rightLayers.length : layers.length;
        const prevPrograms = savedPrograms;
        const next = savedPrograms.map((p) =>
          p.id === id
            ? {
                ...p,
                preset: { ...preset, name: p.name },
                description: description?.trim() || `カスタム・${layerCount}レイヤー合成`,
              }
            : p
        );
        set({ savedPrograms: next });

        const uid = get().cloudUserId;
        if (!uid) return;
        const updated = next.find((p) => p.id === id);
        if (!updated) return;
        try {
          await upsertProgram(uid, updated);
        } catch (err) {
          console.error("[synth] updateProgram failed:", err);
          set({ savedPrograms: prevPrograms });
          throw err;
        }
      },

      deleteProgram: async (id) => {
        const prevPrograms = get().savedPrograms;
        set({ savedPrograms: prevPrograms.filter((p) => p.id !== id) });

        const uid = get().cloudUserId;
        if (!uid) return;
        try {
          await deleteProgramCloud(uid, id);
        } catch (err) {
          console.error("[synth] deleteProgram failed:", err);
          set({ savedPrograms: prevPrograms });
          throw err;
        }
      },

      loadProgramForEdit: (program) => {
        const segs = program.preset.timeline?.segments;
        if (Array.isArray(segs) && segs.length > 0) {
          // Timeline program: clone segments with fresh ids, hydrate buffer from segment 0.
          const cloned: TimelineSegment[] = segs.map((s) => ({
            ...s,
            id: generateId(),
            preset: { ...s.preset },
          }));
          get().loadPreset(cloned[0].preset);
          set({
            isTimelineMode: true,
            timelineSegments: cloned,
            activeSegmentIndex: 0,
            editingProgramId: program.id,
            editingPresetId: null,
          });
        } else {
          get().loadPreset(program.preset);
          set({
            isTimelineMode: false,
            timelineSegments: [],
            activeSegmentIndex: 0,
            editingProgramId: program.id,
          });
        }
      },

      // --- Timeline editor actions ---
      setTimelineMode: (v) => {
        if (!v) {
          set({ isTimelineMode: false });
          return;
        }
        const { timelineSegments } = get();
        if (timelineSegments.length === 0) {
          // Seed segment 0 from the current editor buffer.
          const seg: TimelineSegment = {
            id: generateId(),
            name: "セグメント 1",
            durationSec: 60,
            crossfadeSec: 0,
            preset: bufferToPreset(get()),
          };
          set({ isTimelineMode: true, timelineSegments: [seg], activeSegmentIndex: 0 });
        } else {
          set({ isTimelineMode: true });
        }
      },

      flushActiveSegment: () => {
        const { timelineSegments, activeSegmentIndex } = get();
        if (activeSegmentIndex < 0 || activeSegmentIndex >= timelineSegments.length) return;
        const preset = bufferToPreset(get());
        set({
          timelineSegments: timelineSegments.map((s, idx) =>
            idx === activeSegmentIndex ? { ...s, preset } : s
          ),
        });
      },

      setActiveSegment: (i) => {
        const { timelineSegments, activeSegmentIndex } = get();
        if (i < 0 || i >= timelineSegments.length) return;
        // Flush current buffer into the active segment, then hydrate from the target.
        const flushedPreset = bufferToPreset(get());
        const flushed = timelineSegments.map((s, idx) =>
          idx === activeSegmentIndex ? { ...s, preset: flushedPreset } : s
        );
        set({
          timelineSegments: flushed,
          activeSegmentIndex: i,
          ...presetToBuffer(flushed[i].preset),
        });
      },

      addSegment: () => {
        const { timelineSegments, activeSegmentIndex } = get();
        const flushedPreset = bufferToPreset(get());
        const flushed =
          activeSegmentIndex >= 0 && activeSegmentIndex < timelineSegments.length
            ? timelineSegments.map((s, idx) =>
                idx === activeSegmentIndex ? { ...s, preset: flushedPreset } : s
              )
            : timelineSegments;
        const newSeg: TimelineSegment = {
          id: generateId(),
          name: `セグメント ${flushed.length + 1}`,
          durationSec: 60,
          crossfadeSec: 2,
          preset: defaultSegmentPreset(),
        };
        const next = [...flushed, newSeg];
        set({
          timelineSegments: next,
          activeSegmentIndex: next.length - 1,
          ...presetToBuffer(newSeg.preset),
        });
      },

      removeSegment: (i) => {
        const { timelineSegments, activeSegmentIndex } = get();
        if (timelineSegments.length <= 1 || i < 0 || i >= timelineSegments.length) return;
        if (i === activeSegmentIndex) {
          // Active segment goes away: drop it, then hydrate from the new active.
          const next = timelineSegments.filter((_, idx) => idx !== i);
          const newActive = Math.min(activeSegmentIndex, next.length - 1);
          set({
            timelineSegments: next,
            activeSegmentIndex: newActive,
            ...presetToBuffer(next[newActive].preset),
          });
        } else {
          // Removing another segment: flush current buffer first, keep editing it.
          const flushedPreset = bufferToPreset(get());
          const flushed = timelineSegments.map((s, idx) =>
            idx === activeSegmentIndex ? { ...s, preset: flushedPreset } : s
          );
          const next = flushed.filter((_, idx) => idx !== i);
          const newActive = i < activeSegmentIndex ? activeSegmentIndex - 1 : activeSegmentIndex;
          set({ timelineSegments: next, activeSegmentIndex: newActive });
        }
      },

      reorderSegment: (from, to) => {
        const { timelineSegments, activeSegmentIndex } = get();
        if (
          from === to ||
          from < 0 ||
          to < 0 ||
          from >= timelineSegments.length ||
          to >= timelineSegments.length
        )
          return;
        const flushedPreset = bufferToPreset(get());
        const flushed = timelineSegments.map((s, idx) =>
          idx === activeSegmentIndex ? { ...s, preset: flushedPreset } : s
        );
        const activeId = flushed[activeSegmentIndex]?.id;
        const arr = [...flushed];
        const [moved] = arr.splice(from, 1);
        arr.splice(to, 0, moved);
        const newActive = arr.findIndex((s) => s.id === activeId);
        set({ timelineSegments: arr, activeSegmentIndex: newActive >= 0 ? newActive : 0 });
      },

      setSegmentDuration: (i, sec) => {
        const v = Math.max(1, Math.round(sec));
        set((state) => ({
          timelineSegments: state.timelineSegments.map((s, idx) =>
            idx === i ? { ...s, durationSec: v } : s
          ),
        }));
      },

      setSegmentCrossfade: (i, sec) => {
        set((state) => {
          const seg = state.timelineSegments[i];
          if (!seg) return {};
          const thisDur = Math.max(1, seg.durationSec);
          const prevDur =
            i > 0 ? Math.max(1, state.timelineSegments[i - 1].durationSec) : thisDur;
          const v = Math.max(0, Math.min(Math.round(sec * 10) / 10, thisDur, prevDur));
          return {
            timelineSegments: state.timelineSegments.map((s, idx) =>
              idx === i ? { ...s, crossfadeSec: v } : s
            ),
          };
        });
      },

      setSegmentName: (i, name) => {
        set((state) => ({
          timelineSegments: state.timelineSegments.map((s, idx) =>
            idx === i ? { ...s, name } : s
          ),
        }));
      },

      saveAsTimelineProgram: async (name, description) => {
        get().flushActiveSegment();
        const { timelineSegments, savedPrograms } = get();
        const segments = timelineSegments.map((seg) => ({ ...seg, preset: { ...seg.preset } }));
        const total = timelineSum(segments);
        const program: CustomProgram = {
          id: "custom-" + generateId(),
          name,
          description: description?.trim() || `タイムライン・${segments.length}区間`,
          icon: "⏱️", // ⏱️
          defaultDuration: total,
          preset: buildTimelinePreset(name, segments),
          createdAt: new Date().toISOString(),
        };
        const prevPrograms = savedPrograms;
        set({ savedPrograms: [...savedPrograms, program], editingProgramId: program.id });

        const uid = get().cloudUserId;
        if (!uid) return;
        try {
          await upsertProgram(uid, program);
        } catch (err) {
          console.error("[synth] saveAsTimelineProgram failed:", err);
          set({ savedPrograms: prevPrograms, editingProgramId: null });
          throw err;
        }
      },

      // --- Cloud sync ---
      loadFromCloud: async (userId) => {
        try {
          const [presets, programs] = await Promise.all([
            listPresets(userId),
            listPrograms(userId),
          ]);
          set({ savedPresets: presets, savedPrograms: programs, cloudUserId: userId });
        } catch (err) {
          console.error("[synth] load failed:", err);
          set({ cloudUserId: userId });
        }
      },

      clearForLogout: () => {
        set({
          savedPresets: [],
          savedPrograms: [],
          cloudUserId: null,
          editingPresetId: null,
          editingProgramId: null,
        });
      },
    }),
    {
      name: "synth-presets",
      storage: createPerUserStorage(),
      partialize: (state) => ({ savedPresets: state.savedPresets, savedPrograms: state.savedPrograms }),
    }
  )
);
