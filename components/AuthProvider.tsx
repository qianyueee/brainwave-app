"use client";

import { useEffect } from "react";
import { supabase } from "@/lib/supabase";
import { useAuthStore } from "@/store/useAuthStore";
import { useAdminStore } from "@/store/useAdminStore";
import AuthModal from "@/components/AuthModal";

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
      } else {
        clearRole();
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
