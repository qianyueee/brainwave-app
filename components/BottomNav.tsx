"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const tabs = [
  { href: "/", label: "ホーム", icon: "🏠" },
  { href: "/player", label: "プレーヤー", icon: "🎵" },
  { href: "/profile", label: "脳特性", icon: "🧠" },
  { href: "/log", label: "ログ", icon: "📊" },
];

export default function BottomNav() {
  const pathname = usePathname();

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-50 bg-navy-light border-t border-navy-lighter">
      <div className="mx-auto max-w-[480px] flex justify-around items-center h-16">
        {tabs.map((tab) => {
          const isActive =
            tab.href === "/" ? pathname === "/" : pathname.startsWith(tab.href);
          return (
            <Link
              key={tab.href}
              href={tab.href}
              className={`flex flex-col items-center justify-center min-w-[64px] min-h-[48px] gap-0.5 text-sm transition-colors ${
                isActive ? "text-primary" : "text-text-muted"
              }`}
            >
              <span className="text-xl">{tab.icon}</span>
              <span className="text-xs">{tab.label}</span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
