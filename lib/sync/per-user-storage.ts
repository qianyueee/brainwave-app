import type { PersistStorage, StorageValue } from "zustand/middleware";

/**
 * Returns a Zustand `PersistStorage` adapter that prefixes the persist key
 * with the currently active user id (held in module scope here, set via
 * `setActiveCloudUserId(...)`). When no user is active, persist is a no-op
 * so that anonymous sessions don't leak into another account's cache.
 */

let activeUserId: string | null = null;

export function setActiveCloudUserId(userId: string | null) {
  activeUserId = userId;
}

export function createPerUserStorage<T>(): PersistStorage<T> {
  return {
    getItem: (name) => {
      if (!activeUserId || typeof localStorage === "undefined") return null;
      const raw = localStorage.getItem(`${name}::${activeUserId}`);
      if (!raw) return null;
      try {
        return JSON.parse(raw) as StorageValue<T>;
      } catch {
        return null;
      }
    },
    setItem: (name, value) => {
      if (!activeUserId || typeof localStorage === "undefined") return;
      localStorage.setItem(`${name}::${activeUserId}`, JSON.stringify(value));
    },
    removeItem: (name) => {
      if (!activeUserId || typeof localStorage === "undefined") return;
      localStorage.removeItem(`${name}::${activeUserId}`);
    },
  };
}
