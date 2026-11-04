import * as SecureStore from "expo-secure-store";
import { Platform } from "react-native";
import type { AuthUser } from "@/types/auth";

const key = "bloghub.offline-profile";
let writes = Promise.resolve();
export const offlineProfile = {
  async read(): Promise<AuthUser | null> {
    if (Platform.OS === "web") return null;
    await writes;
    const raw = await SecureStore.getItemAsync(key);
    if (!raw) return null;
    try {
      const value = JSON.parse(raw) as Partial<AuthUser>;
      return typeof value.id === "string" &&
        typeof value.displayName === "string" &&
        typeof value.email === "string" &&
        ["author", "admin", "super_admin"].includes(value.role ?? "") &&
        value.status === "active"
        ? { ...(value as AuthUser), permissions: [] }
        : null;
    } catch {
      return null;
    }
  },
  write(user: AuthUser | null): Promise<void> {
    if (Platform.OS === "web") return Promise.resolve();
    const result = writes.then(() =>
      user
        ? SecureStore.setItemAsync(key, JSON.stringify(user), {
            keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
          })
        : SecureStore.deleteItemAsync(key),
    );
    writes = result.catch(() => {});
    return result;
  },
};
