"use client";

import { useRouter } from "next/navigation";
import ZodiacSyncCard from "@/components/ZodiacSyncCard";
import BrainConditionCard from "@/components/BrainConditionCard";
import SyncTreeCard from "@/components/SyncTreeCard";
import { User, Settings } from "lucide-react";
import { useAuthStore } from "@/store/useAuthStore";
import PageColumn from "@/components/PageColumn";
import PageHeader from "@/components/PageHeader";

/**
 * ホーム。上から Sync Tree のシーンカード → 脳コンディション（測定3値＋毎日の
 * 自己評価）→ 星空カード（今日のおすすめ＋開始）の3ブロック。
 *
 * Tree を先頭に置くのは、開いた瞬間に目に入るものを「数字」ではなく「風景」に
 * するため——毎日つづけた結果が育った樹として先に迎え、細かい数値はその下で
 * 読む。数字の詰まったカードが最初だと、まだ測定していない日に開いたとき
 * 空欄の「—」から始まってしまう。
 *
 * 脳特性チャート（レーダー）はここから外して Sync Report に一本化した——
 * 測定値・自己評価・星座・育樹と、ホームが受け持つものが増えたぶん、詳細な
 * 分析figureはレポート側でまとめて見る役割分担にしている。
 */
export default function HomePage() {
  const router = useRouter();
  const user = useAuthStore((s) => s.user);
  const authLoading = useAuthStore((s) => s.loading);
  const openAuthModal = useAuthStore((s) => s.openAuthModal);
  const isLoggedIn = !!user;

  return (
    <div style={{ animation: "fade-in 0.3s ease-out" }}>
      {/* ブランド名は見出しの上の小さな行（eyebrow）として、他のページと同じ
          スティッキーヘッダーに同居させる。ログインと設定も同じ帯に入れて
          あるのは、下までスクロールしたときに設定へ入れなくなるのを避けるため
          ——常に上に残っているので、戻らなくても押せる。 */}
      <PageHeader
        title="Home"
        subtitle="今日の星空・宇宙周波数で即座に調律"
        eyebrow={
          /* ブランド名は本文と同じ 16px（`text-base`）。ヘッダーの中でいちばん
             小さい注記だった頃は、下の「Home」に埋もれて商標に見えなかった
             ——ページ見出し 20px を超えない範囲でいちばん大きく取り、左レールの
             ブランド表記（同じ `text-base`）とも揃えている。 */
          <p className="text-base font-bold text-text-secondary leading-tight">
            NeuroSync
            {/* 登録商標表示 ®。sup は preflight 既定で 75%＋上付き、太字だけ
                解除する。本文16px下限の対象外——情報を担わない組版記号。 */}
            <sup className="font-normal">®</sup>
          </p>
        }
        actions={
          !authLoading && (
            <>
              {isLoggedIn ? (
                <div className="w-10 h-10 rounded-full bg-primary/20 flex items-center justify-center text-primary text-sm font-bold">
                  {user.email?.charAt(0).toUpperCase() ?? "U"}
                </div>
              ) : (
                <button
                  onClick={() => openAuthModal("login")}
                  className="flex items-center gap-2 h-12 px-4 rounded-2xl bg-navy text-text-secondary text-sm font-medium whitespace-nowrap neu-raised-sm neu-press active:scale-95"
                >
                  <User size={18} strokeWidth={1.5} />
                  ログイン
                </button>
              )}
              {/* Settings entry — the corner gear (the admin gear that used to
                  sit here moved into the Settings page). */}
              <button
                onClick={() => router.push("/settings")}
                className="w-12 h-12 flex items-center justify-center rounded-xl text-text-muted active:scale-95"
                title="設定"
              >
                <Settings size={20} strokeWidth={1.5} />
              </button>
            </>
          )
        }
      />

      <PageColumn>
      {/* モバイルは1カラムで Sync Tree → 脳コンディション → 星空。
          デスクトップは 左（Tree＋コンディション）｜右（星空）の2カラムで、
          DOM 順のまま行列を明示指定している（order だけではグリッドが行方向に
          流れてしまい、意図しない位置に回り込む）。 */}
      <div className="flex flex-col gap-6 md:grid md:grid-cols-2 md:gap-6 md:items-start">
        {/* 樹だけの風景カード（タップで /tree の16段階ギャラリーへ） */}
        <div className="md:col-start-1 md:row-start-1">
          <SyncTreeCard />
        </div>

        {/* 測定3値（自動算出）＋ 毎日の自己評価スライダー */}
        <div className="md:col-start-1 md:row-start-2">
          <BrainConditionCard />
        </div>

        {/* デスクトップは2行ぶち抜き＋ self-stretch。星空カードを縦に伸ばすと
            行1が高くなり、左列の Tree と コンディション の間に穴が空くため——
            ぶち抜きにすると左列は自然な間隔のまま、右は「Tree＋gap＋
            コンディション」の高さをそのまま受け取って伸びる（決め打ちの高さを
            持たずに両列の下端が揃う）。 */}
        <div className="md:col-start-2 md:row-start-1 md:row-span-2 md:self-stretch">
          <ZodiacSyncCard />
        </div>
      </div>
      </PageColumn>
    </div>
  );
}
