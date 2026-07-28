"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

/** Legacy URL — /log moved to /history. Static export can't 301, so redirect client-side. */
export default function LegacyLogPage() {
  const router = useRouter();
  useEffect(() => {
    router.replace("/history");
  }, [router]);
  return (
    <div className="flex items-center justify-center min-h-[60vh]">
      <p className="text-sm text-text-muted">移動しています…</p>
    </div>
  );
}
