import { useCallback, useRef, useState } from "react";
import { useFocusEffect } from "expo-router";
import { useAuth } from "@/contexts/AuthContext";
import { myBlogsApi } from "@/lib/my-blogs-api";
import { mergeBlogs } from "@/lib/reading";
import type { BlogStatus, BlogSummary } from "@/types/blog";

const initialState = {
  items: [] as BlogSummary[],
  page: 0,
  hasMore: false,
  loading: true,
  refreshing: false,
  error: "",
  requestedPage: 1,
};

export function useMyBlogs(status: BlogStatus) {
  const { user, getAccessToken } = useAuth();
  const userId = user?.id;
  const [state, setState] = useState(initialState);
  const pending = useRef<AbortController | null>(null);

  const load = useCallback(
    async (page: number, replace = false) => {
      if (!userId || (pending.current && !replace)) return;
      pending.current?.abort();
      const controller = new AbortController();
      pending.current = controller;
      setState((current) => ({
        ...current,
        loading: true,
        refreshing: replace && current.items.length > 0,
        error: "",
        requestedPage: page,
      }));
      try {
        const token = await getAccessToken();
        if (controller.signal.aborted) return;
        const result = await myBlogsApi.list(
          status,
          page,
          token,
          controller.signal,
        );
        if (controller.signal.aborted) return;
        setState((current) => ({
          ...current,
          items:
            page === 1 ? result.items : mergeBlogs(current.items, result.items),
          page: result.page,
          hasMore: result.page < result.totalPages,
          loading: false,
          refreshing: false,
          error: "",
          requestedPage: page,
        }));
      } catch (error) {
        if (!controller.signal.aborted)
          setState((current) => ({
            ...current,
            loading: false,
            refreshing: false,
            error:
              error instanceof Error
                ? error.message
                : "Couldn't load your posts. Please try again.",
          }));
      } finally {
        if (pending.current === controller) pending.current = null;
      }
    },
    [getAccessToken, status, userId],
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

  return {
    ...state,
    removeFromList: (id: string) =>
      setState((current) => ({
        ...current,
        items: current.items.filter((item) => item.id !== id),
      })),
    refresh: () => {
      void load(1, true);
    },
    loadMore: () => {
      if (state.hasMore && !state.loading && !state.error)
        void load(state.page + 1);
    },
    retry: () => {
      void load(state.requestedPage, true);
    },
  };
}
