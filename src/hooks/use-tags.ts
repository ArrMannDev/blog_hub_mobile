import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import type { Tag } from "@/types/blog";

export function useTags(categoryId: string) {
  const [result, setResult] = useState({
    categoryId: "",
    items: [] as Tag[],
    loading: false,
    error: false,
  });
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    if (!categoryId) return;
    const controller = new AbortController();
    api
      .tags(categoryId, controller.signal)
      .then((items) => {
        if (!controller.signal.aborted)
          setResult({ categoryId, items, loading: false, error: false });
      })
      .catch(() => {
        if (!controller.signal.aborted)
          setResult({ categoryId, items: [], loading: false, error: true });
      });
    return () => controller.abort();
  }, [categoryId, attempt]);

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
