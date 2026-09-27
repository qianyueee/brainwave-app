import { create } from "zustand";
import { supabase } from "@/lib/supabase";
import type { User } from "@supabase/supabase-js";

type AuthModalView = "login" | "signup" | "forgot";

interface AuthState {
  user: User | null;
  loading: boolean;
  authModalOpen: boolean;
  authModalView: AuthModalView;

  setUser: (user: User | null) => void;
  setLoading: (loading: boolean) => void;
  openAuthModal: (view?: AuthModalView) => void;
  closeAuthModal: () => void;
  setAuthModalView: (view: AuthModalView) => void;
  /**
   * この端末だけログアウトする（scope: "local"）。既定の global だと、スマホで
   * ログアウトしただけでデスクトップ測定アプリのログインまで切れて、測定が
   * 黙ってアカウントに届かなくなる。オフラインではサーバーに届かず失敗する
   * ——そのときはログイン状態のまま error を返す。
   */
  signOut: () => Promise<{ error: Error | null }>;
}

export const useAuthStore = create<AuthState>()((set) => ({
  user: null,
  loading: true,
  authModalOpen: false,
  authModalView: "login",

  setUser: (user) => set({ user }),
  setLoading: (loading) => set({ loading }),

  openAuthModal: (view = "login") =>
    set({ authModalOpen: true, authModalView: view }),

  closeAuthModal: () => set({ authModalOpen: false }),

  setAuthModalView: (view) => set({ authModalView: view }),

  signOut: async () => {
    if (supabase) {
      const { error } = await supabase.auth.signOut({ scope: "local" });
      if (error) return { error };
    }
    set({ user: null });
    return { error: null };
  },
}));
