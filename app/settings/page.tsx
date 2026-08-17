"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuthStore } from "@/store/useAuthStore";
import { useAdminStore } from "@/store/useAdminStore";
import { useZodiacStore } from "@/store/useZodiacStore";
import { getZodiacSign } from "@/lib/zodiac";
import ZodiacSignPicker from "@/components/ZodiacSignPicker";
import ZodiacConstellation from "@/components/ZodiacConstellation";
import { User, LogOut, Settings, ChevronRight } from "lucide-react";
import PageColumn from "@/components/PageColumn";
import PageHeader from "@/components/PageHeader";

/**
 * Settings — reached from the gear on the home header (not a nav tab).
 * Hosts the account actions and the admin entry that used to sit in the
 * home header, plus the app info block.
 */
export default function SettingsPage() {
  const router = useRouter();
  const user = useAuthStore((s) => s.user);
  const authLoading = useAuthStore((s) => s.loading);
  const openAuthModal = useAuthStore((s) => s.openAuthModal);
  const signOut = useAuthStore((s) => s.signOut);
  const isAdmin = useAdminStore((s) => s.isAdmin);
  const selectedSign = useZodiacStore((s) => s.selectedSign);
  const setSelectedSign = useZodiacStore((s) => s.setSelectedSign);
  const mySign = selectedSign ? getZodiacSign(selectedSign) : undefined;

  // Guard hydration mismatch from the persisted sign
  const [hydrated, setHydrated] = useState(false);
  useEffect(() => {
    setHydrated(true);
  }, []);

  return (
    <div style={{ animation: "fade-in 0.3s ease-out" }}>
      <PageHeader title="Settings" subtitle="設定" />

      <PageColumn className="md:max-w-2xl">

      {/* Account */}
      <div className="flex flex-col gap-3">
        <p className="text-sm text-text-secondary">アカウント</p>
        <div className="bg-surface border border-surface-border rounded-3xl p-4 neu-raised flex flex-col gap-4">
          {authLoading ? null : user ? (
            <>
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-primary/20 flex items-center justify-center text-primary text-sm font-bold shrink-0">
                  {user.email?.charAt(0).toUpperCase() ?? "U"}
                </div>
                <p className="text-base text-text-primary break-all">{user.email}</p>
              </div>
              <button
                onClick={signOut}
                className="w-full h-12 rounded-2xl bg-navy text-danger text-base font-medium flex items-center justify-center gap-2 neu-raised-sm neu-press transition-transform"
              >
                <LogOut size={18} strokeWidth={1.5} />
                ログアウト
              </button>
            </>
          ) : (
            <>
              <p className="text-base text-text-secondary">ログインしていません</p>
              <button
                onClick={() => openAuthModal("login")}
                className="w-full h-12 rounded-2xl bg-primary text-on-primary text-base font-bold flex items-center justify-center gap-2 neu-raised neu-press active:scale-95 transition-all"
              >
                <User size={18} strokeWidth={1.5} />
                ログイン
              </button>
            </>
          )}
        </div>
      </div>

      {/* My zodiac sign — feeds the home Cosmic & Brain Sync card */}
      <div className="flex flex-col gap-3">
        <p className="text-sm text-text-secondary">マイ星座</p>
        <div className="bg-surface border border-surface-border rounded-3xl p-4 neu-raised flex flex-col gap-3">
          <p className="text-base text-text-primary flex items-center gap-2">
            {hydrated && mySign ? (
              <>
                <ZodiacConstellation
                  sign={mySign.key}
                  variant="icon"
                  className="w-7 h-7 text-primary shrink-0"
                />
                {mySign.nameJa}
              </>
            ) : (
              "未設定（今日の太陽星座を表示します）"
            )}
          </p>
          {hydrated && <ZodiacSignPicker value={selectedSign} onChange={setSelectedSign} />}
        </div>
      </div>

      {/* Admin (admin only) */}
      {user && isAdmin && (
        <div className="flex flex-col gap-3">
          <p className="text-sm text-text-secondary">管理</p>
          <button
            onClick={() => router.push("/admin")}
            className="w-full bg-surface border border-surface-border rounded-3xl p-4 min-h-[48px] flex items-center gap-3 text-left neu-raised neu-press transition-transform"
          >
            <Settings size={20} strokeWidth={1.5} className="text-warning shrink-0" />
            <span className="flex-1 text-base font-bold text-text-primary">管理パネル</span>
            <ChevronRight size={20} className="text-text-muted shrink-0" />
          </button>
        </div>
      )}

      {/* App info */}
      <div className="flex flex-col gap-3">
        <p className="text-sm text-text-secondary">アプリ情報</p>
        <div className="bg-surface border border-surface-border rounded-3xl p-4 neu-raised">
          <p className="text-base font-bold text-text-primary">
            NeuroSync
            <sup className="font-normal">®</sup>
            （ニューロシンク）
          </p>
          <p className="text-sm text-text-secondary mt-1">
            〜 音波×光波×脳波シンクロ誘導 ＆ 脳コンディション管理 〜
          </p>
        </div>
      </div>
      </PageColumn>
    </div>
  );
}
