"use client";

import { useEffect } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Menu, PanelLeftClose } from "lucide-react";
import { NAV_TABS, isTabActive } from "@/components/nav-tabs";
import { useSidebarStore } from "@/store/useSidebarStore";

/**
 * Desktop-only left navigation rail. Hidden on mobile (BottomNav is used there).
 *
 * 収納が既定：閉じている間は左上に浮くランチャーボタンだけを出し、押すと
 * レールが 0 → 240px に開いてコンテンツを右へ押しやる（オーバーレイでは
 * なく、これまでどおりレイアウトの一部）。パネル内側は `absolute right-0`
 * で固定幅 240px なので、外枠の幅アニメーションに合わせて左からスライド
 * イン／アウトして見える。閉じるのはヘッダー右のボタン（か Esc）。
 */
export default function SideNav() {
  const pathname = usePathname();
  const open = useSidebarStore((s) => s.open);
  const setOpen = useSidebarStore((s) => s.setOpen);

  // Esc で閉じる（開いている間だけ購読）
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, setOpen]);

  return (
    <>
      {/* 収納時のフローティング起動ボタン。開くと縮んで消え、レールの
          スライドインと入れ替わる。 */}
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label="メニューを開く"
        aria-expanded={open}
        aria-controls="side-nav-panel"
        title="メニューを開く"
        className={`hidden md:flex fixed top-4 left-4 z-50 w-14 h-14 items-center justify-center rounded-2xl bg-surface border border-surface-border text-primary neu-raised active:scale-95 transition-[opacity,transform] duration-300 ease-out motion-reduce:transition-none ${
          open
            ? "opacity-0 -translate-x-2 scale-90 pointer-events-none"
            : "opacity-100 translate-x-0 scale-100"
        }`}
      >
        <Menu size={24} strokeWidth={2} />
      </button>

      <nav
        className={`hidden md:block md:shrink-0 md:sticky md:top-0 md:h-screen relative overflow-hidden transition-[width] duration-300 ease-out motion-reduce:transition-none ${
          open ? "md:w-60" : "md:w-0"
        }`}
      >
        {/* 右端に貼り付けた固定幅パネル。外枠が縮むと左へ抜けていく。
            閉じている間は inert でフォーカス／読み上げ対象から外す。 */}
        <div
          id="side-nav-panel"
          inert={!open}
          className="absolute inset-y-0 right-0 w-60 flex flex-col gap-2 overflow-y-auto bg-navy border-r border-surface-border px-4 py-6"
        >
          <div className="flex items-start justify-between gap-2 pl-3 mb-6">
            <div className="min-w-0">
              <p className="text-base font-bold text-text-primary leading-tight">
                NeuroSync
                <sup className="font-normal">®</sup>
              </p>
              <p className="text-xs text-text-secondary mt-0.5">ニューロシンク</p>
            </div>
            <button
              type="button"
              onClick={() => setOpen(false)}
              aria-label="メニューを閉じる"
              title="メニューを閉じる"
              className="shrink-0 -mr-1 w-12 h-12 flex items-center justify-center rounded-xl text-text-muted hover:text-text-secondary active:scale-95 transition-colors"
            >
              <PanelLeftClose size={22} strokeWidth={1.5} />
            </button>
          </div>
          {NAV_TABS.map((tab) => {
            const isActive = isTabActive(tab.href, pathname);
            const Icon = tab.icon;
            return (
              <Link
                key={tab.href}
                href={tab.href}
                /* 行の高さは 48px 接触域を確保したうえで詰める（旧 56px）。
                   英名は `text-sm`（14px）、読み仮名は下ナビのラベルと同じ
                   `text-2xs`（11px）——2行組の下の行は英名の読みを添えるだけ
                   なので、上の行との差をはっきり付けたほうが1項目として
                   まとまって見える。 */
                className={`flex items-center gap-3 min-h-12 py-1.5 px-3 rounded-2xl font-medium transition-colors ${
                  isActive
                    ? "bg-navy-light neu-inset text-primary"
                    : "text-text-muted hover:text-text-secondary"
                }`}
              >
                <Icon size={20} strokeWidth={isActive ? 2 : 1.5} className="shrink-0" />
                <span className="flex flex-col">
                  <span className="text-sm leading-tight">{tab.en}</span>
                  <span className="text-2xs text-text-muted leading-tight">{tab.kana}</span>
                </span>
              </Link>
            );
          })}
        </div>
      </nav>
    </>
  );
}
