import { create } from "zustand";
import { persist } from "zustand/middleware";

interface AdminState {
  isAdmin: boolean;
  setIsAdmin: (v: boolean) => void;
}

export const useAdminStore = create<AdminState>()(
  persist(
    (set) => ({
      isAdmin: false,
      setIsAdmin: (v) => set({ isAdmin: v }),
    }),
    {
      name: "admin-state",
      partialize: (state) => ({ isAdmin: state.isAdmin }),
    }
  )
);
