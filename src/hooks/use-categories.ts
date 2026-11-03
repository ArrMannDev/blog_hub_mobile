import { useCallback, useState } from "react";
import { useFocusEffect } from "expo-router";
import { postTaxonomy } from "@/lib/post-taxonomy";
import { useAuth } from "@/contexts/AuthContext";
import type { Category } from "@/types/blog";

export function useCategories() {
  const { user } = useAuth();
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [attempt, setAttempt] = useState(0);

  useFocusEffect(
    useCallback(() => {
      setLoading(true);
      const controller = new AbortController();
      postTaxonomy
        .categories(user?.id, controller.signal)
        .then((items) => {
          if (!controller.signal.aborted) {
            setCategories(items);
            setError(false);
          }
        })
        .catch(() => {
          if (!controller.signal.aborted) setError(true);
        })
        .finally(() => {
          if (!controller.signal.aborted) setLoading(false);
        });
      return () => controller.abort();
      // Retry replaces the focused callback to reload the list.
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [attempt, user?.id]),
  );

  return {
    categories,
    loading,
    error,
    retry: () => {
      setLoading(true);
      setAttempt((value) => value + 1);
    },
  };
}
