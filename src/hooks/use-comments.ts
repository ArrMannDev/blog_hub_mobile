import { useCallback, useRef, useState } from "react";
import { useFocusEffect } from "expo-router";
import { discussionApi } from "@/lib/discussion-api";
import { mergeBlogs } from "@/lib/reading";
import type { Comment } from "@/types/discussion";

export function useComments(
  blogId: string,
  parentId?: string,
  enabled = true,
  revision = 0,
) {
  const pending = useRef<AbortController | null>(null);
  const [state, setState] = useState({
    items: [] as Comment[],
    total: 0,
    nextPage: 1,
    hasMore: false,
    loading: enabled,
    error: "",
  });
  const load = useCallback(
    async (page: number, replace = false) => {
      if (!enabled || (pending.current && !replace)) return;
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
        const result = await discussionApi.comments(
          blogId,
          page,
          parentId,
          controller.signal,
        );
        if (!controller.signal.aborted)
          setState((current) => ({
            items:
              page === 1
                ? result.items
                : mergeBlogs(current.items, result.items),
            total: result.total,
            nextPage: result.page + 1,
            hasMore: result.page < result.totalPages,
            loading: false,
            error: "",
          }));
      } catch (error) {
        if (!controller.signal.aborted)
          setState((current) => ({
            ...current,
            loading: false,
            error:
              error instanceof Error
                ? error.message
                : "Couldn't load comments.",
          }));
      } finally {
        if (pending.current === controller) pending.current = null;
      }
    },
    [blogId, parentId, enabled],
  );
  useFocusEffect(
    useCallback(() => {
      void load(1, true);
      return () => {
        pending.current?.abort();
        pending.current = null;
      };
      // Reload expanded reply lists after a confirmed comment change.
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [load, revision]),
  );
  return {
    ...state,
    refresh: () => {
      void load(1, true);
    },
    retry: () => {
      void load(state.nextPage, true);
    },
    loadMore: () => {
      if (state.hasMore && !state.loading && !state.error)
        void load(state.nextPage);
    },
  };
}
