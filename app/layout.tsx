import type { Metadata, Viewport } from "next";
import { Noto_Sans_JP } from "next/font/google";
import "./globals.css";
import { AudioProvider } from "@/components/AudioProvider";
import AppMain from "@/components/AppMain";
import BottomNav from "@/components/BottomNav";
import MiniPlayer from "@/components/MiniPlayer";
import SideNav from "@/components/SideNav";
import ThemeProvider from "@/components/ThemeProvider";
import AuthProvider from "@/components/AuthProvider";
import WaveBackground from "@/components/WaveBackground";

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
    <html lang="ja" className={notoSansJP.variable}>
      <body>
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
            </AudioProvider>
          </AuthProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
