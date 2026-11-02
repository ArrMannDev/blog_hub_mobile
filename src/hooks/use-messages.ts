import { useCallback, useRef, useState } from "react";
import { useFocusEffect } from "expo-router";
import { useAuth } from "@/contexts/AuthContext";
import { useChat } from "@/contexts/ChatContext";
import { chatApi } from "@/lib/chat-api";

export function useMessages(id: string) {
  const { getAccessToken } = useAuth();
  const { threads, mergeThread, connectionVersion, readVersions } = useChat();
  const messages = threads[id] ?? [];
  const [state, setState] = useState({
    loading: true,
    error: "",
    hasMore: false,
    unavailable: false,
    page: 0,
    requestedPage: 1,
  });
  const pending = useRef<AbortController | null>(null);
  const loadedPages = useRef(1);
  const readVersion = readVersions[id] ?? 0;

  const load = useCallback(
    async (page: number, refresh = false) => {
      if (pending.current && !refresh) return;
      pending.current?.abort();
      const controller = new AbortController();
      pending.current = controller;
      setState((current) => ({
        ...current,
        loading: true,
        error: "",
        requestedPage: page,
      }));
      try {
        const token = await getAccessToken();
        if (controller.signal.aborted) return;
        // Refetch loaded pages for canonical read flags, including older visible messages.
        let end = refresh ? loadedPages.current : page;
        for (let next = refresh ? 1 : page; next <= end; next++) {
          setState((current) => ({
            ...current,
            loading: true,
            requestedPage: next,
          }));
          const result = await chatApi.messages(
            id,
            next,
            token,
            controller.signal,
          );
          if (controller.signal.aborted) return;
          mergeThread(id, result.items);
          loadedPages.current = Math.max(
            next,
            refresh && next === 1 ? 1 : loadedPages.current,
          );
          end = Math.min(end, Math.max(1, result.totalPages));
          setState({
            loading: false,
            error: "",
            hasMore: result.page < result.totalPages,
            unavailable: false,
            page: result.page,
            requestedPage: result.page,
          });
        }
      } catch (failure) {
        if (!controller.signal.aborted) {
          const status =
            failure && typeof failure === "object" && "status" in failure
              ? failure.status
              : 0;
          setState((current) => ({
            ...current,
            loading: false,
            unavailable: status === 403 || status === 404,
            error:
              failure instanceof Error
                ? failure.message
                : "Couldn't load this conversation.",
          }));
        }
      } finally {
        if (pending.current === controller) pending.current = null;
      }
    },
    [getAccessToken, id, mergeThread],
  );

  useFocusEffect(
    useCallback(() => {
      void load(1, true);
      return () => {
        pending.current?.abort();
        pending.current = null;
      };
      // Reconnects and read receipts require canonical history reconciliation.
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [load, connectionVersion, readVersion]),
  );

  return {
    ...state,
    messages,
    refresh: () => {
      void load(1, true);
    },
    retry: () => {
      void load(state.requestedPage, state.requestedPage === 1);
    },
    loadOlder: () => {
      if (!state.loading && state.hasMore && !state.error)
        void load(state.page + 1);
    },
  };
}
