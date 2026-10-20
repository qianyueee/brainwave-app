"use client";

import { ProgramConfig, ProgramCategory, programName } from "@/lib/programs";
import { getAdjustedProgram } from "@/lib/brain-profile";
import { hasMusicBed } from "@/lib/zodiac-audio";
import { useLocale, useT } from "@/lib/i18n";
import { useBrainProfileStore } from "@/store/useBrainProfileStore";
import { usePlayProgram } from "@/components/usePlayProgram";
import FavoriteButton from "@/components/FavoriteButton";
import { Waves, Zap, Moon, Target, Sparkles, Stars } from "lucide-react";

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
  const t = useT();
  const locale = useLocale();

  const adjusted = getAdjustedProgram(program.id, profile?.indicators ?? null);
  const isPersonalized = adjusted && adjusted.defaultDuration !== program.defaultDuration;
  // 音楽ベッドの無い節目の印。いまは全件に曲があるので出ないが、節目を足して
  // 曲が届く前（lib/catalog/music.ts に載る前）はこれが付く。カタログ節目だけに
  // 出す（曲を持たない合成器の節目にこの説明は要らない）。
  const beatOnly = !!program.category && !hasMusicBed(program.id);

  const handleClick = () => playProgram(program);

  const displayMinutes = Math.round((adjusted?.defaultDuration ?? program.defaultDuration) / 60);
  const carrier = adjusted?.carrierFreq ?? program.carrierFreq;

  // アイコンは4段の受け皿：内蔵3つは従来どおりの lucide、それ以外は節目自身の
  // 絵文字（星座グリフ ♈ など、118件ぶんが既に入っている）、無ければカテゴリの
  // lucide、最後に波。
  const LucideIcon = PROGRAM_ICONS[program.id];
  const emoji = !LucideIcon && program.icon ? program.icon : null;
  const FallbackIcon = CATEGORY_ICONS[program.category ?? "default"] ?? Waves;

  const name = programName(program, locale);

  // 一覧は数十枚続くので1枚を詰めてある：余白 12px・アイコン 44px・角丸 16px
  // （以前は 16px・56px・24px で 1 枚 90px → いまは約 66px）。文字は詰めない
  // ——名前は本文の 16px のまま、押せる高さも 48px を大きく超えている。
  //
  // カードの中のボタンは2つ：左の大部分が「開く」（プレーヤーへ）、右端の ♡ が
  // マイフォルダに入れる・外す。ボタンの中にボタンは置けないので、カードは枠
  // （div）にして2つを並べる。右端は以前の「›」の場所——♡ の押せる幅 48px を
  // 取るぶん、右の余白を 4px に詰めて名前の欄を以前とほぼ同じ幅に保つ（360px の
  // 画面で約 12 字）。
  return (
    <div
      className={`w-full bg-surface border border-surface-border rounded-2xl flex items-center neu-raised neu-press-card transition-transform${
        breathe ? " breathe" : ""
      }`}
    >
      <button
        type="button"
        onClick={handleClick}
        className="neu-press-main flex-1 min-w-0 self-stretch rounded-2xl pl-3 py-2.5 flex items-center gap-3 text-left"
      >
        <div className="w-11 h-11 rounded-xl bg-navy neu-inset flex items-center justify-center shrink-0">
          {LucideIcon ? (
            <LucideIcon size={22} className="text-primary" strokeWidth={1.5} />
          ) : emoji ? (
            <span className="text-xl leading-none" aria-hidden>
              {emoji}
            </span>
          ) : (
            <FallbackIcon size={22} className="text-primary" strokeWidth={1.5} />
          )}
        </div>
        {/* 名前と「周波数・長さ」の2行だけ。説明文は落とした——3節目とも名前で
            何のための音かが分かり、選ぶときに要るのは長さと周波数のほう。1枚が
            薄くなったぶん、3節目＋配信ぶんが折り返さず一望できる（説明は
            プレイヤー側に残る）。 */}
        <div className="flex-1 min-w-0">
          <p className="text-base font-bold text-text-primary truncate">
            {name}
          </p>
          <div className="flex items-center gap-2 flex-wrap">
            <p className="text-xs text-text-muted">
              {t(`${carrier}Hz・${displayMinutes}分`, `${carrier}Hz · ${displayMinutes} min`)}
            </p>
            {isPersonalized && (
              <span className="text-xs font-bold text-primary bg-primary/15 px-1.5 py-0.5 rounded-full whitespace-nowrap">
                {t("パーソナライズ済み", "Personalized")}
              </span>
            )}
            {/* 「準備中」とは書かない——誘導ビートは鳴るので、この節目は完成品と
                して使える。足りないのは伴奏だけ、というのを言葉どおりに書く。 */}
            {beatOnly && (
              <span className="text-xs font-bold text-text-muted bg-navy-light px-1.5 py-0.5 rounded-full whitespace-nowrap">
                {t("ビートのみ", "Beats only")}
              </span>
            )}
          </div>
        </div>
      </button>
      <FavoriteButton programId={program.id} name={name} className="mx-1" />
    </div>
  );
}
