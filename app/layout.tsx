import type { Metadata, Viewport } from "next";
import { Noto_Sans_JP } from "next/font/google";
import "./globals.css";
import { AudioProvider } from "@/components/AudioProvider";
import AppMain from "@/components/AppMain";
import BottomNav from "@/components/BottomNav";
import MiniPlayer from "@/components/MiniPlayer";
import SideNav from "@/components/SideNav";
import ThemeProvider from "@/components/ThemeProvider";
import LocaleSync from "@/components/LocaleSync";
import AuthProvider from "@/components/AuthProvider";
import WaveBackground from "@/components/WaveBackground";
import AndroidAppShell from "@/components/AndroidAppShell";
import DesktopAppShell from "@/components/DesktopAppShell";
import { IS_ANDROID_APP, IS_DESKTOP_APP } from "@/lib/platform";

// Self-hosted at build time (works with output:"export"); gives Android a
// proper Japanese face — the system stack only covers iOS (Hiragino) and
// Windows (Meiryo). display:swap shows the system font during load.
const notoSansJP = Noto_Sans_JP({
  weight: ["400", "500", "700"],
  subsets: ["latin"],
  display: "swap",
  variable: "--font-noto-sans-jp",
});

export const metadata: Metadata = {
  title: "NeuroSync（ニューロシンク）",
  description: "音波×光波×脳波シンクロ誘導 ＆ 脳コンディション管理",
};

// No maximumScale/userScalable: pinch-zoom must stay available — the target
// audience is 50-60 and zoom is their fallback for anything still too small.
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#1E1B4B",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html
      lang="ja"
      className={notoSansJP.variable}
      // アプリのビルドだけに付く目印（scripts/build-android.mjs・build-desktop.mjs が
      // 書き出しを確かめるのに使う）。Web 版には属性ごと足さない（RSC の中身にも出ない）。
      {...(IS_ANDROID_APP
        ? { "data-app-platform": "android" }
        : IS_DESKTOP_APP
          ? { "data-app-platform": "desktop" }
          : {})}
    >
      <body>
        {/* 表示言語に合わせて <html lang> と文書タイトルを直す（静的 HTML は日本語） */}
        <LocaleSync />
        <ThemeProvider>
          {/* 波の背景。body の直下に置いて全ページ共通の地にする */}
          <WaveBackground />
          <AuthProvider>
            <AudioProvider>
              {/* Desktop: side rail + wide content area. Mobile: single column. */}
              <div className="md:flex md:min-h-screen">
                <SideNav />
                <div className="md:flex-1 md:min-w-0">
                  <AppMain>{children}</AppMain>
                </div>
              </div>
              <MiniPlayer />
              <BottomNav />
              {/* Android アプリの殻（システムバー・戻るキー等）。Web 版では空。 */}
              <AndroidAppShell />
              {/* Windows アプリの殻（測定アプリとのローカル WS・Google ログインの戻り）。Web 版では空。 */}
              <DesktopAppShell />
            </AudioProvider>
          </AuthProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
