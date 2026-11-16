import { useAuth } from "@/contexts/AuthContext";
import { pushDevice } from "@/lib/push-device";
import Constants, { ExecutionEnvironment } from "expo-constants";
import {
    router,
    useGlobalSearchParams,
    usePathname,
    useRootNavigationState,
} from "expo-router";
import { useEffect, useRef } from "react";
import { AppState, Platform } from "react-native";

const projectId =
  Constants.expoConfig?.extra?.eas?.projectId ??
  Constants.easConfig?.projectId ??
  process.env.EXPO_PUBLIC_EAS_PROJECT_ID;
const enabled =
  (Platform.OS === "ios" || Platform.OS === "android") &&
  Constants.executionEnvironment !== ExecutionEnvironment.StoreClient;

export default function ChatPushNotifications() {
  const { user, isRestoring, getAccessToken } = useAuth();
  const navigationKey = useRootNavigationState()?.key;
  const pathname = usePathname();
  const { id } = useGlobalSearchParams<{ id?: string }>();
  const currentChat = useRef<string | undefined>(undefined);
  const userId = user?.id;

  useEffect(() => {
    currentChat.current = pathname.startsWith("/chats/") ? id : undefined;
  }, [id, pathname]);

  useEffect(() => {
    if (!enabled || !navigationKey || isRestoring) {
      return;
    }
    const controller = new AbortController();
    const { signal } = controller;
    const cleanups: (() => void)[] = [];

    async function setup() {
      const notifications = await import("expo-notifications");
      if (signal.aborted) {
        return;
      }
      let handled: string | undefined;
      const openChat = (
        response: import("expo-notifications").NotificationResponse,
      ) => {
        const { request } = response.notification;
        const { type, conversationId } = request.content.data ?? {};
        if (type !== "chat_message" || handled === request.identifier) {
          return;
        }
        handled = request.identifier;
        notifications.clearLastNotificationResponse();
        if (
          !userId ||
          typeof conversationId !== "string" ||
          !/^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(
            conversationId,
          ) ||
          currentChat.current === conversationId
        ) {
          return;
        }
        router.push({
          pathname: "/chats/[id]",
          params: { id: conversationId },
        });
      };

      const responses =
        notifications.addNotificationResponseReceivedListener(openChat);
      cleanups.push(() => {
        responses.remove();
      });
      notifications.setNotificationHandler({
        handleNotification: async ({ request }) => {
          const { type, conversationId } = request.content.data ?? {};
          const show =
            !!userId &&
            type === "chat_message" &&
            currentChat.current !== conversationId;
          return {
            shouldShowBanner: show,
            shouldShowList: show,
            shouldPlaySound: show,
            shouldSetBadge: false,
          };
        },
      });
      cleanups.push(() => {
        notifications.setNotificationHandler(null);
      });
      const response = await notifications.getLastNotificationResponseAsync();
      if (signal.aborted) {
        return;
      }
      if (response) {
        openChat(response);
      }
      if (!userId) {
        return;
      }
      if (!projectId) {
        if (__DEV__) {
          console.warn("[Chat push] Missing EAS project ID.");
        }
        return;
      }

      let registering = false;
      let registeredToken: string | undefined;
      let asked = false;
      async function register() {
        if (
          signal.aborted ||
          registering ||
          AppState.currentState !== "active"
        ) {
          return;
        }
        registering = true;
        try {
          if (Platform.OS === "android") {
            await notifications.setNotificationChannelAsync("default", {
              name: "Chat messages",
              importance: notifications.AndroidImportance.HIGH,
            });
          }
          let permission = await notifications.getPermissionsAsync();
          if (
            !permission.granted &&
            permission.canAskAgain &&
            !asked &&
            !signal.aborted
          ) {
            asked = true;
            permission = await notifications.requestPermissionsAsync();
          }
          if (!permission.granted || signal.aborted) {
            return;
          }
          const { data: token } = await notifications.getExpoPushTokenAsync({
            projectId,
          });
          if (signal.aborted || token === registeredToken) {
            return;
          }
          const accessToken = await getAccessToken();
          if (signal.aborted) {
            return;
          }
          await pushDevice.register(token, accessToken, signal);
          registeredToken = token;
          if (__DEV__) {
            console.info("[Chat push] Device registered.");
          }
        } catch {
          if (__DEV__ && !signal.aborted) {
            console.warn("[Chat push] Device registration failed.");
          }
        } finally {
          registering = false;
        }
      }

      const app = AppState.addEventListener("change", (state) => {
        if (state === "active") {
          void register();
        }
      });
      const tokens = notifications.addPushTokenListener(() => {
        void register();
      });
      cleanups.push(
        () => {
          app.remove();
        },
        () => {
          tokens.remove();
        },
      );
      void register();
    }

    void setup().catch(() => {});
    return () => {
      controller.abort();
      cleanups.forEach((cleanup) => {
        cleanup();
      });
    };
  }, [getAccessToken, isRestoring, navigationKey, userId]);

  return null;
}
