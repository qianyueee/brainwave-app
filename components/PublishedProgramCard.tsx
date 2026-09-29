"use client";

import type { CustomProgram } from "@/lib/programs";
import { useAdminStore } from "@/store/useAdminStore";
import { usePublishedProgramsStore } from "@/store/usePublishedProgramsStore";
import { usePlayProgram } from "@/components/usePlayProgram";
import { useT } from "@/lib/i18n";
import { Waves, X } from "lucide-react";

interface PublishedProgramCardProps {
  program: CustomProgram;
  /**
   * 取り下げボタンを出すか。管理パネルの「音源」タブだけ true——Sync Session
   * は管理者にとっても再生面なので、配信の操作はここには出さない。
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

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={handleClick}
      onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") handleClick(); }}
      className={`w-full bg-surface border border-surface-border rounded-3xl p-4 flex items-center gap-4 text-left neu-raised neu-press transition-transform cursor-pointer${breathe ? " breathe" : ""}`}
    >
      <div className="w-14 h-14 rounded-2xl bg-navy neu-inset flex items-center justify-center shrink-0">
        <Waves size={26} className="text-success" strokeWidth={1.5} />
      </div>
      {/* 配信ぶんは名前が「Subliminal-41.7…」のように機械的なことが多いので、
          説明文は残す（3節目と違い、名前だけでは中身が読めない）。「公開済み」
          は名前の隣から足元の行へ——長い名前を badge が押し潰さなくなる。 */}
      <div className="flex-1 min-w-0">
        <p className="text-base font-bold text-text-primary truncate">{program.name}</p>
        <p className="text-sm text-text-secondary mt-0.5">
          {program.description}
        </p>
        <div className="mt-1 flex items-center gap-2 flex-wrap">
          <p className="text-xs text-text-muted">
            {t(`${displayMinutes}分`, `${displayMinutes} min`)}
          </p>
          <span className="text-xs font-bold text-success bg-success/15 px-1.5 py-0.5 rounded-full whitespace-nowrap">
            {t("公開済み", "Published")}
          </span>
        </div>
      </div>
      {manage && isAdmin && (
        <button
          onClick={handleUnpublish}
          disabled={loading}
          className="w-12 h-12 rounded-xl bg-navy neu-raised-sm flex items-center justify-center text-danger active:scale-95 shrink-0 disabled:opacity-50"
          aria-label={t("取り下げ", "Unpublish")}
        >
          <X size={16} strokeWidth={2} />
        </button>
      )}
    </div>
  );
}
