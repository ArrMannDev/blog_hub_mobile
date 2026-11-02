import { useCallback, useRef, useState } from "react";
import { useFocusEffect } from "expo-router";
import { useAuth } from "@/contexts/AuthContext";
import { mergeBlogs } from "@/lib/reading";
import type { PrivatePage } from "@/types/activity";

export function usePrivatePage<T extends { id: string }>(
  fetchPage: (
    page: number,
    token: string,
    signal?: AbortSignal,
  ) => Promise<PrivatePage<T>>,
) {
  const { user, getAccessToken } = useAuth();
  const userId = user?.id;
  const pending = useRef<AbortController | null>(null);
  const [state, setState] = useState({
    items: [] as T[],
    page: 0,
    nextPage: 1,
    loading: true,
    error: "",
    hasMore: false,
    unreadCount: 0,
  });
  const load = useCallback(
    async (page: number, replace = false) => {
      if (!userId || (pending.current && !replace)) return;
      pending.current?.abort();
      const controller = new AbortController();
      pending.current = controller;
      setState((current) => ({
        ...current,
        loading: true,
        error: "",
        nextPage: page,
      }));
      try {
        const token = await getAccessToken();
        if (controller.signal.aborted) return;
        const result = await fetchPage(page, token, controller.signal);
        if (controller.signal.aborted) return;
        setState((current) => ({
          items:
            page === 1 ? result.items : mergeBlogs(current.items, result.items),
          page: result.page,
          nextPage: result.page + 1,
          loading: false,
          error: "",
          hasMore: result.page < result.totalPages,
          unreadCount: result.unreadCount ?? 0,
        }));
      } catch (failure) {
        if (!controller.signal.aborted)
          setState((current) => ({
            ...current,
            loading: false,
            error:
              failure instanceof Error
                ? failure.message
                : "Couldn't load this list. Try again.",
          }));
      } finally {
        if (pending.current === controller) pending.current = null;
      }
    },
    [fetchPage, getAccessToken, userId],
  );

  useFocusEffect(
    useCallback(() => {
      void load(1, true);
      return () => {
        pending.current?.abort();
        pending.current = null;
      };
    }, [load]),
  );

  const refresh = useCallback(() => {
    void load(1, true);
  }, [load]);

  return {
    ...state,
    refresh,
    retry: () => {
      void load(state.nextPage, true);
    },
    loadMore: () => {
      if (state.hasMore && !state.loading && !state.error)
        void load(state.page + 1);
    },
  };
}
