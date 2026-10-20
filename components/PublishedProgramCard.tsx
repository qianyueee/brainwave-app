"use client";

import type { CustomProgram } from "@/lib/programs";
import { useAdminStore } from "@/store/useAdminStore";
import { usePublishedProgramsStore } from "@/store/usePublishedProgramsStore";
import { usePlayProgram } from "@/components/usePlayProgram";
import { useT } from "@/lib/i18n";
import FavoriteButton from "@/components/FavoriteButton";
import { Waves, X } from "lucide-react";

interface PublishedProgramCardProps {
  program: CustomProgram;
  /**
   * 取り下げボタンを出すか。管理パネルの「音源」タブだけ true——Sync Session
   * は管理者にとっても再生面なので、配信の操作はここには出さない。true のときは
   * マイフォルダの ♡ を出さない（管理の一覧なので）。
   */
  manage?: boolean;
  /**
   * 呼吸アニメ（`breathe`、最大 104.5% の拡大縮小）。Sync Session の配信一覧は
   * スクロールする枠の中に並ぶので false——膨らんだ分が枠で切れる。
   */
  breathe?: boolean;
}

export default function PublishedProgramCard({
  program,
  manage = false,
  breathe = true,
}: PublishedProgramCardProps) {
  const playProgram = usePlayProgram();
  const isAdmin = useAdminStore((s) => s.isAdmin);
  const unpublishProgram = usePublishedProgramsStore((s) => s.unpublishProgram);
  const loading = usePublishedProgramsStore((s) => s.loading);
  const t = useT();

  const handleClick = () => playProgram(program);

  const handleUnpublish = async (e: React.MouseEvent) => {
    e.stopPropagation();
    await unpublishProgram(program.id);
  };

  const displayMinutes = Math.round(program.defaultDuration / 60);

  // 右端のボタン：管理パネルでは取り下げ（管理者だけ）、それ以外はマイフォルダの ♡。
  const trailing = manage ? (
    isAdmin ? (
      <button
        type="button"
        onClick={handleUnpublish}
        disabled={loading}
        className="w-12 h-12 mx-1 rounded-xl bg-navy neu-raised-sm flex items-center justify-center text-danger active:scale-95 shrink-0 disabled:opacity-50"
        aria-label={t("取り下げ", "Unpublish")}
      >
        <X size={16} strokeWidth={2} />
      </button>
    ) : null
  ) : (
    <FavoriteButton programId={program.id} name={program.name} className="mx-1" />
  );

  // カタログのカード（ProgramCard）と同じ詰めた寸法：余白 12px・アイコン 44px・
  // 角丸 16px。Sync Session では小さな窓の中でスクロールして並ぶので、1枚が
  // 低いほど窓に多く入る。
  //
  // カードの中のボタンは ProgramCard と同じく2つ：左の大部分が「開く」、右端が
  // マイフォルダの ♡（管理パネルでは取り下げ）。以前はカード全体を role="button"
  // の div にして取り下げのボタンを入れ子にしていたが、それだと入れ子のボタンで
  // 押した Enter がカードにも届いてプレーヤーまで開く。2つを並べればそれが起きない。
  return (
    <div
      className={`w-full bg-surface border border-surface-border rounded-2xl flex items-center neu-raised neu-press-card transition-transform${breathe ? " breathe" : ""}`}
    >
      <button
        type="button"
        onClick={handleClick}
        className={`neu-press-main flex-1 min-w-0 self-stretch rounded-2xl pl-3 py-2.5 flex items-center gap-3 text-left${
          trailing ? "" : " pr-3"
        }`}
      >
        <div className="w-11 h-11 rounded-xl bg-navy neu-inset flex items-center justify-center shrink-0">
          <Waves size={22} className="text-success" strokeWidth={1.5} />
        </div>
        {/* 配信ぶんは名前が「Subliminal-41.7…」のように機械的なことが多いので、
            説明文は残す（3節目と違い、名前だけでは中身が読めない）。ただし2行で
            切る——全文は再生画面に出る。長さは名前の行の右端へ寄せて行を1つ減らし、
            「公開済み」の札は外した：並ぶ場所の見出しが「配信プログラム」「配信中の
            プログラム」なので、どの1枚にも同じことを書き足すだけだった。 */}
        <div className="flex-1 min-w-0">
          <div className="flex items-baseline gap-2">
            <p className="min-w-0 flex-1 text-base font-bold text-text-primary truncate">
              {program.name}
            </p>
            <span className="shrink-0 text-xs text-text-muted">
              {t(`${displayMinutes}分`, `${displayMinutes} min`)}
            </span>
          </div>
          {program.description && (
            <p className="text-sm text-text-secondary line-clamp-2">{program.description}</p>
          )}
        </div>
      </button>
      {trailing}
    </div>
  );
}
