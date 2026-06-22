"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Home, Music2, BrainCircuit, BarChart2, Activity } from "lucide-react";

const tabs = [
  { href: "/", label: "ホーム", icon: Home },
  { href: "/player", label: "プレーヤー", icon: Music2 },
  { href: "/mind", label: "マインド", icon: Activity },
  { href: "/profile", label: "脳特性", icon: BrainCircuit },
  { href: "/log", label: "ログ", icon: BarChart2 },
];

/** Desktop-only left navigation rail. Hidden on mobile (BottomNav is used there). */
export default function SideNav() {
  const pathname = usePathname();

  return (
    <nav className="hidden md:flex md:flex-col md:w-60 md:shrink-0 md:sticky md:top-0 md:h-screen bg-navy border-r border-surface-border px-4 py-6 gap-2">
      <div className="px-3 mb-6">
        <p className="text-lg font-bold text-text-primary leading-tight">脳波チューニング</p>
        <p className="text-xs text-text-secondary mt-0.5">Brainwave Tuning</p>
      </div>
      {tabs.map((tab) => {
        const isActive =
          tab.href === "/" ? pathname === "/" : pathname.startsWith(tab.href);
        const Icon = tab.icon;
        return (
          <Link
            key={tab.href}
            href={tab.href}
            className={`flex items-center gap-3 h-12 px-3 rounded-2xl text-base font-medium transition-colors ${
              isActive
                ? "bg-navy-light neu-inset text-primary"
                : "text-text-muted hover:text-text-secondary"
            }`}
          >
            <Icon size={22} strokeWidth={isActive ? 2 : 1.5} />
            <span>{tab.label}</span>
          </Link>
        );
      })}
    </nav>
  );
}
