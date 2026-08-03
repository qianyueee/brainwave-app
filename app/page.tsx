"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import ZodiacSyncCard from "@/components/ZodiacSyncCard";
import BrainConditionMetrics from "@/components/BrainConditionMetrics";
import BrainRadarChart from "@/components/BrainRadarChart";
import { useBrainProfileStore } from "@/store/useBrainProfileStore";
import { BrainCircuit, User, Settings } from "lucide-react";
import { useAuthStore } from "@/store/useAuthStore";

export default function HomePage() {
  const router = useRouter();
  const profile = useBrainProfileStore((s) => s.profile);
  const user = useAuthStore((s) => s.user);
  const authLoading = useAuthStore((s) => s.loading);
  const openAuthModal = useAuthStore((s) => s.openAuthModal);
  const isLoggedIn = !!user;

  // Guard against hydration mismatch from persist middleware
  const [hydrated, setHydrated] = useState(false);
  useEffect(() => {
    setHydrated(true);
  }, []);

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
                className="flex items-center gap-2 h-10 px-4 rounded-2xl bg-navy text-text-secondary text-sm font-medium whitespace-nowrap neu-raised-sm neu-press active:scale-95"
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
            className="w-10 h-10 flex items-center justify-center rounded-xl text-text-muted active:scale-95"
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

      {/* Mobile: metrics → chart → zodiac. Desktop: condition (left) | zodiac (right).
          All program/audio sections live on Sync Session now. */}
      <div className="flex flex-col gap-6 md:grid md:grid-cols-2 md:gap-6 md:items-start">
      <div className="flex flex-col gap-6">
      {/* Brain condition — the 3 self-care metrics (replaces the mood selector) */}
      <BrainConditionMetrics />

      {/* Brain Profile Card */}
      {hydrated && (
        profile ? (
          <Link href="/report" className="block bg-surface border border-surface-border rounded-3xl p-4 neu-raised neu-press transition-transform breathe">
            <div className="flex items-center justify-between mb-1">
              <p className="text-sm text-text-secondary">脳特性チャート</p>
              <span className="text-xs text-primary font-medium">詳細 →</span>
            </div>
            <BrainRadarChart indicators={profile.indicators} size="small" showScores />
            <p className="text-xs text-text-muted text-center">
              最終更新: {new Date(profile.uploadedAt).toLocaleDateString("ja-JP")}
            </p>
          </Link>
        ) : (
          <Link
            href="/report"
            className="block w-full bg-surface border border-surface-border rounded-3xl p-4 text-center neu-raised neu-press transition-transform breathe"
          >
            <div className="flex justify-center mb-2">
              <BrainCircuit size={36} className="text-primary" strokeWidth={1.5} />
            </div>
            <p className="text-base font-bold text-text-primary">脳波データをアップロード</p>
            <p className="text-sm text-text-secondary mt-1">
              パーソナライズされたプログラムを体験
            </p>
          </Link>
        )
      )}
      </div>

      <div className="flex flex-col gap-6">
      <ZodiacSyncCard />
      </div>
      </div>
    </div>
  );
}
