import {
  createContext,
  useCallback,
  useEffect,
  useReducer,
  useRef,
  type PropsWithChildren,
} from "react";
import { api } from "@/lib/api";
import { mergeBlogs } from "@/lib/reading";
import type { BlogPage, BlogSummary } from "@/types/blog";

export interface BlogFeedState {
  items: BlogSummary[];
  page: number;
  hasMore: boolean;
  loading: boolean;
  refreshing: boolean;
  error: boolean;
  initialized: boolean;
  requestedPage: number;
}

export const initialFeed: BlogFeedState = {
  items: [],
  page: 0,
  hasMore: false,
  loading: true,
  refreshing: false,
  error: false,
  initialized: false,
  requestedPage: 1,
};

type FeedAction =
  | { type: "request"; query: string; page: number; refresh: boolean }
  | { type: "success"; query: string; result: BlogPage }
  | { type: "failure"; query: string };

type Feeds = Record<string, BlogFeedState>;

export function blogReducer(feeds: Feeds, action: FeedAction): Feeds {
  const current = feeds[action.query] ?? initialFeed;
  let next: BlogFeedState;
  switch (action.type) {
    case "request":
      next = {
        ...current,
        loading: true,
        refreshing: action.refresh,
        error: false,
        requestedPage: action.page,
      };
      break;
    case "success":
      next = {
        ...current,
        items:
          action.result.page === 1
            ? action.result.items
            : mergeBlogs(current.items, action.result.items),
        page: action.result.page,
        hasMore: action.result.page < action.result.totalPages,
        loading: false,
        refreshing: false,
        error: false,
        initialized: true,
      };
      break;
    case "failure":
      next = {
        ...current,
        loading: false,
        refreshing: false,
        error: true,
        initialized: true,
      };
  }
  return { ...feeds, [action.query]: next };
}

interface BlogContextValue {
  feeds: Feeds;
  load: (query: string, page: number, refresh?: boolean) => Promise<void>;
}

export const BlogContext = createContext<BlogContextValue | undefined>(
  undefined,
);

export function BlogProvider({ children }: PropsWithChildren) {
  const [feeds, dispatch] = useReducer(blogReducer, {});
  const requests = useRef(new Map<string, AbortController>());

  const load = useCallback(
    async (query: string, page: number, refresh = false) => {
      const pending = requests.current.get(query);
      if (pending && !refresh) return;
      pending?.abort();
      const controller = new AbortController();
      requests.current.set(query, controller);
      dispatch({ type: "request", query, page, refresh });
      const params = new URLSearchParams(query);
      params.set("page", String(page));
      params.set("limit", "10");
      try {
        const result = await api.blogs(params.toString(), controller.signal);
        if (!controller.signal.aborted)
          dispatch({ type: "success", query, result });
      } catch {
        if (!controller.signal.aborted) dispatch({ type: "failure", query });
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

  return (
    <BlogContext.Provider value={{ feeds, load }}>
      {children}
    </BlogContext.Provider>
  );
}
