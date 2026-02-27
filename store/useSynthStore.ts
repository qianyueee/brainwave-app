import { create } from "zustand";
import { persist } from "zustand/middleware";
import {
  SynthLayer,
  SynthPreset,
  TremoloConfig,
  VibratoConfig,
  DEFAULT_TREMOLO,
  DEFAULT_VIBRATO,
} from "@/lib/synth-engine";
import type { CustomProgram } from "@/lib/programs";

export type EditorMode = "free" | "harmonic";
export type StereoChannel = "left" | "right";

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

  // Persisted
  savedPresets: SynthPreset[];
  savedPrograms: CustomProgram[];

  // Editing context (not persisted)
  editingPresetId: string | null;
  editingProgramId: string | null;

  // Actions — mode
  setEditorMode: (mode: EditorMode) => void;
  setIsStereo: (v: boolean) => void;
  generateHarmonics: (baseFreq: number) => void;

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
  savePreset: (name: string) => void;
  updatePreset: (id: string) => void;
  deletePreset: (id: string) => void;
  loadPreset: (preset: SynthPreset) => void;
  resetEditor: () => void;

  // Import/Export
  importPresets: (presets: SynthPreset[]) => void;

  // Custom program actions
  saveAsProgram: (name: string, description?: string) => void;
  updateProgram: (id: string, description?: string) => void;
  deleteProgram: (id: string) => void;
  loadProgramForEdit: (program: CustomProgram) => void;
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
      savedPresets: [],
      savedPrograms: [],
      editingPresetId: null,
      editingProgramId: null,

      // --- Mode ---
      setEditorMode: (mode) => {
        const { editorMode, harmonicBaseFreq, isStereo } = get();
        if (mode === editorMode) return;

        if (mode === "free") {
          if (isStereo) {
            set({ editorMode: mode, leftLayers: [createDefaultLayer()], rightLayers: [createDefaultLayer()] });
          } else {
            set({ editorMode: mode, layers: [createDefaultLayer()] });
          }
        } else {
          // harmonic
          const harmonics = createHarmonicLayers(harmonicBaseFreq);
          if (isStereo) {
            set({ editorMode: mode, leftLayers: cloneLayers(harmonics), rightLayers: cloneLayers(harmonics) });
          } else {
            set({ editorMode: mode, layers: harmonics });
          }
        }
      },

      setIsStereo: (v) => {
        const { isStereo, layers, leftLayers } = get();
        if (v === isStereo) return;
        if (v) {
          // mono → stereo: copy layers to both channels
          set({ isStereo: true, leftLayers: cloneLayers(layers), rightLayers: cloneLayers(layers) });
        } else {
          // stereo → mono: take left channel
          set({ isStereo: false, layers: cloneLayers(leftLayers) });
        }
      },

      generateHarmonics: (baseFreq) => {
        const { isStereo } = get();
        const harmonics = createHarmonicLayers(baseFreq);
        if (isStereo) {
          set({ harmonicBaseFreq: baseFreq, leftLayers: cloneLayers(harmonics), rightLayers: cloneLayers(harmonics) });
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

      savePreset: (name) => {
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
        set({ savedPresets: [...savedPresets, preset], editingPresetId: preset.id });
      },

      updatePreset: (id) => {
        const { layers, leftLayers, rightLayers, vibrato, editorMode, isStereo, savedPresets } = get();
        set({
          savedPresets: savedPresets.map((p) =>
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
          ),
        });
      },

      deletePreset: (id) => {
        set((state) => ({ savedPresets: state.savedPresets.filter((p) => p.id !== id) }));
      },

      loadPreset: (preset) => {
        const raw = preset.editorMode ?? "free";
        const isStereo = raw.endsWith("-stereo");
        const editorMode = (isStereo ? raw.replace("-stereo", "") : raw) as EditorMode;
        set({
          editorMode,
          isStereo,
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
          editingPresetId: null,
          editingProgramId: null,
        });
      },

      // --- Import/Export ---
      importPresets: (presets) => {
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
        set((state) => ({ savedPresets: [...state.savedPresets, ...imported] }));
      },

      // --- Custom program actions ---
      saveAsProgram: (name, description) => {
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
        set({ savedPrograms: [...savedPrograms, program], editingProgramId: program.id });
      },

      updateProgram: (id, description) => {
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
        set({
          savedPrograms: savedPrograms.map((p) =>
            p.id === id
              ? {
                  ...p,
                  preset: { ...preset, name: p.name },
                  description: description?.trim() || `カスタム・${layerCount}レイヤー合成`,
                }
              : p
          ),
        });
      },

      deleteProgram: (id) => {
        set((state) => ({ savedPrograms: state.savedPrograms.filter((p) => p.id !== id) }));
      },

      loadProgramForEdit: (program) => {
        get().loadPreset(program.preset);
        set({ editingProgramId: program.id });
      },
    }),
    {
      name: "synth-presets",
      partialize: (state) => ({ savedPresets: state.savedPresets, savedPrograms: state.savedPrograms }),
    }
  )
);
