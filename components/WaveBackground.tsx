/**
 * アプリ全体の背景 — 重なり合う流れるような波。
 *
 * 参考イメージ（抽象的な波のグラデーション背景）の「かたち」だけを取り、色は
 * 現在のテーマパレットから引く：常に teal で塗ると 4 つの時間帯テーマと喧嘩し、
 * トークンで担保している本文コントラストも崩れるため。midnight は藍の層、
 * day はクリームの層…と、その時間帯の色でだけ波が現れる。
 *
 * 帯どうしの差は小さめに抑えてある——全画面の背景なので、模様が主張すると
 * 50〜60代の読み手にとって本文が読みにくくなる。カードは bg-surface（不透明）
 * なので、可読性に効くのは見出しなど「地の上に直接置く文字」だけ。
 *
 * ■ 動き
 * 上・中・下の3層に分けて、それぞれ別の速さ・向きにごくゆっくり漂わせる
 * （20〜34秒で1往復）。層ごとに速度が違うので視差が出て、板が1枚動くのでは
 * なく水面が流れているように見える。
 *
 * 動かすのは **SVG の中身ではなく HTML の層** ：SVG 内の <g> に transform を
 * 効かせると全画面ぶんのラスタライズが毎フレーム走り、Web Audio の実時間合成と
 * CPU を取り合う。div の translate3d なら GPU の合成だけで済む。
 * 各層は inset -14% ぶん大きく敷いてあるので、最大9%動かしても縁が出ない。
 *
 * prefers-reduced-motion では globals.css 側でキーフレームを無効化している
 * （静止した同じ絵になる）。
 */

/** 3層で共有する帯の傾き。参考イメージと同じく斜めに流す。 */
const TILT = "rotate(-14 600 600)";

function Layer({
  className,
  style,
  children,
}: {
  className: string;
  style: React.CSSProperties;
  children: React.ReactNode;
}) {
  return (
    <div className={`absolute inset-[-14%] ${className}`} style={style}>
      <svg
        className="w-full h-full"
        viewBox="0 0 1200 1200"
        preserveAspectRatio="xMidYMid slice"
      >
        {children}
      </svg>
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
      {/* 上の帯 — いちばん遅く、右へ */}
      <Layer
        className="wave-drift"
        style={{ "--wave-dur": "34s", "--wave-x": "7%", "--wave-y": "-2.5%" } as React.CSSProperties}
      >
        <defs>
          <linearGradient id="wave-a1" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" stopColor="var(--dyn-navy-light)" />
            <stop offset="1" stopColor="var(--dyn-navy)" />
          </linearGradient>
          <linearGradient id="wave-c1" x1="0" y1="0" x2="1" y2="0.6">
            <stop offset="0" stopColor="var(--dyn-primary)" stopOpacity="0.16" />
            <stop offset="1" stopColor="var(--dyn-accent)" stopOpacity="0.10" />
          </linearGradient>
        </defs>
        <g transform={TILT}>
          <path
            d="M-300,300 C-40,210 180,400 460,330 C700,270 900,390 1500,290 L1500,-300 L-300,-300 Z"
            fill="url(#wave-a1)"
          />
          <path
            d="M-300,430 C0,340 200,520 500,450 C760,390 980,500 1500,410 L1500,-300 L-300,-300 Z"
            fill="url(#wave-c1)"
          />
        </g>
      </Layer>

      {/* 中央の一本 — 逆向きに、いちばん速く（20秒で1往復） */}
      <Layer
        className="wave-drift"
        style={{ "--wave-dur": "20s", "--wave-x": "-9%", "--wave-y": "3%" } as React.CSSProperties}
      >
        <defs>
          <linearGradient id="wave-e2" x1="0.2" y1="0" x2="1" y2="1">
            <stop offset="0" stopColor="var(--dyn-navy-light)" stopOpacity="0.75" />
            <stop offset="1" stopColor="var(--dyn-navy-lighter)" stopOpacity="0.45" />
          </linearGradient>
        </defs>
        <g transform={TILT}>
          <path
            d="M-300,640 C40,560 240,720 560,650 C820,595 1060,690 1500,620 L1500,430 C1060,510 820,415 560,470 C240,540 40,380 -300,460 Z"
            fill="url(#wave-e2)"
          />
        </g>
      </Layer>

      {/* 下の帯 — 中くらいの速さで右へ */}
      <Layer
        className="wave-drift"
        style={{ "--wave-dur": "26s", "--wave-x": "6%", "--wave-y": "2%" } as React.CSSProperties}
      >
        <defs>
          <linearGradient id="wave-b3" x1="0" y1="1" x2="1" y2="0">
            <stop offset="0" stopColor="var(--dyn-navy-lighter)" stopOpacity="0.85" />
            <stop offset="1" stopColor="var(--dyn-navy-light)" stopOpacity="0.6" />
          </linearGradient>
          <linearGradient id="wave-d3" x1="0" y1="1" x2="0.7" y2="0">
            <stop offset="0" stopColor="var(--dyn-navy-lighter)" stopOpacity="0.7" />
            <stop offset="1" stopColor="var(--dyn-navy-lighter)" stopOpacity="0.3" />
          </linearGradient>
          <linearGradient id="wave-a3" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" stopColor="var(--dyn-navy-light)" />
            <stop offset="1" stopColor="var(--dyn-navy)" />
          </linearGradient>
        </defs>
        <g transform={TILT}>
          <path
            d="M-300,900 C-20,820 200,980 520,900 C780,835 1020,930 1500,850 L1500,1500 L-300,1500 Z"
            fill="url(#wave-b3)"
          />
          <path
            d="M-300,1040 C40,970 260,1120 600,1040 C860,980 1120,1060 1500,1000 L1500,1500 L-300,1500 Z"
            fill="url(#wave-d3)"
          />
          <path
            d="M-300,1180 C60,1120 300,1240 660,1170 C940,1115 1180,1190 1500,1140 L1500,1500 L-300,1500 Z"
            fill="url(#wave-a3)"
          />
        </g>
      </Layer>
    </div>
  );
}
