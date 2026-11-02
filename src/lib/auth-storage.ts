import * as SecureStore from "expo-secure-store";
import { Platform } from "react-native";

type SessionMarker = "active" | "refreshing" | "signed-out";
const key = "bloghub.session";

// Only a recovery marker is stored here. Tokens stay in memory and HttpOnly cookies.
export const authStorage = {
  async read(): Promise<SessionMarker | null> {
    const value =
      Platform.OS === "web"
        ? typeof window === "undefined"
          ? null
          : window.sessionStorage.getItem(key)
        : await SecureStore.getItemAsync(key);
    return value === "active" ||
      value === "refreshing" ||
      value === "signed-out"
      ? value
      : null;
  },
  async write(value: SessionMarker): Promise<void> {
    if (Platform.OS === "web") {
      if (typeof window !== "undefined")
        window.sessionStorage.setItem(key, value);
    } else {
      await SecureStore.setItemAsync(key, value, {
        keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
      });
    }
  },
};
