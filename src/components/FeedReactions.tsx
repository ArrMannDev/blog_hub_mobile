import { useCallback, useState } from "react";
import { router, useFocusEffect } from "expo-router";
import { useAuth } from "@/contexts/AuthContext";
import { discussionApi } from "@/lib/discussion-api";
import ReactionBar from "./ReactionBar";

export default function FeedReactions({
  id,
  slug,
}: {
  id: string;
  slug: string;
}) {
  const { user } = useAuth();
  const [count, setCount] = useState<number>();
  useFocusEffect(
    useCallback(() => {
      const controller = new AbortController();
      discussionApi
        .commentCount(id, controller.signal)
        .then((total) => {
          if (!controller.signal.aborted) setCount(total);
        })
        .catch(() => {
          if (!controller.signal.aborted) setCount(undefined);
        });
      return () => controller.abort();
    }, [id]),
  );
  return (
    <ReactionBar
      key={`${id}:${user?.id ?? "guest"}`}
      kind="blogs"
      id={id}
      commentCount={count}
      onComment={() =>
        router.push({
          pathname: "/blogs/[slug]",
          params: { slug, comments: "1" },
        })
      }
    />
  );
}
