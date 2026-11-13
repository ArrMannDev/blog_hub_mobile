import { randomUUID } from "expo-crypto";
import * as SecureStore from "expo-secure-store";
import { Platform } from "react-native";
import { request } from "./api";

const deviceIdKey = "bloghub.push.device-id";

export const pushDevice = {
  async register(expoPushToken: string, accessToken: string, signal: AbortSignal) {
    let id = await SecureStore.getItemAsync(deviceIdKey);
    if (!id) {
      id = randomUUID();
      await SecureStore.setItemAsync(deviceIdKey, id);
    }
    return request<{ deviceId: string; registered: boolean }>(
      `/me/push-devices/${id}`,
      {
        method: "PUT",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ expoPushToken }),
        signal,
      },
    );
  },

  async unregister(accessToken: string) {
    if (Platform.OS !== "ios" && Platform.OS !== "android") return;
    const id = await SecureStore.getItemAsync(deviceIdKey);
    if (!id) return;
    await request<void>(
      `/me/push-devices/${id}`,
      { method: "DELETE", headers: { Authorization: `Bearer ${accessToken}` } },
      4_000,
    );
  },
};
