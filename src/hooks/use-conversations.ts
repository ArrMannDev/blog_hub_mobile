import { useCallback, useRef } from "react";
import { useFocusEffect } from "expo-router";
import { useChat } from "@/contexts/ChatContext";
import { usePrivatePage } from "./use-private-page";
import { chatApi } from "@/lib/chat-api";

export function useConversations() {
  const { revision } = useChat();
  const feed = usePrivatePage(chatApi.conversations);
  const previous = useRef(revision);
  const { refresh } = feed;
  useFocusEffect(
    useCallback(() => {
      if (previous.current === revision) return;
      previous.current = revision;
      const timer = setTimeout(refresh, 250);
      return () => clearTimeout(timer);
    }, [revision, refresh]),
  );
  return feed;
}
