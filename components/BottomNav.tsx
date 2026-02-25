"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Home, Music2, BrainCircuit, BarChart2 } from "lucide-react";

const tabs = [
  { href: "/", label: "ホーム", icon: Home },
  { href: "/player", label: "プレーヤー", icon: Music2 },
  { href: "/profile", label: "脳特性", icon: BrainCircuit },
  { href: "/log", label: "ログ", icon: BarChart2 },
];

export default function BottomNav() {
  const pathname = usePathname();

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-50 bg-navy neu-nav">
      <div className="mx-auto max-w-[480px] flex justify-around items-center h-16">
        {tabs.map((tab) => {
          const isActive =
            tab.href === "/" ? pathname === "/" : pathname.startsWith(tab.href);
          const Icon = tab.icon;
          return (
            <Link
              key={tab.href}
              href={tab.href}
              className={`flex flex-col items-center justify-center min-w-[64px] min-h-[48px] gap-0.5 text-sm transition-colors ${
                isActive ? "text-primary" : "text-text-muted"
              }`}
            >
              {isActive ? (
                <span className="w-10 h-10 rounded-xl bg-navy-light neu-inset flex items-center justify-center">
                  <Icon size={22} strokeWidth={2} />
                </span>
              ) : (
                <Icon size={22} strokeWidth={1.5} />
              )}
              <span className="text-xs">{tab.label}</span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
