import { io } from "socket.io-client";
import { Platform } from "react-native";
import { API_ORIGIN } from "./reading";
import { AUTH_ORIGIN } from "./auth-api";
import type { ChatAck, ChatEvent } from "@/types/chat";

export class ChatError extends Error {
  constructor(
    public code: string,
    message: string,
  ) {
    super(message);
  }
}

export function createChatClient({
  getAccessToken,
  checkSession,
  onStatus,
  onEvent,
}: {
  getAccessToken(): Promise<string>;
  checkSession(): Promise<void>;
  onStatus(status: "connecting" | "connected" | "offline"): void;
  onEvent(event: ChatEvent, data?: unknown): void;
}) {
  let closed = false,
    active = false;
  let retry: ReturnType<typeof setTimeout> | undefined;
  let checking = false;
  const socket = io(`${API_ORIGIN}/chat`, {
    autoConnect: false,
    transports: ["websocket"],
    reconnectionDelayMax: 10_000,
    ...(Platform.OS !== "web" ? { extraHeaders: { Origin: AUTH_ORIGIN } } : {}),
    auth: (done) => {
      void getAccessToken()
        .then((accessToken) => {
          if (!closed && active) done({ accessToken });
        })
        .catch(() => {
          if (!closed && active) done({ accessToken: "" });
        });
    },
  });

  async function recover() {
    if (closed || !active || checking) return;
    checking = true;
    try {
      await checkSession();
    } catch {
      if (!closed && active) onStatus("offline");
    } finally {
      checking = false;
      if (!closed && active) {
        clearTimeout(retry);
        retry = setTimeout(() => {
          if (!closed && active) socket.connect();
        }, 5000);
      }
    }
  }
  socket.on("connect", () => {
    if (!closed && active) {
      onStatus("connected");
      onEvent("connected");
    }
  });
  socket.on("disconnect", (reason) => {
    if (!closed) onStatus("offline");
    if (reason === "io server disconnect") void recover();
  });
  socket.on("connect_error", (error) => {
    if (!closed) onStatus("offline");
    if (error.message.includes("Authentication")) void recover();
  });
  for (const event of [
    "message:new",
    "message:deleted",
    "message:read",
    "typing:start",
    "typing:stop",
  ] as const)
    socket.on(event, (data: unknown) => {
      if (!closed && active) onEvent(event, data);
    });

  return {
    start() {
      if (closed) return;
      active = true;
      clearTimeout(retry);
      if (!socket.connected) {
        onStatus("connecting");
        socket.connect();
      }
    },
    pause() {
      active = false;
      clearTimeout(retry);
      socket.disconnect();
    },
    close() {
      closed = true;
      active = false;
      clearTimeout(retry);
      socket.removeAllListeners();
      socket.disconnect();
    },
    emit<T>(event: string, payload: object): Promise<T> {
      if (closed || !active || !socket.connected)
        return Promise.reject(
          new ChatError(
            "OFFLINE",
            "You're offline. Reconnect, then retry this message.",
          ),
        );
      return new Promise((resolve, reject) => {
        socket
          .timeout(10_000)
          .emit(event, payload, (failure: Error | null, ack: ChatAck<T>) => {
            if (closed) {
              reject(new ChatError("OFFLINE", "Chat session ended."));
              return;
            }
            if (failure) {
              reject(
                new ChatError(
                  "TIMEOUT",
                  "Delivery wasn't confirmed. Retry to check without sending a duplicate.",
                ),
              );
              return;
            }
            if (!ack || typeof ack.ok !== "boolean") {
              reject(
                new ChatError(
                  "INTERNAL_ERROR",
                  "Couldn't confirm this action. Please try again.",
                ),
              );
              return;
            }
            if (!ack.ok) {
              if (
                !ack.error ||
                typeof ack.error.code !== "string" ||
                typeof ack.error.message !== "string"
              ) {
                reject(
                  new ChatError(
                    "INTERNAL_ERROR",
                    "Couldn't confirm this action. Please try again.",
                  ),
                );
                return;
              }
              if (ack.error.code === "UNAUTHORIZED") void recover();
              reject(new ChatError(ack.error.code, ack.error.message));
              return;
            }
            resolve(ack.data);
          });
      });
    },
  };
}
