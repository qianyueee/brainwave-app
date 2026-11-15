import type { PartnerRole } from "@/lib/partner";

/**
 * Sync Partner の顔（線画）。人の写真やリアルな絵にしない——3つの役を「同じアプリの中の
 * キャラクター」として見せ、色はテーマの primary に従う。ペットは何の動物とも決めない
 * 小さな生き物（芽の付いた丸い体）。読み上げは隣の役の名前が受け持つので装飾。
 */
export default function PartnerAvatar({ role, size = 48 }: { role: PartnerRole; size?: number }) {
  return (
    <span
      className="shrink-0 rounded-full bg-navy neu-inset text-primary flex items-center justify-center"
      style={{ width: size, height: size }}
      aria-hidden="true"
    >
      <svg
        viewBox="0 0 48 48"
        width={size}
        height={size}
        fill="none"
        stroke="currentColor"
        strokeWidth={1.6}
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        {role === "girlfriend" && (
          <>
            <path d="M12 31C9.5 17 15 9 24 9s14.5 8 12 22" />
            <path d="M12 31c.3 2.6 1.5 4.4 3.3 5.5M36 31c-.3 2.6-1.5 4.4-3.3 5.5" />
            <path d="M16 23.5v3a8 8 0 0 0 16 0v-3" />
            <path d="M16 23.5c4.5-.6 8.2-3 10.2-6.5 1.3 3 3.3 5.2 5.8 6.5" />
            <circle cx="20.7" cy="27" r="1.1" fill="currentColor" stroke="none" />
            <circle cx="27.3" cy="27" r="1.1" fill="currentColor" stroke="none" />
            <path d="M21.7 30.8q2.3 1.8 4.6 0" />
          </>
        )}
        {role === "boyfriend" && (
          <>
            <path d="M15 22.5v4a9 9 0 0 0 18 0v-4" />
            <path d="M15 23c-1.2-8.5 3-13.5 9-13.5s10.2 5 9 13.5" />
            <path d="M15 22.5c4.3 0 8-1.6 10.3-4.6 2.2 2.5 4.9 4 7.7 4.6" />
            <circle cx="20.5" cy="26.5" r="1.1" fill="currentColor" stroke="none" />
            <circle cx="27.5" cy="26.5" r="1.1" fill="currentColor" stroke="none" />
            <path d="M21.5 30.8q2.5 1.6 5 0" />
          </>
        )}
        {role === "pet" && (
          <>
            <ellipse cx="24" cy="29.5" rx="12.5" ry="10.5" />
            <path d="M14.3 22.3a4 4 0 1 1 5.6-3.9M33.7 22.3a4 4 0 1 0-5.6-3.9" />
            <path d="M24 19v-5.5" />
            <path d="M24 13.5c-.8-3.3-3.8-4.6-6.3-3.6.5 3 3 4.6 6.3 3.6zM24 13.5c.8-3.3 3.8-4.6 6.3-3.6-.5 3-3 4.6-6.3 3.6z" />
            <circle cx="19.5" cy="28.5" r="1.3" fill="currentColor" stroke="none" />
            <circle cx="28.5" cy="28.5" r="1.3" fill="currentColor" stroke="none" />
            <path d="M22 32.3q2 1.7 4 0" />
          </>
        )}
      </svg>
    </span>
  );
}
