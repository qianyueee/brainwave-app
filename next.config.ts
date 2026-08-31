import type { NextConfig } from "next";

const isProd = process.env.NODE_ENV === "production";

// GitHub Pages は /brainwave-app 配下、デスクトップ測定アプリは
// http://127.0.0.1:17860/ 直下で同じ静的書き出しを配信する。置き場所は
// ビルド時に NEXT_PUBLIC_BASE_PATH で指定し（deploy.yml は /brainwave-app、
// scripts/build-desktop.mjs は ""）、未指定の素の `pnpm build` は従来どおり
// NODE_ENV で決める。`||` ではなく `??` — 明示の空文字列が勝つ必要がある。
const basePath = process.env.NEXT_PUBLIC_BASE_PATH ?? (isProd ? "/brainwave-app" : "");

const nextConfig: NextConfig = {
  output: "export",
  basePath,
  assetPrefix: basePath ? `${basePath}/` : undefined,
  images: {
    unoptimized: true,
  },
};

export default nextConfig;
