/**
 * アプリ全体の背景 — 流れ続ける波。
 *
 * 参考イメージ（抽象的な波のグラデーション背景）の「かたち」だけを取り、色は
 * 現在のテーマパレットから引く：常に teal で塗ると 4 つの時間帯テーマと喧嘩し、
 * トークンで担保している本文コントラストも崩れるため。midnight は藍の層、
 * day はクリームの層…と、その時間帯の色でだけ波が現れる。
 *
 * ■ 動き — 往復ではなく一方向のループ
 * 帯を「横に continuous なパターン」として描き、同じタイルを2枚並べて等速で
 * 半分ぶん流す。1周したところで図柄が完全に一致するので継ぎ目が見えず、
 * 端で減速も反転もしない＝本当に流れて見える（往復の ease-in-out は水の流れ
 * ではなく呼吸に見えるため差し替えた）。
 *
 * タイルが継ぎ目なく繋がる条件は2つ。パスは x=0 と x=1200 で y も傾きも一致
 * させてある（上下の山を2周期ぶん）。グラデーションは横方向に色が変わると
 * タイルの右端と左端で段差になるので、縦方向のみ／左右対称のどちらかにして
 * ある。
 *
 * ■ 負荷
 * 動かすのは SVG の中身ではなく HTML の層。SVG 内の <g> に transform を効かせ
 * ると全画面ぶんのラスタライズが毎フレーム走り、Web Audio の実時間合成と CPU
 * を取り合う。傾き（rotate）は静止した外側の div、流れ（translate）は内側の
 * div と分けてあるので、毎フレーム動くのは合成だけ。
 *
 * prefers-reduced-motion では globals.css 側でキーフレームを無効化している。
 */

/** 2周期ぶんの波形。x=0 と x=1200 で y=中心・傾きも一致するのでタイルできる。 */
function crest(y: number, amp: number): string {
  const up = y - amp;
  const down = y + amp;
  return (
    `M0,${y} ` +
    `C100,${up} 200,${up} 300,${y} ` +
    `C400,${down} 500,${down} 600,${y} ` +
    `C700,${up} 800,${up} 900,${y} ` +
    `C1000,${down} 1100,${down} 1200,${y}`
  );
}

/** 上（または下）へ塗りつぶす帯。 */
function band(y: number, amp: number, to: "top" | "bottom"): string {
  const edge = to === "top" ? -500 : 1700;
  return `${crest(y, amp)} L1200,${edge} L0,${edge} Z`;
}

/** 2本の波線ではさんだリボン。下辺は同じ波形を右から左へ辿る。 */
function ribbon(top: number, bottom: number, amp: number): string {
  const up = bottom - amp;
  const down = bottom + amp;
  return (
    crest(top, amp) +
    ` L1200,${bottom} ` +
    `C1100,${down} 1000,${down} 900,${bottom} ` +
    `C800,${up} 700,${up} 600,${bottom} ` +
    `C500,${down} 400,${down} 300,${bottom} ` +
    `C200,${up} 100,${up} 0,${bottom} Z`
  );
}

/**
 * 1層 = 静止した傾き（外）＋ 流れる2枚のタイル（内）。
 * `reverse` で流れる向きが逆になる。
 */
function Layer({
  duration,
  reverse = false,
  children,
}: {
  duration: string;
  reverse?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div className="absolute inset-[-30%] rotate-[-14deg]">
      <div
        className={`wave-flow flex h-full w-[200%] ${reverse ? "wave-flow-rev" : ""}`}
        style={{ "--wave-dur": duration } as React.CSSProperties}
      >
        {[0, 1].map((i) => (
          <svg
            key={i}
            className="w-1/2 h-full shrink-0"
            viewBox="0 0 1200 1200"
            preserveAspectRatio="none"
          >
            {children}
          </svg>
        ))}
      </div>
    </div>
  );
}

export default function WaveBackground() {
  return (
    <div
      aria-hidden="true"
      className="fixed inset-0 -z-10 pointer-events-none overflow-hidden"
      style={{ background: "var(--dyn-navy)" }}
    >
      {/* グラデーションは3層で共用（id は文書全体で解決される）。横方向に色が
          変わるものは左右対称にして、タイルの継ぎ目に段差が出ないようにする */}
      <svg width="0" height="0" className="absolute">
        <defs>
          <linearGradient id="wv-deep" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="var(--dyn-navy-light)" />
            <stop offset="1" stopColor="var(--dyn-navy)" />
          </linearGradient>
          <linearGradient id="wv-mid" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="var(--dyn-navy-lighter)" stopOpacity="0.85" />
            <stop offset="1" stopColor="var(--dyn-navy-light)" stopOpacity="0.55" />
          </linearGradient>
          <linearGradient id="wv-soft" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="var(--dyn-navy-lighter)" stopOpacity="0.65" />
            <stop offset="1" stopColor="var(--dyn-navy-lighter)" stopOpacity="0.25" />
          </linearGradient>
          {/* 左右対称（0と1が同色）なので継ぎ目が出ない */}
          <linearGradient id="wv-tint" x1="0" y1="0" x2="1" y2="0">
            <stop offset="0" stopColor="var(--dyn-primary)" stopOpacity="0.16" />
            <stop offset="0.5" stopColor="var(--dyn-accent)" stopOpacity="0.10" />
            <stop offset="1" stopColor="var(--dyn-primary)" stopOpacity="0.16" />
          </linearGradient>
        </defs>
      </svg>

      {/* 上の帯 — ゆっくり右へ */}
      <Layer duration="26s">
        <path d={band(300, 70, "top")} fill="url(#wv-deep)" />
        <path d={band(430, 55, "top")} fill="url(#wv-tint)" />
      </Layer>

      {/* 中央のリボン — 逆向きに、いちばん速く */}
      <Layer duration="14s" reverse>
        <path d={ribbon(560, 720, 60)} fill="url(#wv-mid)" />
      </Layer>

      {/* 下の帯 — 中くらいの速さで右へ */}
      <Layer duration="20s">
        <path d={band(880, 65, "bottom")} fill="url(#wv-mid)" />
        <path d={band(1030, 50, "bottom")} fill="url(#wv-soft)" />
        <path d={band(1160, 45, "bottom")} fill="url(#wv-deep)" />
      </Layer>
    </div>
  );
}
