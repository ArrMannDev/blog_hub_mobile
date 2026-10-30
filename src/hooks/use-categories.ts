import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import type { Category } from "@/types/blog";

export function useCategories() {
  const [categories, setCategories] = useState<Category[]>([]);
  const [error, setError] = useState(false);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    api
      .categories(controller.signal)
      .then((items) => {
        if (!controller.signal.aborted) {
          setCategories(items);
          setError(false);
        }
      })
      .catch(() => {
        if (!controller.signal.aborted) setError(true);
      });
    return () => controller.abort();
  }, [attempt]);

  return { categories, error, retry: () => setAttempt((value) => value + 1) };
}
