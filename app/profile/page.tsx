"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

/** Legacy URL — /profile moved to /report. Static export can't 301, so redirect client-side. */
export default function LegacyProfilePage() {
  const router = useRouter();
  useEffect(() => {
    router.replace("/report");
  }, [router]);
  return (
    <div className="flex items-center justify-center min-h-[60vh]">
      <p className="text-sm text-text-muted">移動しています…</p>
    </div>
  );
}
