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
              className={`flex flex-col items-center justify-center min-w-[64px] min-h-[48px] gap-0.5 transition-colors ${
                isActive ? "text-primary" : "text-text-muted"
              }`}
            >
              {/* アイコンは 22→20px に。ラベルは text-xs（14px）のまま——
                  情報を担う文字の下限なので、ここは縮めない。 */}
              {isActive ? (
                <span className="w-9 h-9 rounded-xl bg-navy-light neu-inset flex items-center justify-center">
                  <Icon size={20} strokeWidth={2} />
                </span>
              ) : (
                <Icon size={20} strokeWidth={1.5} />
              )}
              <span className="text-xs leading-tight whitespace-nowrap">{tab.short}</span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
