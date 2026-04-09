import { create } from "zustand";
import { fetchUserRole, fetchUserGroups, type UserRole, type Group } from "@/lib/admin";

interface AdminState {
  role: UserRole;
  userGroups: Group[];
  roleLoaded: boolean;

  // Computed-style getters exposed as state for convenience
  isAdmin: boolean;
  isSuperAdmin: boolean;

  // Actions
  loadRole: (userId: string) => Promise<void>;
  clearRole: () => void;
}

export const useAdminStore = create<AdminState>()((set) => ({
  role: "user",
  userGroups: [],
  roleLoaded: false,
  isAdmin: false,
  isSuperAdmin: false,

  loadRole: async (userId) => {
    const [role, groups] = await Promise.all([
      fetchUserRole(userId),
      fetchUserGroups(userId),
    ]);
    set({
      role,
      userGroups: groups,
      roleLoaded: true,
      isAdmin: role === "admin" || role === "super_admin",
      isSuperAdmin: role === "super_admin",
    });
  },

  clearRole: () =>
    set({
      role: "user",
      userGroups: [],
      roleLoaded: false,
      isAdmin: false,
      isSuperAdmin: false,
    }),
}));
