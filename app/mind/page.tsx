"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { BareColumn } from "@/components/PageColumn";

/** Legacy URL — /mind moved to /session. Static export can't 301, so redirect client-side. */
export default function LegacyMindPage() {
  const router = useRouter();
  useEffect(() => {
    router.replace("/session");
  }, [router]);
  return (
    <BareColumn>
      <div className="flex items-center justify-center min-h-[60vh]">
        <p className="text-sm text-text-muted">移動しています…</p>
      </div>
    </BareColumn>
  );
}
