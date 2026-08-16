"use client";

import { useRouter } from "next/navigation";
import ZodiacSyncCard from "@/components/ZodiacSyncCard";
import BrainConditionCard from "@/components/BrainConditionCard";
import SyncTreeCard from "@/components/SyncTreeCard";
import { User, Settings } from "lucide-react";
import { useAuthStore } from "@/store/useAuthStore";

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
    <div className="flex flex-col gap-6 pt-6" style={{ animation: "fade-in 0.3s ease-out" }}>
      {/* ヘッダー＝ブランド行＋ページ見出しをひと塊に。両方とも「見出し」なので、
          あいだは中身どうしの間隔（gap-2）で詰め、カード列と分ける gap-6 は
          この塊の外側にだけ効かせる。以前は2つが別ブロックで、見出し同士まで
          カードと同じ24pxで離れていた。 */}
      <div className="flex flex-col gap-2">
        <div className="flex items-center justify-between gap-3">
          {/* 読み仮名（ニューロシンク）は外した——ロゴの行はブランド名だけに
              して、次に来る「Home」の見出しと役割をはっきり分ける。名前が
              短くなったぶん、ログインボタンと並べても折り返さない。 */}
          <h1 className="min-w-0 text-xl md:text-2xl font-bold text-text-primary">
            NeuroSync
            {/* 登録商標表示 ®。sup は preflight 既定で 75%＋上付き、太字だけ
                解除する。本文16px下限の対象外——情報を担わない組版記号。 */}
            <sup className="font-normal">®</sup>
          </h1>
          <div className="flex items-center gap-2 shrink-0">
          {!authLoading && (
            isLoggedIn ? (
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
            )
          )}
          {/* Settings entry — the corner gear (the admin gear that used to sit
              here moved into the Settings page). */}
          <button
            onClick={() => router.push("/settings")}
            className="w-12 h-12 flex items-center justify-center rounded-xl text-text-muted active:scale-95"
            title="設定"
          >
            <Settings size={20} strokeWidth={1.5} />
          </button>
          </div>
        </div>

        {/* ページ見出し。他のページ（Sync History / Sync Report …）と同じ
            「英名＋日本語リード」ブロックを Home にも置いて、ブランド名の行と
            「今どの画面にいるか」を分ける。ブランドが h1 なのでこちらは h2。 */}
        <div>
          <h2 className="text-2xl font-bold text-text-primary leading-tight">Home</h2>
          <p className="text-sm text-text-secondary mt-0.5">
            今日の星空・宇宙周波数で即座に調律
          </p>
        </div>
      </div>

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
    </div>
  );
}
