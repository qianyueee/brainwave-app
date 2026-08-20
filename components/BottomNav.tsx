"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { NAV_TABS, isTabActive } from "@/components/nav-tabs";

export default function BottomNav() {
  const pathname = usePathname();

  return (
    <nav className="md:hidden fixed bottom-0 left-0 right-0 z-50 bg-navy neu-nav">
      <div className="mx-auto max-w-[480px] flex justify-around items-center h-16">
        {NAV_TABS.map((tab) => {
          const isActive = isTabActive(tab.href, pathname);
          const Icon = tab.icon;
          return (
            <Link
              key={tab.href}
              href={tab.href}
              className={`flex flex-col items-center justify-center min-w-[64px] min-h-[48px] gap-1 transition-colors ${
                isActive ? "text-primary" : "text-text-muted"
              }`}
            >
              {/* ラベルは `text-2xs`（11px）＝本文の階段より一段下。5つ並ぶ
                  カタカナ語は「読む文章」ではなくアイコンの読み仮名で、行き先は
                  形と位置で覚えられている——ここが本文と同じ大きさだと、常駐
                  する帯なのに画面のどこよりも文字が詰まって見えた。
                  縮めたぶんの縦はアイコンに返して 20→22px（判別を担うのは
                  こちら）。接触域は文字と無関係に min-h-[48px] で確保。 */}
              {isActive ? (
                <span className="w-9 h-9 rounded-xl bg-navy-light neu-inset flex items-center justify-center">
                  <Icon size={22} strokeWidth={2} />
                </span>
              ) : (
                <Icon size={22} strokeWidth={1.5} />
              )}
              <span className="text-2xs leading-none whitespace-nowrap">{tab.short}</span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
