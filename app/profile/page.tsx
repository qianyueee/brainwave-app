"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { useBrainProfileStore } from "@/store/useBrainProfileStore";
import { useAdminStore } from "@/store/useAdminStore";
import { INDICATOR_META } from "@/lib/brain-profile";
import BrainRadarChart from "@/components/BrainRadarChart";
import EegUploader from "@/components/EegUploader";
import { BrainCircuit } from "lucide-react";

export default function ProfilePage() {
  const profile = useBrainProfileStore((s) => s.profile);
  const clearProfile = useBrainProfileStore((s) => s.clearProfile);
  const isAdmin = useAdminStore((s) => s.isAdmin);
  const setIsAdmin = useAdminStore((s) => s.setIsAdmin);

  // Guard hydration mismatch from persist
  const [hydrated, setHydrated] = useState(false);
  useEffect(() => {
    setHydrated(true);
  }, []);

  // 5-tap admin entry
  const tapCountRef = useRef(0);
  const tapTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [showPasswordModal, setShowPasswordModal] = useState(false);
  const [password, setPassword] = useState("");
  const [passwordError, setPasswordError] = useState(false);

  const handleTitleTap = useCallback(() => {
    tapCountRef.current += 1;
    if (tapTimerRef.current) clearTimeout(tapTimerRef.current);
    if (tapCountRef.current >= 5) {
      tapCountRef.current = 0;
      setShowPasswordModal(true);
      setPassword("");
      setPasswordError(false);
      return;
    }
    tapTimerRef.current = setTimeout(() => {
      tapCountRef.current = 0;
    }, 3000);
  }, []);

  const handlePasswordSubmit = () => {
    if (password === "20041124") {
      setIsAdmin(true);
      setShowPasswordModal(false);
      setPassword("");
      setPasswordError(false);
    } else {
      setPasswordError(true);
    }
  };

  if (!hydrated) return null;

  return (
    <div className="flex flex-col gap-6 pt-6" style={{ animation: "fade-in 0.3s ease-out" }}>
      <div>
        <h1
          className="text-2xl font-bold text-text-primary select-none"
          onClick={handleTitleTap}
        >
          脳特性チャート
        </h1>
        <p className="text-sm text-text-secondary mt-1">
          脳波データから6つの指標を分析
        </p>
        {isAdmin && (
          <div className="flex items-center gap-3 mt-2">
            <span className="text-xs font-bold text-amber-400 bg-amber-400/15 px-2 py-1 rounded-full">
              管理者モード
            </span>
            <button
              onClick={() => setIsAdmin(false)}
              className="text-xs text-text-muted underline"
            >
              管理者モード解除
            </button>
          </div>
        )}
      </div>

      {/* Password Modal */}
      {showPasswordModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60" onClick={() => setShowPasswordModal(false)}>
          <div
            className="bg-surface border border-surface-border rounded-3xl p-6 w-[320px] flex flex-col gap-4 neu-raised"
            onClick={(e) => e.stopPropagation()}
          >
            <p className="text-base font-bold text-text-primary text-center">管理者パスワード</p>
            <input
              type="password"
              value={password}
              onChange={(e) => { setPassword(e.target.value); setPasswordError(false); }}
              onKeyDown={(e) => { if (e.key === "Enter") handlePasswordSubmit(); }}
              placeholder="パスワードを入力"
              className="w-full px-4 py-3 rounded-2xl bg-navy text-text-primary text-base border border-surface-border focus:outline-none focus:border-primary"
              autoFocus
            />
            {passwordError && (
              <p className="text-sm text-red-400 text-center">パスワードが正しくありません</p>
            )}
            <div className="flex gap-3">
              <button
                onClick={() => setShowPasswordModal(false)}
                className="flex-1 py-3 rounded-2xl bg-navy text-text-secondary text-base font-medium neu-raised-sm"
              >
                キャンセル
              </button>
              <button
                onClick={handlePasswordSubmit}
                className="flex-1 py-3 rounded-2xl bg-primary text-white text-base font-bold neu-raised-sm"
              >
                確認
              </button>
            </div>
          </div>
        </div>
      )}

      {profile ? (
        <>
          {/* Radar Chart */}
          <div className="bg-surface border border-surface-border rounded-3xl p-4 neu-raised">
            <BrainRadarChart indicators={profile.indicators} size="large" />
            <p className="text-xs text-text-muted text-center mt-2">
              セッション: {profile.sessionTag} ・ 最終更新:{" "}
              {new Date(profile.uploadedAt).toLocaleDateString("ja-JP")}
            </p>
          </div>

          {/* 6 Indicator Cards */}
          <div className="flex flex-col gap-3">
            <p className="text-sm text-text-secondary">各指標の詳細</p>
            {INDICATOR_META.map((meta) => {
              const score = profile.indicators[meta.key];
              return (
                <div key={meta.key} className="bg-surface border border-surface-border rounded-3xl p-4 neu-raised">
                  <div className="flex items-center justify-between mb-2">
                    <p className="text-base font-bold text-text-primary">{meta.label}</p>
                    <p className="text-lg font-mono font-bold text-primary tabular-nums">
                      {score}
                    </p>
                  </div>
                  {/* Score bar */}
                  <div className="w-full h-2 bg-navy-lighter rounded-full overflow-hidden mb-2 neu-inset">
                    <div
                      className="h-full rounded-full transition-all duration-500"
                      style={{
                        width: `${score}%`,
                        backgroundColor:
                          score >= 70 ? "#22c55e" : score >= 40 ? "#f97316" : "#ef4444",
                      }}
                    />
                  </div>
                  <p className="text-sm text-text-secondary">{meta.description}</p>
                </div>
              );
            })}
          </div>

          {/* Re-upload & Clear */}
          <div className="flex flex-col gap-3">
            <EegUploader />
            <button
              onClick={clearProfile}
              className="w-full py-3 rounded-2xl bg-navy text-text-secondary text-base font-medium neu-raised-sm neu-press transition-transform"
            >
              データをクリア
            </button>
          </div>
        </>
      ) : (
        <>
          {/* Empty state */}
          <div className="bg-surface border border-surface-border rounded-3xl p-8 text-center neu-raised">
            <div className="flex justify-center mb-4">
              <BrainCircuit size={48} className="text-primary" strokeWidth={1.5} />
            </div>
            <p className="text-lg font-bold text-text-primary mb-2">
              脳波データを分析しましょう
            </p>
            <p className="text-sm text-text-secondary mb-6">
              BrainLinkデバイスで測定したExcelまたはCSVファイルをアップロードすると、あなたの脳特性を6つの指標で可視化します。
            </p>
            <EegUploader />
          </div>
        </>
      )}
    </div>
  );
}
