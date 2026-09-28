"use client";

import { useState, useEffect } from "react";
import { useZodiacStore } from "@/store/useZodiacStore";
import {
  ZODIAC_SIGNS,
  getZodiacSign,
  getTodaySky,
  isNightNow,
  dailyRecommendation,
  zodiacName,
  type TodaySky,
} from "@/lib/zodiac";
import { getProgramById, programName } from "@/lib/programs";
import { useLocale, useT } from "@/lib/i18n";
import ZodiacSignPicker from "@/components/ZodiacSignPicker";
import ZodiacConstellation from "@/components/ZodiacConstellation";
import { usePlayProgram } from "@/components/usePlayProgram";
import { Sun, Moon, ChevronDown, Play } from "lucide-react";

/**
 * Today's Astro Sync — ホームの星空ヒーローカード。
 *
 * カードそのものが星空面（.sky-surface）で、星座図はその上に敷いた背景画。
 * 以前は「白カード＋中に夜空の帯」だったが、帯を消してヒーロー1枚に統合した
 * ぶん、面が固定の夜空のままだと昼のクリーム系テーマの上で冷たい板に見える。
 * そこで空の色は --sky-* 経由で時間帯テーマに追従する：朝は淡い空に墨色の
 * 星座線（昼間の星図の描き方）、夕は紫、夜だけが従来の紺。星座の図形自体は
 * 変えず、地色と墨色だけが動く。
 *
 * 並びは「前提 → 読みもの → おすすめ → 開始」の一本道：
 *   1. 今日の空（太陽／月の星座）と自分の星座 …… おすすめが何から出たかの前提
 *   2. 今日の一言 …………………………………………… 読むところ
 *   3. 【タグ】＋周波数名＋理由 ………………………… 何を勧めているか
 *   4. この音でセッションを開始する ………………… 出口
 * 前提を上に出したのは、下端の小さな行に置いていた頃は「今日のおすすめ」の
 * 根拠が結論より後ろに来ていたため。星座チップは選択（12星座パネル）の
 * 入り口も兼ねる——「あなたの星座」の表示と変更が同じ1か所にまとまる。
 */
export default function ZodiacSyncCard() {
  const playProgram = usePlayProgram();
  const selectedSign = useZodiacStore((s) => s.selectedSign);
  const setSelectedSign = useZodiacStore((s) => s.setSelectedSign);
  const t = useT();
  const locale = useLocale();

  // Guard hydration mismatch from the persisted sign
  const [hydrated, setHydrated] = useState(false);
  useEffect(() => {
    setHydrated(true);
  }, []);

  const [pickerOpen, setPickerOpen] = useState(false);

  const [sky, setSky] = useState<TodaySky | null>(null);
  const [skyFailed, setSkyFailed] = useState(false);
  useEffect(() => {
    let cancelled = false;
    getTodaySky()
      .then((s) => {
        if (!cancelled) setSky(s);
      })
      .catch(() => {
        if (!cancelled) setSkyFailed(true);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // Hero = today's sign in the sky right now: sun by day, moon by night
  // (same 6:00/18:00 boundaries as the time-of-day theme). Only meaningful
  // once `sky` resolves, which happens client-side — so reading the clock
  // inline can't cause an SSR mismatch.
  const night = isNightNow();
  const heroSign = sky ? ZODIAC_SIGNS[night ? sky.moonIndex : sky.sunIndex] : undefined;
  const sunSign = sky ? ZODIAC_SIGNS[sky.sunIndex] : undefined;
  const moonSign = sky ? ZODIAC_SIGNS[sky.moonIndex] : undefined;

  // Effective sign: the saved choice, else today's hero sign once computed.
  // The fallback is deliberately NOT written to the store — a default is not
  // a choice; only a tap persists.
  const effectiveKey = hydrated ? selectedSign ?? heroSign?.key ?? null : null;
  const sign = effectiveKey ? getZodiacSign(effectiveKey) : undefined;

  // Modular synthesis: the carrier stays the user's own sign (fixed 音色),
  // while the guided beat varies daily with the sun/moon elements, weekday
  // and time of day (§5 matrix) — so the recommendation changes with the sky.
  // The wording (tag / reason / advice) comes back in the display language.
  const rec = sign ? dailyRecommendation(sky, sign, new Date(), locale) : null;
  const program = rec ? getProgramById(rec.programId) : undefined;

  const handleSelect = (key: (typeof ZODIAC_SIGNS)[number]["key"]) => {
    setSelectedSign(key);
    setPickerOpen(false);
  };

  const handlePlay = () => {
    if (!program) return;
    playProgram(program);
  };

  // 縦の下限。今日の一言を本文として抱えたぶん中身が増えたので、以前の 600px
  // ほど床を上げなくても詰まって見えない。デスクトップは page.tsx 側で2行
  // ぶち抜きにしてあるので h-full で左列の高さをそのまま受け、min-h は左列が
  // 短いときの床としてだけ効かせる。
  return (
    <div className="sky-surface relative flex flex-col min-h-[540px] md:min-h-[480px] md:h-full rounded-3xl overflow-hidden border border-surface-border neu-raised breathe-soft">
      {/* Breathing halo — the luminous part of the motion, warm by day */}
      <div className="sky-halo sky-glow absolute inset-0" />

      {/* Star figure sits off to the right so the copy below keeps a clear
          column; it is decoration, hence aria-hidden inside the component.
          高さ基準（h-full aspect-square）なので、カードを縦に伸ばすと図が横にも
          広がって左端が切れる。max-w-full で幅はカード幅どまりにし、はみ出す分は
          SVG 側の preserveAspectRatio に縦センタリングさせている。 */}
      {heroSign && (
        <ZodiacConstellation
          sign={heroSign.key}
          animated
          className="constellation-breathe absolute top-0 -right-2.5 h-full aspect-square max-w-full text-sky-ink opacity-90"
        />
      )}

      <div className="relative flex-1 p-5 flex flex-col gap-3">
        {/* 1) 今日の空（左）と、自分の星座＝12星座パネルの入り口（右） */}
        <div className="relative flex items-start justify-between gap-3">
          {/* 英語は「Sun in Libra / Moon in Pisces」——いまの空の位置を言う定型で、
              短いうえに右の「Your sign」（利用者自身の星座）と取り違えない。 */}
          <span className="min-w-0 flex flex-col gap-1 text-xs text-sky-text">
            <span className="flex items-center gap-1.5">
              <Sun size={14} strokeWidth={1.5} className="shrink-0" />
              {t(
                `今月の星座：${sunSign ? sunSign.nameJa : "…"}`,
                `Sun in ${sunSign ? zodiacName(sunSign, locale) : "…"}`
              )}
            </span>
            <span className="flex items-center gap-1.5">
              <Moon size={14} strokeWidth={1.5} className="shrink-0" />
              {t(
                `今夜の月星座：${moonSign ? moonSign.nameJa : "…"}`,
                `Moon in ${moonSign ? zodiacName(moonSign, locale) : "…"}`
              )}
            </span>
          </span>

          {hydrated && (
            <span className="shrink-0 flex flex-col items-end gap-1">
              <span className="text-xs text-sky-text">{t("あなたの星座：", "Your sign:")}</span>
              <button
                onClick={() => setPickerOpen((v) => !v)}
                aria-expanded={pickerOpen}
                aria-label={t(
                  `あなたの星座：${sign ? sign.nameJa : "未選択"}／変更する`,
                  `Your sign: ${sign ? zodiacName(sign, locale) : "not chosen"} (change)`
                )}
                className="flex items-center gap-1.5 min-h-12 px-3 rounded-2xl bg-sky-chip text-sky-strong text-base font-bold ring-1 ring-sky-line active:scale-95 transition-transform"
              >
                {sign && (
                  <ZodiacConstellation
                    sign={sign.key}
                    variant="icon"
                    className="w-5 h-5 shrink-0"
                  />
                )}
                {sign ? zodiacName(sign, locale) : t("星座を選ぶ", "Choose your sign")}
                <ChevronDown
                  size={16}
                  strokeWidth={2}
                  className={`shrink-0 transition-transform ${pickerOpen ? "rotate-180" : ""}`}
                />
              </button>
            </span>
          )}

          {/* 星座ピッカーはフローに挿さずカード内に重ねる。挿すとカードが伸び、
              h-full の星座図も一緒に伸びて位置が動くうえ、flex-1 のおすすめ本文
              が中央寄せし直されて既存の要素まで動いてしまう。重ねれば高さは
              一定のまま——開いても1pxも動かない。トリガーがカード上端に来たので
              開く向きは下（top-full）。開閉は grid-rows 0fr→1fr の 200ms。
              scaleY と違い文字が潰れず、素の高さを持つので値の決め打ちも要らない。
              閉じている間は inert でフォーカスも入らない。 */}
          <div
            inert={!pickerOpen}
            className={`sky-panel absolute top-full left-0 right-0 z-10 mt-2 grid rounded-2xl transition-[grid-template-rows,opacity] duration-200 ease-out motion-reduce:transition-none ${
              pickerOpen
                ? "grid-rows-[1fr] opacity-100"
                : "grid-rows-[0fr] opacity-0 pointer-events-none"
            }`}
          >
            <div className="overflow-hidden">
              <div className="p-2.5">
                <ZodiacSignPicker value={effectiveKey} onChange={handleSelect} onSky />
              </div>
            </div>
          </div>
        </div>

        {/* 2) 今日の一言 — 読むところ。溝に沈めて「読みもの」だと手触りで示す */}
        {rec && (
          <div className="rounded-2xl bg-sky-chip ring-1 ring-sky-line px-3.5 py-3 flex flex-col gap-1">
            <p className="text-xs text-sky-text">{t("今日の一言：", "Today's message:")}</p>
            <p className="text-sm text-sky-strong leading-relaxed">{rec.advice}</p>
          </div>
        )}

        {/* 3) 今日のおすすめ＋4) 開始 — カードの存在理由 */}
        {sign && rec && program ? (
          <>
            {/* 伸ばしたぶんの余白はここが吸う——上の2ブロックは上、CTA は下に
                残したまま、おすすめ本文が中央に据わる。下端に空きが溜まらない。 */}
            <div className="flex-1 flex flex-col justify-center">
              {/* 英語は【】を付けない（英文の中では括弧が記号にしか見えない）。
                  太字の小見出しとして名前の上に載るだけで区切りは足りる。 */}
              {rec.tagLabel && (
                <p className="text-sm font-bold text-sky-strong mb-0.5">
                  {t(`【${rec.tagLabel}】`, rec.tagLabel)}
                </p>
              )}
              <p className="text-lg font-bold text-sky-strong">{programName(program, locale)}</p>
              {/* Held short of the star figure so the two never overlap */}
              <p className="text-sm text-sky-text leading-relaxed mt-1 max-w-[290px]">
                {rec.reason
                  ? t(
                      `${rec.reason}、この周波数をおすすめします`,
                      `${rec.reason}. We recommend this frequency.`
                    )
                  : t("星のサイクルと脳波を共鳴", "Brainwaves in tune with the cycles of the stars")}
              </p>
            </div>

            <button
              onClick={handlePlay}
              className="w-full h-12 rounded-2xl bg-primary text-on-primary text-base font-bold flex items-center justify-center gap-2 neu-press active:scale-95 transition-transform"
            >
              <Play size={18} strokeWidth={2} />
              {t("この音でセッションを開始する", "Start a session with this sound")}
            </button>
          </>
        ) : (
          <p className="flex-1 flex items-center text-sm text-sky-text">
            {!hydrated || (!sky && !skyFailed)
              ? t("今日の空を計算中…", "Calculating today's sky…")
              : skyFailed && !sign
                ? t(
                    "今日の星空は取得できませんでした。星座を選ぶとおすすめが表示されます",
                    "Couldn't load today's sky. Choose your sign to see a recommendation."
                  )
                : t(
                    "星座を選ぶとおすすめプログラムが表示されます",
                    "Choose your sign to see a recommended program."
                  )}
          </p>
        )}
      </div>
    </div>
  );
}
