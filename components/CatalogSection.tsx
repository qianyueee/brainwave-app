"use client";

import { useMemo, useState } from "react";
import { Search, X, ChevronDown, Waves, Target, Sparkles, Stars } from "lucide-react";
import {
  ALL_PROGRAMS,
  programCategory,
  programsByCategory,
  searchPrograms,
  type ProgramCategory,
  type ProgramConfig,
} from "@/lib/programs";
import { CATEGORIES, CATEGORY_LABEL, TARGET_SUB_GENRES } from "@/lib/catalog";
import { ZODIAC_SIGNS, zodiacProgramId } from "@/lib/zodiac";
import { useZodiacStore } from "@/store/useZodiacStore";
import ProgramCard from "@/components/ProgramCard";

/**
 * Sync Session の節目一覧。4カテゴリのタブ＋全カテゴリ横断の検索。
 *
 * 並びの原則は「配列の順＝画面の順」——ここでは一切ソートしない。Energy は
 * 第0→第12 の順に意味があり（名前順でもファイル名順でもない）、Target の小分類も
 * 相談されやすい順に並べてある。
 *
 * 検索はタブより優先する。170 件から探すとき、まずタブを当てさせるのは
 * 「どのタブにあるか知っている人」にしか通じない。
 */

const TAB_ICONS: Record<ProgramCategory, typeof Waves> = {
  default: Waves,
  target: Target,
  energy: Sparkles,
  astro: Stars,
};

/** 一覧の器。モバイルは1列、デスクトップは2列（カードが横長なので2列で収まる）。 */
function CardGrid({ programs }: { programs: ProgramConfig[] }) {
  return (
    <div className="flex flex-col gap-3 md:grid md:grid-cols-2 md:gap-3">
      {programs.map((p) => (
        <ProgramCard key={p.id} program={p} breathe={false} />
      ))}
    </div>
  );
}

function SectionHeading({ label, count }: { label: string; count: number }) {
  return (
    <p className="text-sm text-text-secondary">
      {label}
      <span className="ml-2 text-xs text-text-muted">{count}件</span>
    </p>
  );
}

/** 星座1つぶん。自星座プログラムは常に出し、差频違いのモジュール版は畳んでおく。 */
function SignSection({
  nameJa,
  own,
  modular,
  expanded,
  onToggle,
}: {
  nameJa: string;
  own: ProgramConfig[];
  modular: ProgramConfig[];
  expanded: boolean;
  onToggle: () => void;
}) {
  return (
    <div className="flex flex-col gap-3">
      <SectionHeading label={nameJa} count={own.length + modular.length} />
      <CardGrid programs={own} />
      {modular.length > 0 && (
        <>
          {expanded && <CardGrid programs={modular} />}
          <button
            onClick={onToggle}
            aria-expanded={expanded}
            className="self-start min-h-12 px-4 rounded-2xl bg-navy text-sm text-text-secondary neu-raised-sm flex items-center gap-1.5"
          >
            <ChevronDown
              size={16}
              className={`transition-transform${expanded ? " rotate-180" : ""}`}
            />
            {expanded ? "モジュール版を閉じる" : `モジュール版 ${modular.length}種を表示`}
          </button>
        </>
      )}
    </div>
  );
}

export default function CatalogSection() {
  const [tab, setTab] = useState<ProgramCategory>("default");
  const [query, setQuery] = useState("");

  const counts = useMemo(() => {
    const map = new Map<ProgramCategory, number>();
    for (const p of ALL_PROGRAMS) {
      const c = programCategory(p);
      map.set(c, (map.get(c) ?? 0) + 1);
    }
    return map;
  }, []);

  const results = useMemo(() => searchPrograms(query), [query]);
  const searching = query.trim().length > 0;
  const active = CATEGORIES.find((c) => c.key === tab);

  return (
    <div className="flex flex-col gap-4">
      {/* 検索。170件あるので、タブを当てさせる前に名前で引けるようにする。 */}
      <div className="relative">
        <Search
          size={18}
          className="absolute left-3 top-1/2 -translate-y-1/2 text-text-muted pointer-events-none"
        />
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="名前・効果・周波数で検索"
          aria-label="プログラムを検索"
          className="w-full min-h-12 pl-10 pr-12 py-3 rounded-2xl bg-navy text-text-primary text-base border border-surface-border focus:outline-none focus:border-primary"
        />
        {searching && (
          <button
            onClick={() => setQuery("")}
            aria-label="検索をクリア"
            className="absolute right-1 top-1/2 -translate-y-1/2 w-12 h-12 flex items-center justify-center text-text-muted"
          >
            <X size={18} />
          </button>
        )}
      </div>

      {/* タブ。4枚は横1列だと狭い端末で潰れるので、モバイルは2×2（管理パネルと同じ）。 */}
      {!searching && (
        <div className="flex flex-col gap-2">
          <div role="tablist" aria-label="プログラムの分類" className="grid grid-cols-2 md:grid-cols-4 gap-2">
            {CATEGORIES.map((c) => {
              const Icon = TAB_ICONS[c.key];
              const isActive = tab === c.key;
              return (
                <button
                  key={c.key}
                  role="tab"
                  aria-selected={isActive}
                  onClick={() => setTab(c.key)}
                  className={`min-h-12 flex items-center justify-center gap-1.5 px-2 rounded-xl text-sm font-medium transition-colors ${
                    isActive
                      ? "bg-primary text-on-primary"
                      : "bg-navy text-text-secondary neu-raised-sm"
                  }`}
                >
                  <Icon size={16} className="shrink-0" />
                  {c.label}
                  <span className="text-xs opacity-70">{counts.get(c.key) ?? 0}</span>
                </button>
              );
            })}
          </div>
          {active && <p className="text-xs text-text-muted">{active.description}</p>}
        </div>
      )}

      {searching ? (
        <SearchResults programs={results} />
      ) : tab === "target" ? (
        <TargetTab />
      ) : tab === "astro" ? (
        <AstroTab />
      ) : (
        <CardGrid programs={programsByCategory(tab)} />
      )}
    </div>
  );
}

/** 検索結果はカテゴリをまたいで平らに出し、どのタブの節目かを見出しで示す。 */
function SearchResults({ programs }: { programs: ProgramConfig[] }) {
  if (programs.length === 0) {
    return (
      <p className="text-sm text-text-muted text-center py-8">
        プログラムが見つかりません
      </p>
    );
  }
  return (
    <div className="flex flex-col gap-6">
      {CATEGORIES.map((c) => {
        const hit = programs.filter((p) => programCategory(p) === c.key);
        if (hit.length === 0) return null;
        return (
          <div key={c.key} className="flex flex-col gap-3">
            <SectionHeading label={CATEGORY_LABEL[c.key]} count={hit.length} />
            <CardGrid programs={hit} />
          </div>
        );
      })}
    </div>
  );
}

function TargetTab() {
  const programs = programsByCategory("target");
  return (
    <div className="flex flex-col gap-6">
      {TARGET_SUB_GENRES.map((sub) => {
        const hit = programs.filter((p) => p.subGenre === sub);
        if (hit.length === 0) return null;
        return (
          <div key={sub} className="flex flex-col gap-3">
            <SectionHeading label={sub} count={hit.length} />
            <CardGrid programs={hit} />
          </div>
        );
      })}
    </div>
  );
}

function AstroTab() {
  const programs = programsByCategory("astro");
  const selectedSign = useZodiacStore((s) => s.selectedSign);

  // マイ星座の段だけ最初から開いておく。persist のストアだが、この成分は
  // 既定タブが「デフォルト」なので利用者がタブを押すまで描画されない——
  // つまり必ず hydration のあとに初回描画が来るので、そのまま読んでよい
  // （初回描画で読むと SSR と食い違う、という普段の注意はここでは効かない）。
  const [expanded, setExpanded] = useState<ReadonlySet<string>>(() =>
    selectedSign ? new Set([selectedSign]) : new Set()
  );

  const onToggle = (key: string) =>
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });

  return (
    <div className="flex flex-col gap-6">
      {ZODIAC_SIGNS.map((sign) => {
        const mine = programs.filter((p) => p.subGenre === sign.nameJa);
        // `zodiac-<key>` が自星座、`zodiac-<key>-b<beat>` がモジュール版。
        // 部分一致ではなく id の完全一致で分ける（星座キーに "-b" を含むものが
        // 将来増えても壊れないように）。
        const ownId = zodiacProgramId(sign.key);
        const own = mine.filter((p) => p.id === ownId);
        const modular = mine.filter((p) => p.id !== ownId);
        return (
          <SignSection
            key={sign.key}
            nameJa={sign.nameJa}
            own={own}
            modular={modular}
            expanded={expanded.has(sign.key)}
            onToggle={() => onToggle(sign.key)}
          />
        );
      })}
    </div>
  );
}
