"use client";

import { useEffect, useMemo, useState, useSyncExternalStore } from "react";
import { Search, X, ChevronDown, Waves, Target, Sparkles, Stars, FolderHeart } from "lucide-react";
import {
  ALL_PROGRAMS,
  getProgramById,
  programCategory,
  programsByCategory,
  programSubGenre,
  searchPrograms,
  type CustomProgram,
  type ProgramCategory,
  type ProgramConfig,
} from "@/lib/programs";
import {
  CATEGORIES,
  TARGET_SUB_GENRES,
  categoryDescription,
  categoryLabel,
} from "@/lib/catalog";
import { ZODIAC_SIGNS, zodiacName, zodiacProgramId } from "@/lib/zodiac";
import { useLocale, useT } from "@/lib/i18n";
import { useZodiacStore } from "@/store/useZodiacStore";
import { useFavoriteIds } from "@/store/useFavoritesStore";
import ProgramCard from "@/components/ProgramCard";
import PublishedProgramCard from "@/components/PublishedProgramCard";

/**
 * Sync Session の節目一覧。4カテゴリのタブ＋全カテゴリ横断の検索。
 *
 * 並びの原則は「配列の順＝画面の順」——ここでは一切ソートしない。Energy は
 * 第0→第12 の順に意味があり（名前順でもファイル名順でもない）、Target の小分類も
 * 相談されやすい順に並べてある。
 *
 * 検索はタブより優先する。170 件から探すとき、まずタブを当てさせるのは
 * 「どのタブにあるか知っている人」にしか通じない。
 *
 * タブの先頭は「マイフォルダ」——カードの ♡ で入れたプログラム（お気に入り）。
 * 分類ではなく自分で集めた束なので、モバイルでは4分類の 2×2 の上に1段で置く。
 * 何か入っていれば、ページを開いたときにこのタブから見せる（よく聴くものへ
 * すぐ届くように）。
 */

/** マイフォルダか4分類か。 */
type Tab = ProgramCategory | "mine";

/** マイフォルダの1件：内蔵・カタログ・星座の節目か、グループに配信されたプログラム。 */
type FolderItem =
  | { kind: "program"; id: string; program: ProgramConfig }
  | { kind: "shared"; id: string; program: CustomProgram };

const subscribeNoop = () => () => {};

const NO_SHARED: readonly CustomProgram[] = [];

/**
 * この起動のあいだ最後に開いていたタブ。カードからプレーヤーへ行って「戻る」と、
 * 同じタブに戻る（ページの部品は作り直されるので、ここに覚えておく）。読み込み
 * 直したら初めから（下の「最初に見せるタブ」）。
 */
let lastTab: Tab | null = null;

const TAB_ICONS: Record<ProgramCategory, typeof Waves> = {
  default: Waves,
  target: Target,
  energy: Sparkles,
  astro: Stars,
};

/**
 * 一覧の器。モバイルは1列、デスクトップは2列（カードが横長なので2列で収まる）。
 * 3列にはしない——名前が長い節目（「低気圧不調・寒暖差・季節性の落ち込み」など
 * 20字前後）が2列でやっと1行に収まる幅なので、3列だと多くが「…」で切れる。
 */
function CardGrid({ programs }: { programs: ProgramConfig[] }) {
  return (
    <div className="flex flex-col gap-2.5 md:grid md:grid-cols-2 md:gap-2.5">
      {programs.map((p) => (
        <ProgramCard key={p.id} program={p} breathe={false} />
      ))}
    </div>
  );
}

function SectionHeading({ label, count }: { label: string; count: number }) {
  const t = useT();
  return (
    <p className="text-sm text-text-secondary">
      {label}
      <span className="ml-2 text-xs text-text-muted">
        {t(`${count}件`, count === 1 ? "1 program" : `${count} programs`)}
      </span>
    </p>
  );
}

/**
 * 星座1つぶん。自星座プログラムは常に出し、差频違いのモジュール版は畳んでおく。
 * `label` は見出しに出す星座名（表示言語のもの）。
 */
function SignSection({
  label,
  own,
  modular,
  expanded,
  onToggle,
}: {
  label: string;
  own: ProgramConfig[];
  modular: ProgramConfig[];
  expanded: boolean;
  onToggle: () => void;
}) {
  const t = useT();
  const n = modular.length;
  return (
    <div className="flex flex-col gap-3">
      <SectionHeading label={label} count={own.length + modular.length} />
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
            {/* 英語は「モジュール版」を中身で言う——同じ星座の載波でビートだけ違う版 */}
            {expanded
              ? t("モジュール版を閉じる", "Hide beat variations")
              : t(
                  `モジュール版 ${n}種を表示`,
                  `Show ${n} beat variation${n === 1 ? "" : "s"}`
                )}
          </button>
        </>
      )}
    </div>
  );
}

export default function CatalogSection({
  sharedPrograms = NO_SHARED,
}: {
  /**
   * いまこの人に見えている配信プログラム（Sync Session の上段と同じもの）。
   * マイフォルダに入れた配信プログラムを引き当てるのに使う——取り下げられた・
   * グループから外れたものはフォルダにも出さない（記録は残すので、また配信されれば
   * 戻る）。
   */
  sharedPrograms?: readonly CustomProgram[];
}) {
  const [query, setQuery] = useState("");
  const t = useT();
  const locale = useLocale();

  const counts = useMemo(() => {
    const map = new Map<ProgramCategory, number>();
    for (const p of ALL_PROGRAMS) {
      const c = programCategory(p);
      map.set(c, (map.get(c) ?? 0) + 1);
    }
    return map;
  }, []);

  // マイフォルダ：入れた順。引き当てられない id（取り下げられた配信など）は出さない。
  const favoriteIds = useFavoriteIds();
  const resolve = useMemo(() => {
    const shared = new Map(sharedPrograms.map((p) => [p.id, p]));
    return (id: string): FolderItem | null => {
      const program = getProgramById(id);
      if (program) return { kind: "program", id, program };
      const sp = shared.get(id);
      return sp ? { kind: "shared", id, program: sp } : null;
    };
  }, [sharedPrograms]);
  const folderCount = useMemo(
    () => favoriteIds.filter((id) => resolve(id) !== null).length,
    [favoriteIds, resolve]
  );

  // 最初に見せるタブ：マイフォルダに何か入っていればそこ、空ならデフォルト。
  // 決めるのは端末の記録を読めてから（mount 後）の1回だけ——静的 HTML と
  // hydration はデフォルトのまま通し、そのあとで切り替える。一度決めたら、開いて
  // いる間に ♡ を押してもタブは勝手に移らない（デフォルトで ♡ を押した途端に
  // フォルダへ飛ぶ・フォルダの最後の1件を外した途端にデフォルトへ戻る、を防ぐ）。
  // プレーヤーから戻ってきたときは、さっきまで開いていたタブ（lastTab）。
  const mounted = useSyncExternalStore(subscribeNoop, () => true, () => false);
  const [tab, setTab] = useState<Tab | null>(() => lastTab);
  if (tab === null && mounted) setTab(folderCount > 0 ? "mine" : "default");
  useEffect(() => {
    if (tab !== null) lastTab = tab;
  }, [tab]);
  const activeTab: Tab = tab ?? "default";

  const results = useMemo(() => searchPrograms(query), [query]);
  const searching = query.trim().length > 0;
  const active = CATEGORIES.find((c) => c.key === activeTab);

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
          placeholder={t("名前・効果・周波数で検索", "Search by name, effect or Hz")}
          aria-label={t("プログラムを検索", "Search programs")}
          className="w-full min-h-12 pl-10 pr-12 py-3 rounded-2xl bg-navy text-text-primary text-base border border-surface-border focus:outline-none focus:border-primary"
        />
        {searching && (
          <button
            onClick={() => setQuery("")}
            aria-label={t("検索をクリア", "Clear search")}
            className="absolute right-1 top-1/2 -translate-y-1/2 w-12 h-12 flex items-center justify-center text-text-muted"
          >
            <X size={18} />
          </button>
        )}
      </div>

      {/* タブ。4分類は横1列だと狭い端末で潰れるので、モバイルは2×2（管理パネルと
          同じ）。マイフォルダはその上に幅いっぱいの1段、デスクトップは5つ横並び。 */}
      {!searching && (
        <div className="flex flex-col gap-2">
          <div
            role="tablist"
            aria-label={t("プログラムの分類", "Program categories")}
            className="grid grid-cols-2 md:grid-cols-5 gap-2"
          >
            <TabButton
              icon={FolderHeart}
              label={t("マイフォルダ", "My Folder")}
              count={folderCount}
              selected={activeTab === "mine"}
              onSelect={() => setTab("mine")}
              className="col-span-2 md:col-span-1"
            />
            {CATEGORIES.map((c) => (
              <TabButton
                key={c.key}
                icon={TAB_ICONS[c.key]}
                label={categoryLabel(c, locale)}
                count={counts.get(c.key) ?? 0}
                selected={activeTab === c.key}
                onSelect={() => setTab(c.key)}
              />
            ))}
          </div>
          <p className="text-xs text-text-muted">
            {activeTab === "mine"
              ? t(
                  "♡ を押して入れたプログラム（もう一度押すと外れます）",
                  "Programs you added with ♡ (tap ♡ again to take one out)"
                )
              : active && categoryDescription(active, locale)}
          </p>
        </div>
      )}

      {searching ? (
        <SearchResults programs={results} />
      ) : activeTab === "mine" ? (
        <FolderTab ids={favoriteIds} resolve={resolve} />
      ) : activeTab === "target" ? (
        <TargetTab />
      ) : activeTab === "astro" ? (
        <AstroTab />
      ) : (
        <CardGrid programs={programsByCategory(activeTab)} />
      )}
    </div>
  );
}

function TabButton({
  icon: Icon,
  label,
  count,
  selected,
  onSelect,
  className = "",
}: {
  icon: typeof Waves;
  label: string;
  count: number;
  selected: boolean;
  onSelect: () => void;
  className?: string;
}) {
  return (
    <button
      role="tab"
      aria-selected={selected}
      onClick={onSelect}
      className={`min-h-12 flex items-center justify-center gap-1.5 px-2 rounded-xl text-sm font-medium transition-colors ${
        selected ? "bg-primary text-on-primary" : "bg-navy text-text-secondary neu-raised-sm"
      } ${className}`}
    >
      <Icon size={16} className="shrink-0" />
      {label}
      <span className="text-xs opacity-70">{count}</span>
    </button>
  );
}

/**
 * マイフォルダの中身。入れた順に並べる。
 *
 * 開いている間に ♡ を外したカードは、このタブを離れるまでその場に残す（♡ は
 * 空になる）——押し間違えても、もう一度押せば戻せる。外した途端に消えると、
 * 4つの分類から探し直すことになる。
 */
function FolderTab({
  ids,
  resolve,
}: {
  ids: readonly string[];
  resolve: (id: string) => FolderItem | null;
}) {
  const t = useT();
  // このタブを開いてから一度でも入っていた id（外したものも残す）。増えた分は
  // 描画の中で足す（effect を待つと、入れたカードが1コマ遅れて出る）。
  const [shown, setShown] = useState<readonly string[]>(ids);
  const added = ids.filter((id) => !shown.includes(id));
  if (added.length > 0) setShown([...shown, ...added]);
  const items = (added.length > 0 ? [...shown, ...added] : shown)
    .map(resolve)
    .filter((item): item is FolderItem => item !== null);

  if (items.length === 0) {
    return (
      <div className="rounded-2xl bg-navy neu-inset px-5 py-8 flex flex-col items-center gap-2 text-center">
        <FolderHeart size={32} strokeWidth={1.5} className="text-text-muted" aria-hidden />
        <p className="text-base font-bold text-text-primary">
          {t("マイフォルダはまだ空です", "Your folder is empty")}
        </p>
        <p className="text-sm text-text-secondary">
          {t("カードの ♡ を押すと、ここに入ります", "Tap ♡ on a program card to add it here")}
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-2.5 md:grid md:grid-cols-2 md:gap-2.5">
      {items.map((item) =>
        item.kind === "program" ? (
          <ProgramCard key={item.id} program={item.program} breathe={false} />
        ) : (
          <PublishedProgramCard key={item.id} program={item.program} breathe={false} />
        )
      )}
    </div>
  );
}

/** 検索結果はカテゴリをまたいで平らに出し、どのタブの節目かを見出しで示す。 */
function SearchResults({ programs }: { programs: ProgramConfig[] }) {
  const t = useT();
  const locale = useLocale();
  if (programs.length === 0) {
    return (
      <p className="text-sm text-text-muted text-center py-8">
        {t("プログラムが見つかりません", "No programs found")}
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
            <SectionHeading label={categoryLabel(c, locale)} count={hit.length} />
            <CardGrid programs={hit} />
          </div>
        );
      })}
    </div>
  );
}

function TargetTab() {
  const programs = programsByCategory("target");
  const locale = useLocale();
  return (
    <div className="flex flex-col gap-6">
      {TARGET_SUB_GENRES.map((sub) => {
        // 段分けの鍵は日本語の subGenre のまま。見出しだけ表示言語で出す。
        const hit = programs.filter((p) => p.subGenre === sub);
        if (hit.length === 0) return null;
        return (
          <div key={sub} className="flex flex-col gap-3">
            <SectionHeading label={programSubGenre(hit[0], locale) ?? sub} count={hit.length} />
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
  const locale = useLocale();

  // マイ星座の段だけ最初から開いておく。persist のストアだが、この成分は
  // hydration の描画には決して出ない——読み込んだ直後のタブはいつも「デフォルト」
  // （マイフォルダへ切り替えるのも hydration の後）で、Astro が最初から開くのは
  // プレーヤーから戻ったとき（lastTab）＝クライアント遷移だけ。つまり必ず
  // hydration のあとに初回描画が来るので、そのまま読んでよい（初回描画で読むと
  // SSR と食い違う、という普段の注意はここでは効かない）。
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
            label={zodiacName(sign, locale)}
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
