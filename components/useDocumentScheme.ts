"use client";

import { useSyncExternalStore } from "react";
import { THEME_CHANGE_EVENT, getDocumentScheme } from "@/lib/theme";

function subscribe(cb: () => void): () => void {
  window.addEventListener(THEME_CHANGE_EVENT, cb);
  return () => window.removeEventListener(THEME_CHANGE_EVENT, cb);
}

/**
 * Light/dark flag of the applied time-of-day palette, re-read on every theme
 * change. Charts use it to pick hex color sets for SVG attributes (stroke,
 * fill), which — unlike CSS properties — cannot evaluate var().
 */
export function useDocumentScheme(): "light" | "dark" {
  return useSyncExternalStore(subscribe, getDocumentScheme, () => "dark" as const);
}
