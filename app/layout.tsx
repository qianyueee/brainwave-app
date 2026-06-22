import type { Metadata, Viewport } from "next";
import "./globals.css";
import { AudioProvider } from "@/components/AudioProvider";
import BottomNav from "@/components/BottomNav";
import SideNav from "@/components/SideNav";
import ThemeProvider from "@/components/ThemeProvider";
import AuthProvider from "@/components/AuthProvider";

export const metadata: Metadata = {
  title: "脳波チューニング",
  description: "パーソナライズド・バイノーラルビート",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  themeColor: "#0a1020",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="ja">
      <body>
        <ThemeProvider>
          <AuthProvider>
            <AudioProvider>
              {/* Desktop: side rail + wide content area. Mobile: single column. */}
              <div className="md:flex md:min-h-screen">
                <SideNav />
                <div className="md:flex-1 md:min-w-0">
                  <main className="mx-auto w-full max-w-[480px] md:max-w-5xl min-h-screen pb-20 px-4 md:px-8 md:pb-10">
                    {children}
                  </main>
                </div>
              </div>
              <BottomNav />
            </AudioProvider>
          </AuthProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
