import { useCallback, useState } from "react";
import { useFocusEffect } from "expo-router";
import { postTaxonomy } from "@/lib/post-taxonomy";
import { useAuth } from "@/contexts/AuthContext";
import type { Tag } from "@/types/blog";

export function useTags(categoryId: string) {
  const { user } = useAuth();
  const [result, setResult] = useState({
    categoryId: "",
    items: [] as Tag[],
    loading: false,
    error: false,
  });
  const [attempt, setAttempt] = useState(0);

  useFocusEffect(
    useCallback(() => {
      if (!categoryId) return;
      setResult({ categoryId, items: [], loading: true, error: false });
      const controller = new AbortController();
      postTaxonomy
        .tags(user?.id, categoryId, controller.signal)
        .then((items) => {
          if (!controller.signal.aborted)
            setResult({ categoryId, items, loading: false, error: false });
        })
        .catch(() => {
          if (!controller.signal.aborted)
            setResult({ categoryId, items: [], loading: false, error: true });
        });
      return () => controller.abort();
      // Retry replaces the focused callback to reload the list.
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [categoryId, attempt, user?.id]),
  );

  const state =
    result.categoryId === categoryId
      ? result
      : { items: [] as Tag[], loading: !!categoryId, error: false };
  return {
    tags: state.items,
    loading: state.loading,
    error: state.error,
    retry: () => {
      setResult({ categoryId, items: [], loading: true, error: false });
      setAttempt((value) => value + 1);
    },
  };
}
