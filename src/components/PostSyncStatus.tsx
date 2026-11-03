import { Alert, Platform, Pressable, Text, View } from "react-native";
import { useState } from "react";
import { Link } from "expo-router";
import { usePostSync } from "@/contexts/PostSyncContext";
import { useAuth } from "@/contexts/AuthContext";
import { postCrud } from "@/lib/post-crud";

export default function PostSyncStatus() {
  const { pending, problems, syncing, message, retry, issues } = usePostSync();
  const { user, getAccessToken } = useAuth();
  const [discarding, setDiscarding] = useState(false);
  const [error, setError] = useState("");
  function discard(id: string) {
    if (!user || discarding) return;
    const run = async () => {
      setDiscarding(true);
      setError("");
      try {
        await postCrud.discardLocal(user, { id }, getAccessToken);
      } catch (failure) {
        setError(
          failure instanceof Error
            ? failure.message
            : "Could not load the server copy.",
        );
      } finally {
        setDiscarding(false);
      }
    };
    const description =
      "Discard unsynced changes on this phone and load the server copy? This also cancels any pending deletion.";
    if (Platform.OS === "web") {
      if (window.confirm(description)) void run();
    } else
      Alert.alert("Discard local changes?", description, [
        { text: "Keep changes", style: "cancel" },
        {
          text: "Discard local changes",
          style: "destructive",
          onPress: () => {
            void run();
          },
        },
      ]);
  }
  if (!pending) return null;
  return (
    <View className="mx-5 mb-4 rounded-xl border border-border bg-surface p-4">
      <Text className="text-[14px] leading-[20px] font-semibold text-foreground">
        {syncing
          ? "Uploading saved changes…"
          : `${pending} local changes waiting to upload`}
      </Text>
      <Text className="form-description mt-1">
        {problems
          ? "Some changes need attention. Open a post’s menu to review it or discard its local changes."
          : "Ready posts upload when connected with the app open. Posts without a category stay on this phone until you choose one."}
      </Text>
      {!!message && <Text className="form-error mt-2">{message}</Text>}
      {issues.map((issue) => (
        <View key={issue.id} className="mt-3 border-t border-border pt-3">
          <Text className="text-[14px] leading-[20px] font-semibold text-foreground">
            {issue.title}
          </Text>
          <Text className="form-description mt-1">{issue.message}</Text>
          {!!issue.needsCategory && (
            <Link
              href={{ pathname: "/posts/[id]/edit", params: { id: issue.id } }}
              asChild
            >
              <Pressable
                accessibilityRole="link"
                className="text-action mt-1"
                disabled={syncing || discarding}
              >
                <Text className="text-action-label">Choose category</Text>
              </Pressable>
            </Link>
          )}
          <Pressable
            accessibilityRole="button"
            disabled={syncing || discarding}
            className="text-action mt-1"
            onPress={() => discard(issue.id)}
          >
            <Text className="text-action-label">Discard local changes</Text>
          </Pressable>
        </View>
      ))}
      {!!error && <Text className="form-error mt-2">{error}</Text>}
      <Pressable
        accessibilityRole="button"
        className="text-action mt-2"
        onPress={retry}
        disabled={syncing}
      >
        <Text className="text-action-label">Retry uploads</Text>
      </Pressable>
    </View>
  );
}
