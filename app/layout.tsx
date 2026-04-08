import type { Metadata, Viewport } from "next";
import "./globals.css";
import { AudioProvider } from "@/components/AudioProvider";
import BottomNav from "@/components/BottomNav";
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
              <main className="mx-auto max-w-[480px] min-h-screen pb-20 px-4">
                {children}
              </main>
              <BottomNav />
            </AudioProvider>
          </AuthProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
