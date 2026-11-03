import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from "react";
import { api } from "@/lib/api";
import { mergeBlogs } from "@/lib/reading";
import { subscribePostChanges } from "@/lib/post-events";
import type { BlogSummary } from "@/types/blog";

interface BlogFeedState {
  items: BlogSummary[];
  page: number;
  hasMore: boolean;
  loading: boolean;
  refreshing: boolean;
  error: boolean;
  initialized: boolean;
  requestedPage: number;
}

interface BlogContextType {
  feeds: Record<string, BlogFeedState>;
  invalidate(): void;
  load(query: string, page: number, refresh?: boolean): Promise<void>;
}

const initialFeed: BlogFeedState = {
  items: [],
  page: 0,
  hasMore: false,
  loading: true,
  refreshing: false,
  error: false,
  initialized: false,
  requestedPage: 1,
};

export const BlogContext = createContext<BlogContextType | null>(null);

export const BlogContextProvider = ({
  children,
}: {
  children: React.ReactNode;
}) => {
  const [feeds, setFeeds] = useState<Record<string, BlogFeedState>>({});
  const requests = useRef(new Map<string, AbortController>());

  const load = useCallback(
    async (query: string, page: number, refresh = false) => {
      const pending = requests.current.get(query);
      if (pending && !refresh) return;
      pending?.abort();
      const controller = new AbortController();
      requests.current.set(query, controller);
      setFeeds((current) => ({
        ...current,
        [query]: {
          ...(current[query] ?? initialFeed),
          loading: true,
          refreshing: refresh,
          error: false,
          requestedPage: page,
        },
      }));

      const params = new URLSearchParams(query);
      params.set("page", String(page));
      params.set("limit", "10");
      try {
        const result = await api.blogs(params.toString(), controller.signal);
        if (controller.signal.aborted) return;
        setFeeds((current) => ({
          ...current,
          [query]: {
            ...current[query],
            items:
              result.page === 1
                ? result.items
                : mergeBlogs(current[query].items, result.items),
            page: result.page,
            hasMore: result.page < result.totalPages,
            loading: false,
            refreshing: false,
            error: false,
            initialized: true,
          },
        }));
      } catch {
        if (!controller.signal.aborted) {
          setFeeds((current) => ({
            ...current,
            [query]: {
              ...current[query],
              loading: false,
              refreshing: false,
              error: true,
              initialized: true,
            },
          }));
        }
      } finally {
        if (requests.current.get(query) === controller)
          requests.current.delete(query);
      }
    },
    [],
  );

  useEffect(() => {
    const pending = requests.current;
    return () => {
      for (const controller of pending.values()) controller.abort();
      pending.clear();
    };
  }, []);

  const invalidate = useCallback(() => {
    for (const controller of requests.current.values()) controller.abort();
    requests.current.clear();
    setFeeds({});
  }, []);

  useEffect(
    () =>
      subscribePostChanges((_userId, server) => {
        if (server) invalidate();
      }),
    [invalidate],
  );

  return (
    <BlogContext.Provider value={{ feeds, load, invalidate }}>
      {children}
    </BlogContext.Provider>
  );
};

export const useBlogs = (query = "") => {
  const context = useContext(BlogContext);
  if (!context) {
    throw new Error("useBlogs must be used within a BlogContextProvider");
  }

  const params = new URLSearchParams(query);
  params.sort();
  const key = params.toString();
  const { feeds, load } = context;
  const state = feeds[key] ?? initialFeed;
  const initialized = state.initialized;

  useEffect(() => {
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
};
