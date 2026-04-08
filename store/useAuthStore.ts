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
  signOut: () => Promise<void>;
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
      await supabase.auth.signOut();
    }
    set({ user: null });
  },
}));
