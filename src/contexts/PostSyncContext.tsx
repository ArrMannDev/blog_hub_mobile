import NetInfo from "@react-native-community/netinfo";
import { createContext, useContext, useEffect, useRef, useState } from "react";
import { AppState, Platform } from "react-native";
import { useAuth } from "./AuthContext";
import {
  syncPosts,
  retryFailedPosts,
  retryDelay,
  PostSyncUnavailableError,
} from "@/lib/post-sync";
import { subscribePostChanges } from "@/lib/post-events";
import { getAccountDatabase } from "@/lib/offline/database";
import type { AuthUser } from "@/types/auth";
import { postTaxonomy } from "@/lib/post-taxonomy";
import { ApiError } from "@/lib/api";

interface SyncState {
  revision: number;
  pending: number;
  problems: number;
  syncing: boolean;
  message: string;
  issues: {
    id: string;
    title: string;
    message: string;
    needsCategory: number;
  }[];
  retry(): void;
}
const empty: SyncState = {
  revision: 0,
  pending: 0,
  problems: 0,
  syncing: false,
  message: "",
  issues: [],
  retry() {},
};
const PostSyncContext = createContext<SyncState>(empty);
export const usePostSync = () => useContext(PostSyncContext);

export function PostSyncProvider({ children }: { children: React.ReactNode }) {
  const { user, getAccessToken, checkSession } = useAuth();
  return user && Platform.OS !== "web" ? (
    <Session
      key={user.id}
      user={user}
      token={getAccessToken}
      revalidate={checkSession}
    >
      {children}
    </Session>
  ) : (
    children
  );
}

function Session({
  user,
  token,
  revalidate,
  children,
}: {
  user: AuthUser;
  token: () => Promise<string>;
  revalidate: () => Promise<void>;
  children: React.ReactNode;
}) {
  const [state, setState] = useState<Omit<SyncState, "retry">>(empty);
  const retry = useRef(() => {});
  useEffect(() => {
    let disposed = false;
    let online = false;
    let taxonomyRequested = false;
    let running = false;
    let controller: AbortController | null = null;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let retryRequested = false;
    let failures = 0;
    let unavailable = false;
    async function run() {
      if (disposed || running || AppState.currentState !== "active") return;
      running = true;
      clearTimeout(timer);
      controller = new AbortController();
      const signal = controller.signal;
      if (!disposed)
        setState((current) => ({ ...current, syncing: true, message: "" }));
      let message = "";
      try {
        if (retryRequested) {
          retryRequested = false;
          await retryFailedPosts(user.id);
        }
        await syncPosts(user, token, signal);
        failures = 0;
        unavailable = false;
      } catch (error) {
        failures++;
        const authenticationFailure =
          error instanceof ApiError && [401, 403].includes(error.status);
        unavailable =
          error instanceof PostSyncUnavailableError || authenticationFailure;
        if (authenticationFailure) await revalidate().catch(() => {});
        if (!signal.aborted)
          message =
            error instanceof Error
              ? error.message
              : "Couldn't synchronize posts.";
      } finally {
        running = false;
        if (disposed) return;
        try {
          const db = await getAccountDatabase(user.id);
          const summary = await db.getFirstAsync<{
            pending: number;
            problems: number;
          }>(
            `SELECT COUNT(*) AS pending,COALESCE(SUM(CASE WHEN status!='pending' THEN 1 ELSE 0 END),0) AS problems FROM sync_queue`,
          );
          const next = await db.getFirstAsync<{ next: number | null }>(
            `SELECT MIN(next_attempt_at) AS next FROM sync_queue q WHERE status='pending'
             AND (q.operation_type='DELETE' OR EXISTS (SELECT 1 FROM posts p WHERE p.id=q.entity_id AND p.category_id IS NOT NULL AND p.category_id!=''))
             AND NOT EXISTS (SELECT 1 FROM sync_queue earlier WHERE earlier.entity_id=q.entity_id AND earlier.sequence<q.sequence)`,
          );
          const issues = await db.getAllAsync<{
            id: string;
            title: string;
            message: string;
            needsCategory: number;
          }>(
            `SELECT p.id,p.title,CASE WHEN (p.category_id IS NULL OR p.category_id='') AND p.is_deleted=0 THEN 1 ELSE 0 END AS needsCategory,
             CASE WHEN p.category_id IS NULL OR p.category_id='' THEN 'Choose a category to upload. Your draft or publish choice is saved on this phone.' ELSE COALESCE(q.last_error,'Review this change before uploading.') END AS message
             FROM posts p JOIN sync_queue q ON q.entity_id=p.id
             WHERE q.status!='pending' OR ((p.category_id IS NULL OR p.category_id='') AND p.is_deleted=0)
             GROUP BY p.id ORDER BY q.sequence LIMIT 5`,
          );
          if (disposed) return;
          setState((current) => ({
            revision: signal.aborted ? current.revision : current.revision + 1,
            pending: summary?.pending ?? 0,
            problems: summary?.problems ?? 0,
            syncing: false,
            message,
            issues,
          }));
          if (
            online &&
            summary?.pending &&
            next?.next != null &&
            !unavailable &&
            AppState.currentState === "active"
          )
            timer = setTimeout(
              () => {
                void run();
              },
              Math.max(
                5000,
                retryDelay(failures),
                (next.next ?? 0) - Date.now(),
              ),
            );
        } catch (error) {
          if (!disposed)
            setState((current) => ({
              ...current,
              syncing: false,
              message:
                error instanceof Error
                  ? error.message
                  : "Couldn't open offline storage.",
            }));
        }
      }
    }
    retry.current = () => {
      retryRequested = true;
      void run();
    };
    
    const unsubscribe = subscribePostChanges((id, server) => {
      if (id === user.id) {
        setState((current) => ({ ...current, revision: current.revision + 1 }));
        if (!server) void run();
      }
    });
    const network = NetInfo.addEventListener((state) => {
      online =
        state.isConnected === true && state.isInternetReachable !== false;
      if (online) {
        if (!taxonomyRequested) {
          taxonomyRequested = true;
          void postTaxonomy.categories(user.id).catch(() => {
            taxonomyRequested = false;
          });
        }
        void run();
      } else clearTimeout(timer);
    });
    const app = AppState.addEventListener("change", (value) => {
      if (value === "active") void run();
      else {
        controller?.abort();
        clearTimeout(timer);
      }
    });
    void run();
    return () => {
      disposed = true;
      controller?.abort();
      clearTimeout(timer);
      unsubscribe();
      network();
      app.remove();
    };
  }, [user, token, revalidate]);
  return (
    <PostSyncContext.Provider
      value={{ ...state, retry: () => retry.current() }}
    >
      {children}
    </PostSyncContext.Provider>
  );
}
