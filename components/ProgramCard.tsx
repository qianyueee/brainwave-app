"use client";

import { ProgramConfig, ProgramCategory } from "@/lib/programs";
import { getAdjustedProgram } from "@/lib/brain-profile";
import { hasMusicBed } from "@/lib/zodiac-audio";
import { useBrainProfileStore } from "@/store/useBrainProfileStore";
import { usePlayProgram } from "@/components/usePlayProgram";
import { Waves, Zap, Moon, Target, Sparkles, Stars, ChevronRight } from "lucide-react";

const PROGRAM_ICONS: Record<string, typeof Waves> = {
  "reset-deep": Waves,
  "clarity-focus": Zap,
  "night-recovery": Moon,
};

/** 節目ごとの絵文字も無いときの受け皿。 */
const CATEGORY_ICONS: Record<ProgramCategory, typeof Waves> = {
  default: Waves,
  target: Target,
  energy: Sparkles,
  astro: Stars,
};

interface ProgramCardProps {
  program: ProgramConfig;
  /**
   * 呼吸のアニメーション。既定 true（3枚並ぶ従来の使い方）。カタログの一覧は
   * 一度に数十枚出るので false にする——`breathe-stagger` の遅延は6枚目までしか
   * 定義が無く、それ以上は全部が同じ拍で膨らんで画面がざわつく（描画の負荷も
   * 枚数ぶん増える）。
   */
  breathe?: boolean;
}

export default function ProgramCard({ program, breathe = true }: ProgramCardProps) {
  const playProgram = usePlayProgram();
  const profile = useBrainProfileStore((s) => s.profile);

  const adjusted = getAdjustedProgram(program.id, profile?.indicators ?? null);
  const isPersonalized = adjusted && adjusted.defaultDuration !== program.defaultDuration;
  // 音楽ベッド未納品の印。カタログ節目だけに出す（内蔵3つと星座は曲があり、
  // 曲を持たない合成器の節目にこの説明は要らない）。
  const beatOnly = !!program.category && !hasMusicBed(program.id);

  const handleClick = () => playProgram(program);

  const displayMinutes = Math.round((adjusted?.defaultDuration ?? program.defaultDuration) / 60);

  // アイコンは4段の受け皿：内蔵3つは従来どおりの lucide、それ以外は節目自身の
  // 絵文字（星座グリフ ♈ など、118件ぶんが既に入っている）、無ければカテゴリの
  // lucide、最後に波。
  const LucideIcon = PROGRAM_ICONS[program.id];
  const emoji = !LucideIcon && program.icon ? program.icon : null;
  const FallbackIcon = CATEGORY_ICONS[program.category ?? "default"] ?? Waves;

  return (
    <button
      onClick={handleClick}
      className={`w-full bg-surface border border-surface-border rounded-3xl p-4 flex items-center gap-4 text-left neu-raised neu-press transition-transform${
        breathe ? " breathe" : ""
      }`}
    >
      <div className="w-14 h-14 rounded-2xl bg-navy neu-inset flex items-center justify-center shrink-0">
        {LucideIcon ? (
          <LucideIcon size={26} className="text-primary" strokeWidth={1.5} />
        ) : emoji ? (
          <span className="text-2xl leading-none" aria-hidden>
            {emoji}
          </span>
        ) : (
          <FallbackIcon size={26} className="text-primary" strokeWidth={1.5} />
        )}
      </div>
      {/* 名前と「周波数・長さ」の2行だけ。説明文は落とした——3節目とも名前で
          何のための音かが分かり、選ぶときに要るのは長さと周波数のほう。1枚が
          薄くなったぶん、3節目＋配信ぶんが折り返さず一望できる（説明は
          プレイヤー側に残る）。 */}
      <div className="flex-1 min-w-0">
        <p className="text-base font-bold text-text-primary truncate">{program.name}</p>
        <div className="mt-0.5 flex items-center gap-2 flex-wrap">
          <p className="text-xs text-text-muted">
            {adjusted?.carrierFreq ?? program.carrierFreq}Hz・{displayMinutes}分
          </p>
          {isPersonalized && (
            <span className="text-xs font-bold text-primary bg-primary/15 px-1.5 py-0.5 rounded-full whitespace-nowrap">
              パーソナライズ済み
            </span>
          )}
          {/* 「準備中」とは書かない——誘導ビートは鳴るので、この節目は完成品と
              して使える。足りないのは伴奏だけ、というのを言葉どおりに書く。 */}
          {beatOnly && (
            <span className="text-xs font-bold text-text-muted bg-navy-light px-1.5 py-0.5 rounded-full whitespace-nowrap">
              ビートのみ
            </span>
          )}
        </div>
      </div>
      <ChevronRight size={20} className="text-text-muted shrink-0" />
    </button>
  );
}
