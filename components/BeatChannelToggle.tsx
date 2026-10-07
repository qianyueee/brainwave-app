"use client";

import { Headphones, Speaker } from "lucide-react";
import { useAppStore } from "@/store/useAppStore";
import { useAudio } from "@/components/AudioProvider";
import type { BeatChannelMode } from "@/lib/beat-graph";
import { useT } from "@/lib/i18n";

/**
 * 誘導ビートの聴き方：ステレオ（バイノーラルビート）⇄ モノラル（モノラルビート）。
 *
 * ステレオは左右の耳に少し違う高さの音を流し、頭の中でうなりを作る——ヘッドホンで
 * ないと効かない。モノラルは2つの音を混ぜて両耳に同じ音を流すので、音そのものに
 * うなりが入り、スピーカーでも効く（lib/beat-graph.ts）。
 *
 * 再生中に切り替えてもその場で移る（オシレーターは作り直さない）。選んだ方は
 * 端末の設定として残る（useAppStore の persist）——ヘッドホンかスピーカーかは
 * その端末の聴き方なので。
 */
export default function BeatChannelToggle() {
  const mode = useAppStore((s) => s.beatChannelMode);
  const setMode = useAppStore((s) => s.setBeatChannelMode);
  const { getSession } = useAudio();
  const t = useT();

  const choose = (next: BeatChannelMode) => {
    setMode(next);
    getSession()?.setChannelMode(next);
  };

  const options: { value: BeatChannelMode; label: string; hint: string; Icon: typeof Headphones }[] = [
    {
      value: "stereo",
      label: t("ステレオ", "Stereo"),
      hint: t("ヘッドホン", "Headphones"),
      Icon: Headphones,
    },
    {
      value: "mono",
      label: t("モノラル", "Mono"),
      hint: t("スピーカーでも", "Speakers too"),
      Icon: Speaker,
    },
  ];

  return (
    <div className="flex flex-col gap-2">
      <span id="beat-channel-label" className="text-sm text-text-secondary">
        {t("聴き方", "How to listen")}
      </span>
      <div role="group" aria-labelledby="beat-channel-label" className="flex gap-2">
        {options.map(({ value, label, hint, Icon }) => {
          const selected = mode === value;
          return (
            <button
              key={value}
              type="button"
              onClick={() => choose(value)}
              aria-pressed={selected}
              className={`flex-1 min-h-12 py-2 rounded-xl flex items-center justify-center gap-2 transition-all ${
                selected
                  ? "bg-navy-light text-accent neu-inset"
                  : "bg-navy text-text-secondary neu-raised-sm neu-press"
              }`}
            >
              <Icon size={20} strokeWidth={1.75} aria-hidden />
              <span className="flex flex-col items-start leading-tight">
                <span className={`text-sm ${selected ? "font-bold" : "font-medium"}`}>{label}</span>
                <span className="text-xs">{hint}</span>
              </span>
            </button>
          );
        })}
      </div>
      <p className="text-xs text-text-muted">
        {mode === "stereo"
          ? t(
              "左右の耳に少し違う高さの音を流し、頭の中でうなり（バイノーラルビート）を作ります。ヘッドホン・イヤホンでお聴きください。",
              "Each ear hears a slightly different tone, and your brain creates the beat (binaural beats). Please use headphones or earphones."
            )
          : t(
              "2つの音を混ぜて、音そのものにうなり（モノラルビート）を作ります。スピーカーでも効果があります。",
              "The two tones are mixed so the beat is in the sound itself (monaural beats). It works through speakers too."
            )}
      </p>
    </div>
  );
}
