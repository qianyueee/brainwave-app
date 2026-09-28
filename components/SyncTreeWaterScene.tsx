"use client";

import { useEffect, useRef, useState, type CSSProperties, type MouseEvent } from "react";
import {
  SyncTreeFigure,
  SyncTreeScene,
  TREE_SCENE_W,
  TREE_SPARKLE_PATH,
  treeCanopy,
  treeSceneGeometry,
} from "@/components/SyncTreeArt";
import { useT } from "@/lib/i18n";

/**
 * /tree の大きな木。いまの段階の樹が1本、空いっぱいに立つ。
 *
 * **ダブルタップで水やり**（interactive のとき風景全体が1つのボタン）：
 * 1回目のタップで「もう一度タップで水やり」を出して待ち、ARM_MS のうちに
 * もう一度押されたら水やり。350ms の厳密なダブルタップ判定だと 50〜60代の
 * 指には速すぎるうえ、iOS は dblclick を安定して出さず、VoiceOver の「実行」も
 * 1回のクリックとして届く——「2回押す」を時間の猶予で受けるこの形なら、
 * どれでも同じように水をやれる。キーボード（Enter / Space＝detail 0）は1回で水やり。
 * `touch-manipulation` はダブルタップでページが拡大されるのを止める（ピンチ
 * 拡大は止めない）。
 *
 * 手応え（しずく・立ちのぼるきらめき・揺れ）は `burst` が増えるたびに最初から
 * 再生する。「+1」のような数字は出さない——育ち具合は数値でなく見た目で伝える。
 * 段階が変わると新しい絵が根元から育つ（stage を key にして付け直す）。
 * 文字はすべて装飾（aria-hidden）——読み上げはボタンの aria-label と、
 * ページ側の aria-live が受け持つ。
 */

/** 風景の寸法（幅 340）。樹は接地が高さの 95%、大樹で横幅いっぱいになる大きさ。 */
const SCENE = { h: 360, scale: 3 } as const;
/** 1回目のタップから、2回目を「ダブルタップ」と数える猶予。 */
const ARM_MS = 1500;

const SKY: CSSProperties = {
  background:
    "radial-gradient(130% 130% at 30% 15%, var(--tree-a) 0%, var(--tree-b) 45%, var(--tree-c) 100%)",
  borderColor: "var(--tree-border)",
  boxShadow: "0 10px 30px var(--tree-shadow)",
};

const INK: CSSProperties = { color: "var(--tree-ink)" };
const CHIP: CSSProperties = {
  color: "var(--tree-ink)",
  background: "color-mix(in srgb, var(--tree-ink) 14%, transparent)",
};

/** 水やりのあと樹冠から立ちのぼる、手描きの4点星のきらめき（真円は使わない）。 */
function Glint({ size }: { size: number }) {
  return (
    <svg viewBox="-6 -6 12 12" width={size} height={size} aria-hidden="true">
      <path
        d={TREE_SPARKLE_PATH}
        fill="#ffd766"
        stroke="var(--tree-ink)"
        strokeOpacity={0.35}
        strokeWidth={0.6}
        strokeLinejoin="round"
      />
    </svg>
  );
}

/** 手描きのしずく（真円は使わない——アートディレクション）。 */
function Drop() {
  return (
    <svg viewBox="0 0 14 20" width={14} height={20} aria-hidden="true">
      <path
        d="M7,1 C9,5.5 12.6,9.4 12.6,13 C12.6,16.4 10.1,18.8 7,18.8 C3.9,18.8 1.4,16.4 1.4,13 C1.4,9.4 5,5.5 7,1 Z"
        fill="#8fd3ff"
        stroke="rgba(255,255,255,0.85)"
        strokeWidth={1.2}
        strokeLinejoin="round"
      />
      <path
        d="M4.6,12.4 C4.6,10.8 5.4,9.6 6.2,8.8"
        fill="none"
        stroke="rgba(255,255,255,0.9)"
        strokeWidth={1.1}
        strokeLinecap="round"
      />
    </svg>
  );
}

export default function SyncTreeWaterScene({
  stage,
  showTree = true,
  interactive = false,
  title,
  hint,
  canWater = false,
  burst = 0,
  toast = null,
  ariaLabel,
  onWater,
}: {
  /** 0始まりの段階 */
  stage: number;
  /** false なら空だけ（読み込み中など） */
  showTree?: boolean;
  /** ダブルタップで水やりできる（読み込めたときだけ） */
  interactive?: boolean;
  /** 左上（段階名。数字は付けない） */
  title?: string;
  /** 下のひと言（待機中は「もう一度タップで水やり」に替わる） */
  hint?: string;
  /** 今日まだ水をやれる（false なら1回のタップで理由を返す） */
  canWater?: boolean;
  /** 水やりが通るたびに増える。しずく・きらめき・揺れを最初から再生する */
  burst?: number;
  /** 「『若木』に育ちました」などのひと言（id が変わるたびに出し直す） */
  toast?: { id: number; text: string } | null;
  ariaLabel?: string;
  onWater?: () => void;
}) {
  const t = useT();
  const [armed, setArmed] = useState(false);
  const armTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(
    () => () => {
      if (armTimer.current !== null) clearTimeout(armTimer.current);
    },
    []
  );

  const disarm = () => {
    if (armTimer.current !== null) clearTimeout(armTimer.current);
    armTimer.current = null;
    setArmed(false);
  };

  const onClick = (e: MouseEvent<HTMLButtonElement>) => {
    // キーボード（Enter / Space）で押したクリックは detail が 0。1回で水やり。
    if (e.detail === 0 || !canWater) {
      disarm();
      onWater?.();
      return;
    }
    if (armed) {
      disarm();
      onWater?.();
      return;
    }
    setArmed(true);
    if (armTimer.current !== null) clearTimeout(armTimer.current);
    armTimer.current = setTimeout(() => {
      armTimer.current = null;
      setArmed(false);
    }, ARM_MS);
  };

  // しずくときらめきは樹冠の上へ——段階ごとの樹冠（ハンドオフのオーラ楕円）を
  // 風景の座標に写して、カード幅に対する％で置く（カードの実寸に依らない）。
  const { tx, ty } = treeSceneGeometry(SCENE.h, SCENE.scale);
  const canopy = treeCanopy(stage);
  const leftPct = ((tx + canopy.cx * SCENE.scale) / TREE_SCENE_W) * 100;
  const topPct = ((ty + (canopy.cy - canopy.ry * 0.6) * SCENE.scale) / SCENE.h) * 100;
  const spreadPct = ((canopy.rx * 0.5 * SCENE.scale) / TREE_SCENE_W) * 100;

  const tree = showTree ? (
    <g key={`grow-${stage}`} className="tree-grow">
      <g key={`sway-${burst}`} className={burst > 0 ? "tree-sway" : undefined}>
        <SyncTreeFigure stage={stage} />
      </g>
    </g>
  ) : null;

  const body = (
    <>
      {/* 風景と、その上に重ねるもの。重ねる位置（％）はこの箱＝SVG の実寸が基準。
          ボタンの中に置くので div ではなく span（block）で組む */}
      <span className="relative block">
        <SyncTreeScene h={SCENE.h} scale={SCENE.scale} className="block w-full">
          {tree}
        </SyncTreeScene>

        {/* 左上：段階名（％や段階の番号は出さない） */}
        {title && (
          <span
            aria-hidden="true"
            className="pointer-events-none absolute top-0 left-0 p-5 text-lg font-bold"
            style={INK}
          >
            {title}
          </span>
        )}

        {/* ひと言（育った・植え替えた）。横いっぱいの箱の中で中央に置く——
            left:50% の絶対配置だと右半分の幅で折り返してしまう */}
        {toast && (
          <span
            aria-hidden="true"
            className="pointer-events-none absolute inset-x-0 top-16 flex justify-center px-4"
          >
            <span
              key={toast.id}
              className="tree-toast rounded-full px-4 py-1.5 text-base font-bold text-center"
              style={CHIP}
            >
              {toast.text}
            </span>
          </span>
        )}

        {/* 水やりの手応え：しずく3つが落ち、きらめきが立ちのぼる */}
        {burst > 0 && (
          <span key={`burst-${burst}`} aria-hidden="true" className="pointer-events-none">
            {[-1, 0, 1].map((k, i) => (
              <span
                key={k}
                className="tree-drop absolute -translate-x-1/2"
                style={
                  {
                    left: `${leftPct + k * spreadPct}%`,
                    top: `${topPct - (k === 0 ? 3 : 0)}%`,
                    "--drop-delay": `${i * 0.12}s`,
                  } as CSSProperties
                }
              >
                <Drop />
              </span>
            ))}
            {[
              { dx: 1.5, dy: -2, size: 20, delay: 0.35 },
              { dx: -1.3, dy: 1, size: 15, delay: 0.5 },
              { dx: 0.4, dy: -7, size: 12, delay: 0.65 },
            ].map((g) => (
              <span
                key={g.dx}
                className="tree-rise absolute -translate-x-1/2"
                style={
                  {
                    left: `${leftPct + spreadPct * g.dx}%`,
                    top: `${topPct + g.dy}%`,
                    "--rise-delay": `${g.delay}s`,
                  } as CSSProperties
                }
              >
                <Glint size={g.size} />
              </span>
            ))}
          </span>
        )}
      </span>

      {/* 下のひと言。風景の外（地面の下）に1行とる——重ねると幹の根元を隠す */}
      {hint && (
        <span aria-hidden="true" className="flex justify-center px-4 pb-4">
          <span className="rounded-full px-4 py-1.5 text-base font-bold text-center" style={CHIP}>
            {armed ? t("もう一度タップで水やり", "Tap again to water") : hint}
          </span>
        </span>
      )}
    </>
  );

  if (!interactive) {
    return (
      <div
        className="relative rounded-3xl overflow-hidden border"
        style={SKY}
        role={ariaLabel ? "img" : undefined}
        aria-label={ariaLabel}
        aria-hidden={ariaLabel ? undefined : true}
      >
        {body}
      </div>
    );
  }

  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={ariaLabel}
      className="relative block w-full rounded-3xl overflow-hidden border touch-manipulation focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
      style={SKY}
    >
      {body}
    </button>
  );
}
