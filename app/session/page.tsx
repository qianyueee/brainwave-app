"use client";

import { useState, useEffect, useMemo } from "react";
import PublishedProgramCard from "@/components/PublishedProgramCard";
import CatalogSection from "@/components/CatalogSection";
import ScrollWindow from "@/components/ScrollWindow";
import { useAdminStore } from "@/store/useAdminStore";
import { usePublishedProgramsStore } from "@/store/usePublishedProgramsStore";
import { useAuthStore } from "@/store/useAuthStore";
import WaterMandalaHero from "@/components/WaterMandalaHero";
import { ArrowRight, User } from "lucide-react";
import { useT } from "@/lib/i18n";
import PageColumn from "@/components/PageColumn";
import PageHeader from "@/components/PageHeader";
import type { CustomProgram } from "@/lib/programs";

/** hydration まで渡す空の一覧（毎回 [] を作ると一覧側の memo が毎回組み直しになる）。 */
const NO_PROGRAMS: readonly CustomProgram[] = [];

/**
 * Sync Session — 聴くための画面。上段は今日の星座周波数の水マンダラと、
 * グループに配信されたプログラム。下段は Sync Sound の一覧——マイフォルダ
 * （カードの ♡ で入れたお気に入り）とデフォルト / Target / Energy / Astro の
 * タブ、全カテゴリ横断の検索（CatalogSection）。
 *
 * 一覧を上段の2列グリッドの片側に入れず、幅いっぱいの段として下に置いてある：
 * 節目が170件あるので、半分の幅に押し込むとカードが縦に延々と続く筒になる。
 *
 * 上段の右（配信プログラム）は小さな窓（ScrollWindow、沈んだ面）に並べ、
 * はみ出す分は窓の中だけでスクロールさせる——件数が増えても下の一覧が押し下げ
 * られない。
 *
 * デスクトップでは窓を、左の水マンダラと同じ大きさの枠（見出し＋窓）に収める。
 * 枠を `absolute inset-0` にして行の高さの計算から外すのがミソ：行の高さは左の
 * カードだけで決まり、右の枠はそれに合わせて伸び縮みする。
 *
 * スマホは縦に積むので、窓の高さを画面の半分弱で止める（max-h）。カード3枚ほどが
 * 見え、窓の外にもページを送るための面が十分に残る——入れ子のスクロールは、
 * 指で触れた場所でページと一覧のどちらが動くかが変わるので、窓を大きくしすぎない。
 * 窓の端まで送ったあとの次のひと送りはページへ渡す（overscroll-behavior は既定の
 * まま。contain にすると窓の上で指が止まって見える）。スマホでは外側の枠を
 * `contents` で消し、見出しと窓だけを親の列に並べる：枠と窓を重ねると 360〜390px
 * 幅でカードの文字の欄が 1/4 狭くなり、配信プログラムの機械的な長い名前
 * （「Subliminal-41.7Hz α」など）が切れる。
 *
 * 音源をつくる・公開する管理者向けの操作（カスタムプログラム、合成器の新規
 * 作成、公開／取り下げ）はここには置かない——管理パネルの「音源」タブに集約
 * した。再生自体は /player、脳波測定は Sync Brain。
 */
export default function SessionPage() {
  const isAdmin = useAdminStore((s) => s.isAdmin);
  const userGroups = useAdminStore((s) => s.userGroups);
  const publishedPrograms = usePublishedProgramsStore((s) => s.programs);
  const groupProgramIds = usePublishedProgramsStore((s) => s.groupProgramIds);
  const fetchPrograms = usePublishedProgramsStore((s) => s.fetchPrograms);
  const fetchGroupProgramIds = usePublishedProgramsStore((s) => s.fetchGroupProgramIds);
  const user = useAuthStore((s) => s.user);
  const authLoading = useAuthStore((s) => s.loading);
  const openAuthModal = useAuthStore((s) => s.openAuthModal);
  const isLoggedIn = !!user;
  const t = useT();

  // Guard against hydration mismatch from persist middleware
  const [hydrated, setHydrated] = useState(false);
  useEffect(() => {
    setHydrated(true);
  }, []);

  useEffect(() => {
    fetchPrograms();
  }, [fetchPrograms]);

  // Fetch group→program assignments when user groups change
  useEffect(() => {
    if (userGroups.length > 0) {
      fetchGroupProgramIds(userGroups.map((g) => g.id));
    }
  }, [userGroups, fetchGroupProgramIds]);

  // Filter published programs: admins see all, regular users see only programs assigned to their groups
  const visiblePrograms = useMemo(() => {
    if (isAdmin) return publishedPrograms;
    if (!isLoggedIn || groupProgramIds.length === 0) return [];
    return publishedPrograms.filter((p) => groupProgramIds.includes(p.id));
  }, [isAdmin, isLoggedIn, publishedPrograms, groupProgramIds]);

  return (
    <div style={{ animation: "fade-in 0.3s ease-out" }}>
      <PageHeader
        title="Sync Session"
        subtitle={t("プログラム選択・再生", "Choose and play programs")}
      />

      <PageColumn>
      {/* Mobile: single column. Desktop: mandala | shared programs, same height
          (the grid row is sized by the mandala alone — see the file comment). */}
      <div className="flex flex-col gap-6 md:grid md:grid-cols-2 md:gap-6">
      <div className="flex flex-col gap-6">
      {/* Today's frequency as a water mandala — the first thing on entry */}
      <WaterMandalaHero />
      </div>

      <div className="flex flex-col gap-3 md:relative">
      {/* Published Programs (filtered by group) */}
      {hydrated && visiblePrograms.length > 0 && (
        <section
          aria-label={t("配信プログラム", "Shared programs")}
          className="contents md:absolute md:inset-0 md:flex md:flex-col md:gap-4 md:p-5 md:rounded-3xl md:bg-surface md:border md:border-surface-border neu-raised"
        >
          {/* 件数も出す：窓に入りきらないとき、いくつあるのかが先に分かる。
              英語は数字だけ（「Shared programs 8 programs」と重なるので、
              目録のタブ「Target 42」と同じ書き方にする）。 */}
          <p className="text-sm text-text-secondary">
            {t("配信プログラム", "Shared programs")}
            <span className="ml-2 text-xs text-text-muted">
              {t(`${visiblePrograms.length}件`, `${visiblePrograms.length}`)}
            </span>
          </p>
          {/* 左の水マンダラの窓と同じ「沈んだ面」。この中だけがスクロールする
              （scroll-thin＝細いスクロールバー）。スマホは max-h で止め（外側の
              枠は contents で消えるので、見出しと窓が直接ページに並ぶ）、
              デスクトップは枠の残りいっぱいに伸ばす。カードの呼吸は止める
              ——膨らんだ分が窓で切れるので。 */}
          <ScrollWindow
            className="md:flex-1 md:min-h-0 md:flex md:flex-col"
            scrollClassName="max-h-[min(19rem,45svh)] p-2 md:max-h-none md:flex-1 md:min-h-0 md:p-3"
          >
            {visiblePrograms.map((program) => (
              <PublishedProgramCard key={program.id} program={program} breathe={false} />
            ))}
          </ScrollWindow>
        </section>
      )}

      {/* Login CTA for unauthenticated users.
          未ログインのこの枠は、ログインすると「配信プログラム」の一覧に
          置き換わる場所。だから誘い文句ではなく、そこに何が入るのかを
          先に書いておく（合成器づくりは管理者の作業なので、一般利用者に
          約束するのは「所属グループに配信されたプログラムが聴ける」こと）。 */}
      {!isLoggedIn && !authLoading && (
        <div className="flex flex-col gap-3">
          <p className="text-sm text-text-secondary">
            {t(
              "ログインして配信されたプログラムを再生",
              "Log in to play programs shared with your group"
            )}
          </p>
          <button
            onClick={() => openAuthModal("login")}
            className="w-full min-h-14 px-5 rounded-3xl bg-navy flex items-center justify-center gap-3 neu-raised neu-press active:scale-[0.98] transition-transform"
          >
            <span className="flex-1 flex items-center justify-center gap-2 text-base font-bold text-primary">
              <User size={20} strokeWidth={1.5} />
              {t("ログイン", "Log in")}
            </span>
            <span className="shrink-0 w-10 h-10 rounded-full bg-primary text-on-primary flex items-center justify-center">
              <ArrowRight size={20} strokeWidth={2} />
            </span>
          </button>
        </div>
      )}
      </div>
      </div>

      {/* Sync Sound の一覧。幅いっぱいの段（上の理由はファイル冒頭）。先頭の
          タブがマイフォルダ（♡ で入れたもの）——配信プログラムも入れられるので、
          いま見えている配信の一覧を渡して引き当てさせる。 */}
      <div className="flex flex-col gap-3">
        <p className="text-sm text-text-secondary">
          {t("Sync Sound｜脳波同期サウンド", "Sync Sound · Brainwave sync sounds")}
        </p>
        <CatalogSection sharedPrograms={hydrated ? visiblePrograms : NO_PROGRAMS} />
      </div>
      </PageColumn>
    </div>
  );
}
