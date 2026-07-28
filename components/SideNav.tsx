"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { NAV_TABS, isTabActive } from "@/components/nav-tabs";

/** Desktop-only left navigation rail. Hidden on mobile (BottomNav is used there). */
export default function SideNav() {
  const pathname = usePathname();

  return (
    <nav className="hidden md:flex md:flex-col md:w-60 md:shrink-0 md:sticky md:top-0 md:h-screen bg-navy border-r border-surface-border px-4 py-6 gap-2">
      <div className="px-3 mb-6">
        <p className="text-lg font-bold text-text-primary leading-tight">NeuroSync</p>
        <p className="text-xs text-text-secondary mt-0.5">ニューロシンク</p>
      </div>
      {NAV_TABS.map((tab) => {
        const isActive = isTabActive(tab.href, pathname);
        const Icon = tab.icon;
        return (
          <Link
            key={tab.href}
            href={tab.href}
            className={`flex items-center gap-3 min-h-[56px] py-2 px-3 rounded-2xl text-base font-medium transition-colors ${
              isActive
                ? "bg-navy-light neu-inset text-primary"
                : "text-text-muted hover:text-text-secondary"
            }`}
          >
            <Icon size={22} strokeWidth={isActive ? 2 : 1.5} className="shrink-0" />
            <span className="flex flex-col">
              <span className="text-base leading-tight">{tab.en}</span>
              <span className="text-xs text-text-muted leading-tight mt-0.5">{tab.kana}</span>
            </span>
          </Link>
        );
      })}
    </nav>
  );
}
