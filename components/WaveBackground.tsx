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
 * 静止画（アニメーションなし）。fixed で敷きっぱなしにしてスクロールに追従
 * させないので、描画コストは初回のみ。
 */
export default function WaveBackground() {
  return (
    <div
      aria-hidden="true"
      className="fixed inset-0 -z-10 pointer-events-none"
      style={{ background: "var(--dyn-navy)" }}
    >
      <svg
        className="w-full h-full"
        viewBox="0 0 1200 1200"
        preserveAspectRatio="xMidYMid slice"
      >
        <defs>
          {/* 明るい層／暗い層／アクセント層。stop-color に var() を通すため
              グラデーションは SVG 側で持つ（CSS の background では
              パレット変化に追従させにくい） */}
          <linearGradient id="wave-a" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" stopColor="var(--dyn-navy-light)" />
            <stop offset="1" stopColor="var(--dyn-navy)" />
          </linearGradient>
          <linearGradient id="wave-b" x1="0" y1="1" x2="1" y2="0">
            <stop offset="0" stopColor="var(--dyn-navy-lighter)" stopOpacity="0.85" />
            <stop offset="1" stopColor="var(--dyn-navy-light)" stopOpacity="0.6" />
          </linearGradient>
          <linearGradient id="wave-c" x1="0" y1="0" x2="1" y2="0.6">
            <stop offset="0" stopColor="var(--dyn-primary)" stopOpacity="0.16" />
            <stop offset="1" stopColor="var(--dyn-accent)" stopOpacity="0.10" />
          </linearGradient>
          <linearGradient id="wave-d" x1="0" y1="1" x2="0.7" y2="0">
            <stop offset="0" stopColor="var(--dyn-navy-lighter)" stopOpacity="0.7" />
            <stop offset="1" stopColor="var(--dyn-navy-lighter)" stopOpacity="0.3" />
          </linearGradient>
          <linearGradient id="wave-e" x1="0.2" y1="0" x2="1" y2="1">
            <stop offset="0" stopColor="var(--dyn-navy-light)" stopOpacity="0.75" />
            <stop offset="1" stopColor="var(--dyn-navy-lighter)" stopOpacity="0.45" />
          </linearGradient>
        </defs>

        {/* 参考画像と同じく、斜めに流れる帯として重ねる。回転で角が出ないよう
            パスは画面外（-300〜1500）まで伸ばしてある */}
        <g transform="rotate(-14 600 600)">
          <path
            d="M-300,300 C-40,210 180,400 460,330 C700,270 900,390 1500,290 L1500,-300 L-300,-300 Z"
            fill="url(#wave-a)"
          />
          <path
            d="M-300,430 C0,340 200,520 500,450 C760,390 980,500 1500,410 L1500,-300 L-300,-300 Z"
            fill="url(#wave-c)"
          />
          {/* 画面中央にも流れを一本——上下だけだと帯が途切れて見える */}
          <path
            d="M-300,640 C40,560 240,720 560,650 C820,595 1060,690 1500,620 L1500,430 C1060,510 820,415 560,470 C240,540 40,380 -300,460 Z"
            fill="url(#wave-e)"
          />
          <path
            d="M-300,900 C-20,820 200,980 520,900 C780,835 1020,930 1500,850 L1500,1500 L-300,1500 Z"
            fill="url(#wave-b)"
          />
          <path
            d="M-300,1040 C40,970 260,1120 600,1040 C860,980 1120,1060 1500,1000 L1500,1500 L-300,1500 Z"
            fill="url(#wave-d)"
          />
          <path
            d="M-300,1180 C60,1120 300,1240 660,1170 C940,1115 1180,1190 1500,1140 L1500,1500 L-300,1500 Z"
            fill="url(#wave-a)"
          />
        </g>
      </svg>
    </div>
  );
}
