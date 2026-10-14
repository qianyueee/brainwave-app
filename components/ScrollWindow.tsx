"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";

/**
 * 小さな窓の中でだけスクロールする一覧（Sync Session の配信プログラム）。
 *
 * 地は「沈んだ面」（`bg-navy`＋`neu-inset`、水マンダラの窓と同じ）。窓の大きさは
 * 使う側が決める：`className` は窓（沈んだ面）、`scrollClassName` はその中で
 * スクロールする箱——モバイルは箱に max-h、デスクトップは窓を枠いっぱいに
 * 伸ばして箱をそれに合わせる、のように分けて渡す。
 *
 * 下にまだ続きがある間だけ、窓の下端を地の色へぼかす。スマホのスクロール
 * バーは指で動かしている間しか出ないので、これが無いと窓の中がまだ続くことが
 * 見えない（ちょうどカードの切れ目で窓が終わると、全部見えているように見える）。
 * 末尾まで送るとぼかしは消え、最後の1枚はそのまま読める。
 */
export default function ScrollWindow({
  children,
  className = "",
  scrollClassName = "",
}: {
  children: ReactNode;
  className?: string;
  scrollClassName?: string;
}) {
  const scrollerRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const [moreBelow, setMoreBelow] = useState(false);

  useEffect(() => {
    const scroller = scrollerRef.current;
    const content = contentRef.current;
    if (!scroller || !content) return;
    const update = () =>
      setMoreBelow(scroller.scrollTop + scroller.clientHeight < scroller.scrollHeight - 4);
    update();
    scroller.addEventListener("scroll", update, { passive: true });
    // 窓の大きさ（画面の回転・デスクトップの枠の高さ）と中身の量（一覧の
    // 読み込み・件数の増減）のどちらが変わっても測り直す。
    const ro = new ResizeObserver(update);
    ro.observe(scroller);
    ro.observe(content);
    return () => {
      scroller.removeEventListener("scroll", update);
      ro.disconnect();
    };
  }, []);

  return (
    <div className={`relative rounded-2xl bg-navy neu-inset ${className}`}>
      <div ref={scrollerRef} className={`overflow-y-auto scroll-thin rounded-2xl ${scrollClassName}`}>
        <div ref={contentRef} className="flex flex-col gap-2.5">
          {children}
        </div>
      </div>
      <div
        aria-hidden="true"
        className={`pointer-events-none absolute inset-x-0 bottom-0 h-10 rounded-b-2xl bg-linear-to-t from-navy to-transparent transition-opacity duration-300 ${
          moreBelow ? "opacity-100" : "opacity-0"
        }`}
      />
    </div>
  );
}
