"use client";

import { useRouter } from "next/navigation";
import ZodiacSyncCard from "@/components/ZodiacSyncCard";
import BrainConditionCard from "@/components/BrainConditionCard";
import SyncTreeCard from "@/components/SyncTreeCard";
import { User, Settings } from "lucide-react";
import { useAuthStore } from "@/store/useAuthStore";

/**
 * ホーム。上から 脳コンディション（測定3値＋毎日の自己評価）→ 星空カード
 * （今日のおすすめ＋開始）→ Sync Tree の3ブロック。
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
      {/* Header */}
      <div className="flex flex-col gap-1">
        <div className="flex items-start justify-between gap-3">
          {/* Beside the header buttons a phone leaves limited width for the title.
              At a uniform 24px the name needs 289px, so it wrapped on every phone.
              The katakana is a reading gloss and takes the deeper cut, keeping the
              brand itself at the 16px floor; nowrap makes it break as a unit when
              the login button squeezes the line. The subtitle sits below the row
              at full width. Everything goes full size once there is room. */}
          <h1 className="min-w-0 text-base md:text-2xl font-bold text-text-primary">
            NeuroSync
            <span className="text-xs md:text-2xl whitespace-nowrap">（ニューロシンク）</span>
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
        <p className="text-xs md:text-sm text-text-secondary">
          〜 音波×光波×脳波シンクロ誘導 ＆ 脳コンディション管理 〜
        </p>
      </div>

      {/* ページ見出し。他のページ（Sync History / Sync Report …）と同じ
          「英名＋日本語リード」ブロックを Home にも置いて、ブランド名の行と
          「今どの画面にいるか」を分ける。ブランドが h1 なのでこちらは h2。 */}
      <div>
        <h2 className="text-2xl font-bold text-text-primary">Home</h2>
        <p className="text-sm text-text-secondary mt-1">
          ホーム｜今日の星空・宇宙周波数で即座に調律
        </p>
      </div>

      {/* モバイルは1カラムで 脳コンディション → 星空 → Sync Tree。デスクトップ
          は 左（コンディション＋Tree）｜右（星空）の2カラム。
          DOM 順はモバイルの並びのままにして、デスクトップ側だけ行列を明示指定
          している（order だけではグリッドが行方向に流れてしまい、Tree が右上に
          回り込む）。 */}
      <div className="flex flex-col gap-6 md:grid md:grid-cols-2 md:gap-6 md:items-start">
        {/* 測定3値（自動算出）＋ 毎日の自己評価スライダー */}
        <div className="md:col-start-1 md:row-start-1">
          <BrainConditionCard />
        </div>

        {/* デスクトップは2行ぶち抜き＋ self-stretch。星空カードを縦に伸ばすと
            行1が高くなり、左列の コンディション と Tree の間に穴が空くため——
            ぶち抜きにすると左列は自然な間隔のまま、右は「コンディション＋gap＋
            Tree」の高さをそのまま受け取って伸びる（決め打ちの高さを持たずに
            両列の下端が揃う）。 */}
        <div className="md:col-start-2 md:row-start-1 md:row-span-2 md:self-stretch">
          <ZodiacSyncCard />
        </div>

        <div className="md:col-start-1 md:row-start-2">
          <SyncTreeCard />
        </div>
      </div>
    </div>
  );
}
