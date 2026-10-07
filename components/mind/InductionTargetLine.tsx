"use client";

import { Waves } from "lucide-react";
import { useAppStore } from "@/store/useAppStore";
import { useMindStore } from "@/store/useMindStore";
import { getProgramById, programName } from "@/lib/programs";
import { inductionTargetOf } from "@/lib/mind/session-target";
import { DEFAULT_TARGET_HZ, TARGET_HZ_MAX, TARGET_HZ_MIN, formatTargetHz } from "@/lib/mind/resonance";
import { useLocale, useT } from "@/lib/i18n";

/**
 * いまの誘導周波数（Rate の共鳴率をどの Hz で見るか）の表示。手で入れる欄は無い
 * ——Sync Session で流しているセッションの誘導周波数がそのまま基準になり、何も
 * 流していなければ既定の 40Hz（lib/mind/session-target.ts）。
 *
 * 測定に記録されるのは「測定中にいちばん長く流れていた」周波数なので、測定を
 * 始めてからセッションを再生しても、途中で替えても、その測定の大半の音で判定される。
 */
export default function InductionTargetLine() {
  const t = useT();
  const locale = useLocale();
  const isPlaying = useAppStore((s) => s.isPlaying);
  const isPaused = useAppStore((s) => s.isPaused);
  const playingProgramId = useAppStore((s) => s.playingProgramId);
  const isRecording = useMindStore((s) => s.isRecording);

  const target = inductionTargetOf({ isPlaying, isPaused, playingProgramId });
  const defaultHz = formatTargetHz(DEFAULT_TARGET_HZ);

  let detail: string;
  if (target.source === "session") {
    const program = getProgramById(target.programId);
    const name = program ? programName(program, locale) : "";
    detail = t(
      `再生中のセッション「${name}」の誘導周波数です。Rate の共鳴率をこの周波数で判定します。`,
      `The target frequency of “${name}”, which is playing now. Rate is scored by resonance at this frequency.`
    );
  } else if (target.source === "unmeasurable") {
    detail =
      target.programHz == null
        ? t(
            `合成した音には決まった誘導周波数が無いので、既定の ${defaultHz}Hz で判定します。`,
            `Custom sounds have no set target frequency, so the default ${defaultHz} Hz is used.`
          )
        : target.programHz <= 0
          ? t(
              `再生中のセッションにはうなりが無いので、既定の ${defaultHz}Hz で判定します。`,
              `The playing session has no beat, so the default ${defaultHz} Hz is used.`
            )
          : t(
              `再生中のセッションの誘導周波数（${target.programHz}Hz）は脳波計で読める範囲（${TARGET_HZ_MIN}〜${TARGET_HZ_MAX}Hz）の外なので、既定の ${defaultHz}Hz で判定します。`,
              `The playing session's frequency (${target.programHz} Hz) is outside what the headset can read (${TARGET_HZ_MIN}–${TARGET_HZ_MAX} Hz), so the default ${defaultHz} Hz is used.`
            );
  } else if (target.paused) {
    detail = t(
      `セッションが一時停止中なので、既定の ${defaultHz}Hz で判定します。`,
      `The session is paused, so the default ${defaultHz} Hz is used.`
    );
  } else {
    detail = t(
      `セッションを再生していないので、既定の ${defaultHz}Hz で判定します。再生しながら測ると、そのセッションの誘導周波数で判定します。`,
      `No session is playing, so the default ${defaultHz} Hz is used. Measure while a session plays to use its frequency.`
    );
  }

  return (
    <div className="flex flex-col gap-1" aria-live="polite">
      <div className="flex items-center gap-2">
        <Waves size={20} strokeWidth={1.75} className="text-primary shrink-0" aria-hidden />
        <span className="text-sm text-text-secondary">{t("誘導周波数", "Target frequency")}</span>
        <span className="text-base font-bold text-text-primary tabular-nums">
          {formatTargetHz(target.hz)} Hz
        </span>
        {target.source !== "session" && (
          <span className="text-xs text-text-muted">{t("（既定）", "(default)")}</span>
        )}
      </div>
      <p className="text-xs text-text-muted">{detail}</p>
      {isRecording && (
        <p className="text-xs text-text-muted">
          {t(
            "測定中にいちばん長く流れていた周波数が、この測定に記録されます。",
            "The frequency that plays longest during the measurement is recorded with it."
          )}
        </p>
      )}
    </div>
  );
}
