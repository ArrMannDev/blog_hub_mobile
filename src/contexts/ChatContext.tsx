import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { AppState } from "react-native";
import { randomUUID } from "expo-crypto";
import { useAuth } from "./AuthContext";
import { countUnreadMessages } from "@/lib/chat-api";
import { createChatClient } from "@/lib/chat-client";
import {
  isChatMessage,
  mergeMessages,
  validateMessage,
} from "@/lib/chat-messages";
import type {
  ChatEvent,
  ChatMessage,
  LocalMessage,
  MessageDeleted,
  ReadReceipt,
  TypingEvent,
} from "@/types/chat";

interface ChatContextType {
  status: "connecting" | "connected" | "offline";
  revision: number;
  unreadMessageCount: number;
  connectionVersion: number;
  readVersions: Record<string, number>;
  threads: Record<string, LocalMessage[]>;
  typing: Record<string, boolean>;
  deletedMessages: Record<string, string>;
  drafts: Record<string, string>;
  setDraft(id: string, text: string): void;
  mergeThread(id: string, messages: ChatMessage[]): void;
  sendMessage(id: string, content: string): void;
  retryMessage(message: LocalMessage): void;
  deleteMessage(message: LocalMessage): Promise<void>;
  markRead(id: string): Promise<void>;
  setTyping(id: string, active: boolean): void;
  reconnect(): void;
}

export const ChatContext = createContext<ChatContextType | null>(null);

export const ChatContextProvider = ({ children }: { children: ReactNode }) => {
  const { user } = useAuth();
  return (
    <ChatSession key={user?.id ?? "guest"} userId={user?.id}>
      {children}
    </ChatSession>
  );
};

function ChatSession({
  children,
  userId,
}: {
  children: ReactNode;
  userId?: string;
}) {
  const { getAccessToken, checkSession } = useAuth();
  const [status, setStatus] = useState<ChatContextType["status"]>("offline");
  const [revision, setRevision] = useState(0);
  const [unreadMessageCount, setUnreadMessageCount] = useState(0);
  const [connectionVersion, setConnectionVersion] = useState(0);
  const [readVersions, setReadVersions] = useState<Record<string, number>>({});
  const [threads, setThreads] = useState<Record<string, LocalMessage[]>>({});
  const [typing, setTypingState] = useState<Record<string, boolean>>({});
  const [deletedMessages, setDeletedMessages] = useState<
    Record<string, string>
  >({});
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const client = useRef<ReturnType<typeof createChatClient> | null>(null);
  const deletions = useRef(new Map<string, MessageDeleted>());
  const sending = useRef(new Set<string>());
  const typingTimers = useRef(new Map<string, ReturnType<typeof setTimeout>>());
  const typingSent = useRef(new Map<string, number>());

  const mergeThread = useCallback((id: string, messages: ChatMessage[]) => {
    setThreads((current) => ({
      ...current,
      [id]: mergeMessages(current[id] ?? [], messages, deletions.current),
    }));
  }, []);

  const applyDeletion = useCallback(
    (event: MessageDeleted) => {
      if (!deletions.current.has(event.messageId))
        deletions.current.set(event.messageId, event);
      setDeletedMessages((current) =>
        current[event.messageId]
          ? current
          : { ...current, [event.messageId]: event.deletedAt },
      );
      mergeThread(event.conversationId, []);
      setRevision((value) => value + 1);
    },
    [mergeThread],
  );

  useEffect(() => {
    if (!userId) {
      return;
    }
    const controller = new AbortController();
    const timer = setTimeout(async () => {
      try {
        const token = await getAccessToken();
        const count = await countUnreadMessages(token, controller.signal);
        if (!controller.signal.aborted) {
          setUnreadMessageCount(count);
        }
      } catch {
        // Keep the last count until chat changes or reconnects.
      }
    }, 250);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [getAccessToken, revision, userId]);

  useEffect(() => {
    if (!userId) return;
    const timers = typingTimers.current;
    function clearTyping() {
      for (const timer of timers.values()) clearTimeout(timer);
      timers.clear();
      setTypingState({});
    }
    function handleEvent(event: ChatEvent, data?: unknown) {
      if (event === "connected") {
        setConnectionVersion((value) => value + 1);
        setRevision((value) => value + 1);
        return;
      }
      if (event === "message:new") {
        if (isChatMessage(data)) {
          mergeThread(data.conversationId, [data]);
          setRevision((value) => value + 1);
        }
        return;
      }
      if (!data || typeof data !== "object") return;
      const item = data as Record<string, unknown>;
      if (typeof item.conversationId !== "string") return;
      if (
        event === "message:deleted" &&
        typeof item.messageId === "string" &&
        typeof item.deletedAt === "string"
      )
        applyDeletion(data as MessageDeleted);
      if (event === "message:read" && typeof item.readerId === "string") {
        setReadVersions((current) => ({
          ...current,
          [item.conversationId as string]:
            (current[item.conversationId as string] ?? 0) + 1,
        }));
        setRevision((value) => value + 1);
      }
      if (
        (event === "typing:start" || event === "typing:stop") &&
        typeof item.userId === "string" &&
        item.userId !== userId
      ) {
        const id = item.conversationId;
        clearTimeout(typingTimers.current.get(id));
        setTypingState((current) => ({
          ...current,
          [id]: event === "typing:start",
        }));
        if (event === "typing:start")
          typingTimers.current.set(
            id,
            setTimeout(
              () => setTypingState((current) => ({ ...current, [id]: false })),
              4000,
            ),
          );
      }
    }
    const connection = createChatClient({
      getAccessToken,
      checkSession,
      onStatus: (value) => {
        setStatus(value);
        if (value !== "connected") clearTyping();
      },
      onEvent: handleEvent,
    });
    client.current = connection;
    if (AppState.currentState === "active") connection.start();
    const subscription = AppState.addEventListener("change", (state) => {
      if (state === "active") connection.start();
      else connection.pause();
    });
    return () => {
      subscription.remove();
      connection.close();
      client.current = null;
      for (const timer of timers.values()) clearTimeout(timer);
      timers.clear();
    };
  }, [userId, getAccessToken, checkSession, mergeThread, applyDeletion]);

  const deliver = useCallback(
    async (message: LocalMessage) => {
      if (!userId || sending.current.has(message.clientMessageId)) return;
      sending.current.add(message.clientMessageId);
      mergeThread(message.conversationId, [
        { ...message, delivery: "sending", error: undefined } as LocalMessage,
      ]);
      try {
        if (!client.current)
          throw new Error("Chat is offline. Reconnect, then retry.");
        const result = await client.current.emit<{
          message: ChatMessage;
          created: boolean;
        }>("message:send", {
          conversationId: message.conversationId,
          clientMessageId: message.clientMessageId,
          content: message.content,
        });
        if (
          !isChatMessage(result?.message) ||
          result.message.senderId !== userId ||
          result.message.conversationId !== message.conversationId ||
          result.message.clientMessageId !== message.clientMessageId
        )
          throw new Error("Couldn't confirm message delivery. Retry to check.");
        mergeThread(message.conversationId, [result.message]);
        setRevision((value) => value + 1);
      } catch (failure) {
        setThreads((current) => ({
          ...current,
          [message.conversationId]: (current[message.conversationId] ?? []).map(
            (item) =>
              item.clientMessageId === message.clientMessageId && item.delivery
                ? {
                    ...item,
                    delivery: "failed",
                    error:
                      failure instanceof Error
                        ? failure.message
                        : "Couldn't send. Tap Retry.",
                  }
                : item,
          ),
        }));
        setReadVersions((current) => ({
          ...current,
          [message.conversationId]: (current[message.conversationId] ?? 0) + 1,
        }));
      } finally {
        sending.current.delete(message.clientMessageId);
      }
    },
    [userId, mergeThread],
  );

  const sendMessage = useCallback(
    (id: string, content: string) => {
      if (!userId) throw new Error("Sign in to send a message.");
      validateMessage(content);
      // shortcut: Pending messages stay in memory; persist before adding offline/background delivery.
      const clientMessageId = randomUUID();
      void deliver({
        id: clientMessageId,
        conversationId: id,
        senderId: userId,
        clientMessageId,
        content,
        createdAt: new Date().toISOString(),
        deletedAt: null,
        isRead: false,
        delivery: "sending",
      });
    },
    [userId, deliver],
  );

  const retryMessage = useCallback(
    (message: LocalMessage) => {
      if (
        message.senderId === userId &&
        message.delivery === "failed" &&
        !message.deletedAt
      )
        void deliver(message);
    },
    [userId, deliver],
  );

  const deleteMessage = useCallback(
    async (message: LocalMessage) => {
      if (message.senderId !== userId || message.delivery || message.deletedAt)
        throw new Error("You can delete only your own sent messages.");
      if (!client.current) throw new Error("Reconnect to delete this message.");
      const event = await client.current.emit<MessageDeleted>(
        "message:delete",
        { messageId: message.id },
      );
      if (
        event.messageId !== message.id ||
        event.conversationId !== message.conversationId ||
        typeof event.deletedAt !== "string"
      )
        throw new Error(
          "Couldn't confirm deletion. Refresh this conversation.",
        );
      applyDeletion(event);
    },
    [userId, applyDeletion],
  );

  const markRead = useCallback(async (id: string) => {
    if (!client.current) return;
    const result = await client.current.emit<ReadReceipt>("message:read", {
      conversationId: id,
    });
    if (result.updated > 0) setRevision((value) => value + 1);
  }, []);

  const setTyping = useCallback((id: string, active: boolean) => {
    const last = typingSent.current.get(id) ?? 0;
    if ((active && Date.now() - last < 3000) || (!active && !last)) return;
    typingSent.current.set(id, active ? Date.now() : 0);
    void client.current
      ?.emit<TypingEvent>(active ? "typing:start" : "typing:stop", {
        conversationId: id,
      })
      .catch(() => {});
  }, []);

  return (
    <ChatContext.Provider
      value={{
        status,
        revision,
        unreadMessageCount,
        connectionVersion,
        readVersions,
        threads,
        typing,
        deletedMessages,
        drafts,
        setDraft: (id, text) =>
          setDrafts((current) => ({ ...current, [id]: text })),
        mergeThread,
        sendMessage,
        retryMessage,
        deleteMessage,
        markRead,
        setTyping,
        reconnect: () => client.current?.start(),
      }}
    >
      {children}
    </ChatContext.Provider>
  );
}

export const useChat = () => {
  const context = useContext(ChatContext);
  if (!context)
    throw new Error("useChat must be used within a ChatContextProvider");
  return context;
};
