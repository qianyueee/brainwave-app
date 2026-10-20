"use client";

import { useState } from "react";
import { Heart } from "lucide-react";
import { useT } from "@/lib/i18n";
import { toggleFavorite, useIsFavorite } from "@/store/useFavoritesStore";

interface FavoriteButtonProps {
  programId: string;
  /**
   * `icon`＝カードの右端に置く ♡ だけのボタン（48×48）。`labeled`＝♡ に文字を
   * 添えたボタン（プレーヤー。聴いてみて気に入ったときに入れる場所なので、何が
   * 起きるのかを言葉で書く）。
   */
  variant?: "icon" | "labeled";
  /**
   * 読み上げ用のプログラム名（icon のとき）。カードが何十枚も並ぶので、
   * 「マイフォルダに入れる」だけではどのカードのボタンか分からない。
   */
  name?: string;
  className?: string;
}

/**
 * マイフォルダ（Sync Session のお気に入り）に入れる・外すボタン。押すたびに
 * 切り替わる（aria-pressed）。入れた瞬間だけ ♡ が1回はずむ。
 *
 * カードの中ではカードを開くボタンと**並べて**置く（ProgramCard・
 * PublishedProgramCard）。押せるカードの中に入れ子にすると、♡ のクリックや
 * Enter がカードにも届いてプレーヤーが開いてしまう。
 */
export default function FavoriteButton({
  programId,
  variant = "icon",
  name,
  className = "",
}: FavoriteButtonProps) {
  const on = useIsFavorite(programId);
  const t = useT();
  // 入れた回数。♡ の key にして付け直すと、はずむアニメが最初から1回だけ流れる
  // （外したとき・最初に描いたときは流さない）。
  const [pops, setPops] = useState(0);

  // 指を乗せたとき（title）は次に起きることを書く。読み上げの名前は状態で変えず、
  // 入っているかどうかは aria-pressed が伝える（名前まで変えると「外す、オン」の
  // ように二重に聞こえる）。
  const action = on
    ? t("マイフォルダから外す", "Remove from My Folder")
    : t("マイフォルダに入れる", "Add to My Folder");
  const label = name
    ? t(`${name}をマイフォルダに入れる`, `Add ${name} to My Folder`)
    : t("マイフォルダに入れる", "Add to My Folder");

  const onClick = () => {
    if (!on) setPops((n) => n + 1);
    toggleFavorite(programId);
  };

  const heart = (
    <Heart
      key={pops}
      size={22}
      strokeWidth={on ? 2 : 1.75}
      fill={on ? "currentColor" : "none"}
      aria-hidden
      className={`shrink-0 ${on ? "text-primary" : "text-text-muted"}${on && pops > 0 ? " heart-pop" : ""}`}
    />
  );

  if (variant === "labeled") {
    return (
      <button
        type="button"
        onClick={onClick}
        aria-pressed={on}
        className={`min-h-12 px-5 rounded-2xl bg-navy neu-raised-sm neu-press flex items-center justify-center gap-2 text-base font-bold transition-transform ${
          on ? "text-primary" : "text-text-primary"
        } ${className}`}
      >
        {heart}
        {/* 入っている間は「入っています」と状態を書く（押すと外れる）。 */}
        {on
          ? t("マイフォルダに入っています", "In My Folder")
          : t("マイフォルダに入れる", "Add to My Folder")}
      </button>
    );
  }

  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={on}
      aria-label={label}
      title={action}
      className={`w-12 h-12 shrink-0 rounded-xl flex items-center justify-center active:scale-90 transition-transform ${className}`}
    >
      {heart}
    </button>
  );
}
