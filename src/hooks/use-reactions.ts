import { useCallback, useRef, useState } from "react";
import { useFocusEffect } from "expo-router";
import { useAuth } from "@/contexts/AuthContext";
import { discussionApi } from "@/lib/discussion-api";
import type { ReactionSummary, ReactionType } from "@/types/discussion";

export function useReactions(kind: "blogs" | "comments", id: string) {
  const { user, getAccessToken } = useAuth();
  const [summary, setSummary] = useState<ReactionSummary>({
    likeCount: 0,
    dislikeCount: 0,
    myReaction: null,
  });
  const [ready, setReady] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const pending = useRef(false);
  const scope = useRef<AbortController | null>(null);
  const generation = useRef(0);
  const read = useCallback(
    async (signal: AbortSignal) => {
      const token = user ? await getAccessToken() : undefined;
      if (signal.aborted) return;
      return discussionApi.reactions(kind, id, token, signal);
    },
    [kind, id, user, getAccessToken],
  );
  const refresh = useCallback(async () => {
    const signal = scope.current?.signal;
    if (!signal || signal.aborted || pending.current) return;
    const ticket = ++generation.current;
    setError("");
    setReady(false);
    try {
      const result = await read(signal);
      if (result && !signal.aborted && ticket === generation.current) {
        setSummary(result);
        setReady(true);
      }
    } catch (failure) {
      if (!signal.aborted && ticket === generation.current)
        setError(
          failure instanceof Error
            ? failure.message
            : "Couldn't load reactions.",
        );
    }
  }, [read]);
  useFocusEffect(
    useCallback(() => {
      const controller = new AbortController();
      scope.current = controller;
      void refresh();
      return () => {
        controller.abort();
        generation.current++;
      };
    }, [refresh]),
  );
  async function react(type: ReactionType) {
    const signal = scope.current?.signal;
    if (!user || !ready || pending.current || !signal || signal.aborted) return;
    const ticket = ++generation.current;
    pending.current = true;
    setBusy(true);
    setError("");
    try {
      const token = await getAccessToken();
      if (signal.aborted) return;
      const result = await discussionApi.react(kind, id, type, token);
      if (!signal.aborted && ticket === generation.current) setSummary(result);
    } catch {
      // A toggle is not idempotent: read the result instead of replaying a timed-out write.
      if (!signal.aborted) {
        setReady(false);
        try {
          const result = await read(signal);
          if (result && !signal.aborted && ticket === generation.current) {
            setSummary(result);
            setReady(true);
          }
        } catch {
          /* Keep toggles disabled until the authoritative read succeeds. */
        }
        if (!signal.aborted)
          setError(
            "Couldn't confirm the reaction. Counts were refreshed where possible; check before reacting again.",
          );
      }
    } finally {
      pending.current = false;
      if (scope.current && !scope.current.signal.aborted) {
        setBusy(false);
        if (signal.aborted) void refresh();
      }
    }
  }
  return { ...summary, ready, busy, error, react, refresh };
}
