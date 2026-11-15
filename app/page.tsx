"use client";

import { useRouter } from "next/navigation";
import ZodiacSyncCard from "@/components/ZodiacSyncCard";
import BrainConditionCard from "@/components/BrainConditionCard";
import SyncTreeCard from "@/components/SyncTreeCard";
import SyncPartnerCard from "@/components/SyncPartnerCard";
import { User, Settings } from "lucide-react";
import { useAuthStore } from "@/store/useAuthStore";
import { useAdminStore } from "@/store/useAdminStore";
import { useRefreshAccountViewsOnMount } from "@/lib/sync/account-views";
import { useT } from "@/lib/i18n";
import PageColumn from "@/components/PageColumn";
import PageHeader from "@/components/PageHeader";
import AccountSaveBanner from "@/components/AccountSaveBanner";

/**
 * ホーム。スマホは上から 星空カード（今日のおすすめ＋開始）→ Sync Tree の状態バー →
 * 脳コンディション（測定3値＋毎日の自己評価）の3ブロック。デスクトップは
 * 左列＝Tree＋コンディション、右列＝星空。
 *
 * 管理者には Sync Tree の下に Sync Partner（話し相手、components/SyncPartnerCard）も出す。
 * そのときデスクトップは 左列＝Tree＋Partner、右列＝星空、その下に コンディションを
 * 幅いっぱいで。
 *
 * 星空カードはページの見出し「今日の星空・宇宙周波数で即座に調律」そのもので、
 * スマホでは開いた最初の画面に開始ボタンまで入るよう先頭に置く（2026-11 Zane の
 * 依頼。以前は Tree と コンディション の下に沈んでいた）。
 *
 * Tree は木の絵を出さないカード（上半分＝いまの段階と、今日の水やり・リスニングが
 * 済んだか／下半分＝リスニング記録：N日連続・N週連続と今日・今週の分）で、星空の
 * すぐ下——毎日のおせわと聴く習慣が続いているかは少し送れば読める。木そのものは
 * /tree で大きく見る。測定値の詰まったカードが先だと、まだ測定していない日に
 * 開いたとき空欄の「—」から始まってしまうので、コンディションは Tree の後のまま。
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
  // Sync Partner（話し相手）はまず管理者にだけ出す——AI の返事の口調と回数・費用を
  // 確かめてから全員に開く。出さない間は従来の並びのまま。
  const showPartner = useAdminStore((s) => s.isAdmin);
  const t = useT();
  // 脳コンディションカードはデスクトップ測定アプリで測った記録も読む。
  useRefreshAccountViewsOnMount();

  return (
    <div style={{ animation: "fade-in 0.3s ease-out" }}>
      {/* ブランド名は見出しの上の小さな行（eyebrow）として、他のページと同じ
          スティッキーヘッダーに同居させる。ログインと設定も同じ帯に入れて
          あるのは、下までスクロールしたときに設定へ入れなくなるのを避けるため
          ——常に上に残っているので、戻らなくても押せる。 */}
      <PageHeader
        title="Home"
        subtitle={t(
          "今日の星空・宇宙周波数で即座に調律",
          "Tune in with today's stars and cosmic frequencies"
        )}
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
                  {t("ログイン", "Log in")}
                </button>
              )}
              {/* Settings entry — the corner gear (the admin gear that used to
                  sit here moved into the Settings page). */}
              <button
                onClick={() => router.push("/settings")}
                className="w-12 h-12 flex items-center justify-center rounded-xl text-text-muted active:scale-95"
                title={t("設定", "Settings")}
              >
                <Settings size={20} strokeWidth={1.5} />
              </button>
            </>
          )
        }
      />

      <PageColumn>
      {/* ログインした端末に、アカウントへまだ保存していない記録があれば尋ねる（無ければ何も出ない）。 */}
      <AccountSaveBanner />

      {/* モバイルは1カラムで DOM の順のまま 星空 → Sync Tree →（Sync Partner）→
          脳コンディション。デスクトップは 左（Tree＋コンディション）｜右（星空）の
          2カラムで、Sync Partner を出すときは 左（Tree＋Partner）｜右（星空）の下に
          コンディションを幅いっぱいで置く。行列を明示指定している（order だけでは
          グリッドが行方向に流れてしまい、意図しない位置に回り込む）。DOM を並べ替えずに
          order で星空を先頭へ出すと、スマホの読み上げ・Tab の順が見た目と食い違う。 */}
      <div className="flex flex-col gap-6 md:grid md:grid-cols-2 md:gap-6 md:items-start">
        {/* スマホでは先頭——ページの見出し「今日の星空・宇宙周波数で即座に調律」の
            カードで、開いた最初の画面に「この音でセッションを開始する」まで入る
            （高さは ZodiacSyncCard の min-h）。以前は Tree と コンディション の
            下で、幅 390 でも 850px ほどスクロールしないと出てこなかった。
            デスクトップは2行ぶち抜き＋ self-stretch。星空カードを縦に伸ばすと
            行1が高くなり、左列の Tree と コンディション の間に穴が空くため——
            ぶち抜きにすると左列は自然な間隔のまま、右は「Tree＋gap＋
            コンディション」の高さをそのまま受け取って伸びる（決め打ちの高さを
            持たずに両列の下端が揃う）。 */}
        <div className="md:col-start-2 md:row-start-1 md:row-span-2 md:self-stretch">
          <ZodiacSyncCard />
        </div>

        {/* 上＝段階名と今日のおせわ（タップで /tree——いまの木に水をやる画面へ）、
            下＝リスニング記録（タップで /history——聴いた日がカレンダーに並ぶ） */}
        <div className="md:col-start-1 md:row-start-1">
          <SyncTreeCard />
        </div>

        {/* 話し相手：時間帯に合わせてひと言かけ、セッションを1つすすめる
            （朝＝今日の星のプログラム／午後＝気分を尋ねて／帰宅後＝ゆるめる・眠る）。
            星空カードが「今日の空」から勧めるのに対し、こちらは「いまの自分」から勧める。 */}
        {showPartner && (
          <div className="md:col-start-1 md:row-start-2">
            <SyncPartnerCard />
          </div>
        )}

        {/* 測定3値（自動算出）＋ 毎日の自己評価スライダー */}
        <div className={showPartner ? "md:col-span-2 md:row-start-3" : "md:col-start-1 md:row-start-2"}>
          <BrainConditionCard />
        </div>
      </div>
      </PageColumn>
    </div>
  );
}
