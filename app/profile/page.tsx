"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { BareColumn } from "@/components/PageColumn";
import { useT } from "@/lib/i18n";

/** Legacy URL — /profile moved to /brain. Static export can't 301, so redirect client-side. */
export default function LegacyProfilePage() {
  const router = useRouter();
  const t = useT();
  useEffect(() => {
    router.replace("/brain");
  }, [router]);
  return (
    <BareColumn>
      <div className="flex items-center justify-center min-h-[60vh]">
        <p className="text-sm text-text-muted">{t("移動しています…", "Redirecting…")}</p>
      </div>
    </BareColumn>
  );
}
