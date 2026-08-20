"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { NAV_TABS, isTabActive } from "@/components/nav-tabs";

export default function BottomNav() {
  const pathname = usePathname();

  return (
    <nav className="md:hidden fixed bottom-0 left-0 right-0 z-50 bg-navy neu-nav">
      {/* 帯は 56px（旧 64px）。文字とアイコンを詰めたぶん帯そのものも低くして
          いる——中身だけ縮めて高さを据え置くと、余白ばかりの分厚い帯が画面
          下に残る。押せる範囲は帯の高さとは別に min-h-[48px] で確保するので、
          帯を低くしても指の当たりは変わらない。
          ※この 56px は MiniPlayer の `bottom-14` と AppMain の `pb-18`
          （＋ミニプレーヤー表示時の `pb-34`）と対になっている。 */}
      <div className="mx-auto max-w-[480px] flex justify-around items-center h-14">
        {NAV_TABS.map((tab) => {
          const isActive = isTabActive(tab.href, pathname);
          const Icon = tab.icon;
          return (
            <Link
              key={tab.href}
              href={tab.href}
              className={`flex flex-col items-center justify-center min-w-[64px] min-h-[48px] gap-0.5 transition-colors ${
                isActive ? "text-primary" : "text-text-muted"
              }`}
            >
              {/* ラベルは `text-2xs`（10px）＝本文の階段の外。5つ並ぶカタカナ語
                  は「読む文章」ではなくアイコンの読み仮名で、行き先は形と位置で
                  覚えられている——ここが本文と同じ大きさだと、常駐する帯なのに
                  画面のどこよりも文字が詰まって見える。アイコンも 20px、選択中の
                  座布団も 32px に詰めて、帯全体を低くしている。
                  接触域は文字と無関係に min-h-[48px] で確保。 */}
              {isActive ? (
                <span className="w-8 h-8 rounded-xl bg-navy-light neu-inset flex items-center justify-center">
                  <Icon size={20} strokeWidth={2} />
                </span>
              ) : (
                <Icon size={20} strokeWidth={1.5} />
              )}
              <span className="text-2xs leading-none whitespace-nowrap">{tab.short}</span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
