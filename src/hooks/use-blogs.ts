import { useContext, useEffect } from "react";
import { BlogContext, initialFeed } from "@/contexts/BlogContext";

export function useBlogs(query = "") {
  const context = useContext(BlogContext);
  if (!context) throw new Error("useBlogs must be used inside BlogProvider");

  const params = new URLSearchParams(query);
  params.sort();
  const key = params.toString();
  const { feeds, load } = context;
  const state = feeds[key] ?? initialFeed;
  const initialized = state.initialized;

  useEffect(() => {
    // The provider deduplicates initial requests shared by multiple consumers.
    if (!initialized) void load(key, 1);
  }, [initialized, key, load]);

  return {
    ...state,
    refresh: () => {
      void load(key, 1, true);
    },
    loadMore: () => {
      if (state.hasMore && !state.loading && !state.error)
        void load(key, state.page + 1);
    },
    retry: () => {
      void load(key, state.requestedPage);
    },
  };
}
