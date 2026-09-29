"use client";

import { useState, useEffect, useMemo } from "react";
import PublishedProgramCard from "@/components/PublishedProgramCard";
import CatalogSection from "@/components/CatalogSection";
import { useAdminStore } from "@/store/useAdminStore";
import { usePublishedProgramsStore } from "@/store/usePublishedProgramsStore";
import { useAuthStore } from "@/store/useAuthStore";
import WaterMandalaHero from "@/components/WaterMandalaHero";
import { ArrowRight, User } from "lucide-react";
import { useT } from "@/lib/i18n";
import PageColumn from "@/components/PageColumn";
import PageHeader from "@/components/PageHeader";

/**
 * Sync Session — 聴くための画面。上段は今日の星座周波数の水マンダラと、
 * グループに配信されたプログラム。下段は Sync Sound の一覧——デフォルト /
 * Target / Energy / Astro の4タブと、全カテゴリ横断の検索（CatalogSection）。
 *
 * 一覧を上段の2列グリッドの片側に入れず、幅いっぱいの段として下に置いてある：
 * 節目が170件あるので、半分の幅に押し込むとカードが縦に延々と続く筒になる。
 *
 * 上段の右（配信プログラム）はデスクトップでは左の水マンダラと同じ大きさの枠に
 * 収め、はみ出す分は枠の中でスクロールさせる——件数が増えても左右の釣り合いが
 * 崩れず、下の一覧が押し下げられない。枠を `absolute inset-0` にして行の高さの
 * 計算から外すのがミソ：行の高さは左のカードだけで決まり、右の枠はそれに合わせて
 * 伸び縮みする。スマホは縦に積むだけなので、枠も付けず・枠の中で止めずに従来
 * どおり全部並べる：枠と沈んだ面を重ねると 390px 幅でカードの文字の欄が 1/4 狭く
 * なり、入れ子のスクロールは指で触れた場所でページと一覧のどちらが動くか変わる。
 * そのため枠の2要素はスマホでは `contents`（箱を持たず、中身だけが親の列に並ぶ）。
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
          <p className="text-sm text-text-secondary">{t("配信プログラム", "Shared programs")}</p>
          {/* 左の水マンダラの窓と同じ「沈んだ面」。デスクトップではこの中だけが
              スクロールする（scroll-thin＝細いスクロールバー）。カードの呼吸は
              止める——膨らんだ分が枠で切れるので。 */}
          <div className="contents md:flex md:flex-col md:gap-3 md:flex-1 md:min-h-0 md:overflow-y-auto md:p-3 md:rounded-2xl md:bg-navy neu-inset scroll-thin">
            {visiblePrograms.map((program) => (
              <PublishedProgramCard key={program.id} program={program} breathe={false} />
            ))}
          </div>
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

      {/* Sync Sound の一覧。幅いっぱいの段（上の理由はファイル冒頭）。 */}
      <div className="flex flex-col gap-3">
        <p className="text-sm text-text-secondary">
          {t("Sync Sound｜脳波同期サウンド", "Sync Sound · Brainwave sync sounds")}
        </p>
        <CatalogSection />
      </div>
      </PageColumn>
    </div>
  );
}
