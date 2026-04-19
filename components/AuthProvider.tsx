"use client";

import { useEffect } from "react";
import type { User } from "@supabase/supabase-js";
import { supabase } from "@/lib/supabase";
import { useAuthStore } from "@/store/useAuthStore";
import { useAdminStore } from "@/store/useAdminStore";
import { useSynthStore } from "@/store/useSynthStore";
import { useBrainProfileStore } from "@/store/useBrainProfileStore";
import { useCustomAudioStore } from "@/store/useCustomAudioStore";
import { setActiveCloudUserId } from "@/lib/sync/per-user-storage";
import { runFirstLoginMigration } from "@/lib/sync/migrate";
import AuthModal from "@/components/AuthModal";

async function hydrateForUser(user: User) {
  setActiveCloudUserId(user.id);
  await Promise.all([
    useSynthStore.getState().loadFromCloud(user.id),
    useBrainProfileStore.getState().loadFromCloud(user.id),
    useCustomAudioStore.getState().loadFromCloud(user.id),
  ]);
  await runFirstLoginMigration(user);
}

function clearAllForLogout() {
  useSynthStore.getState().clearForLogout();
  useBrainProfileStore.getState().clearForLogout();
  useCustomAudioStore.getState().clearForLogout();
  setActiveCloudUserId(null);
}

export default function AuthProvider({ children }: { children: React.ReactNode }) {
  const setUser = useAuthStore((s) => s.setUser);
  const setLoading = useAuthStore((s) => s.setLoading);
  const loadRole = useAdminStore((s) => s.loadRole);
  const clearRole = useAdminStore((s) => s.clearRole);

  useEffect(() => {
    if (!supabase) {
      setLoading(false);
      return;
    }

    // Check existing session
    supabase.auth.getSession().then(({ data: { session } }) => {
      setUser(session?.user ?? null);
      if (session?.user) {
        loadRole(session.user.id);
        hydrateForUser(session.user).catch((err) =>
          console.error("[auth] hydrate failed:", err)
        );
      }
      setLoading(false);
    });

    // Listen for auth state changes (login, logout, token refresh, OAuth redirect)
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null);
      if (session?.user) {
        loadRole(session.user.id);
        hydrateForUser(session.user).catch((err) =>
          console.error("[auth] hydrate failed:", err)
        );
      } else {
        clearRole();
        clearAllForLogout();
      }
    });

    return () => {
      subscription.unsubscribe();
    };
  }, [setUser, setLoading, loadRole, clearRole]);

  return (
    <>
      {children}
      <AuthModal />
    </>
  );
}
