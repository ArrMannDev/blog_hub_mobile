import { FormMessage } from "@/components/AuthFields";
import Screen from "@/components/Screen";
import { useAuth } from "@/contexts/AuthContext";
import { BlogContext } from "@/contexts/BlogContext";
import { useTheme } from "@/hooks/use-theme";
import { ApiError } from "@/lib/api";
import {
    canDeleteTaxonomy,
    canEditTaxonomy,
    taxonomyApi,
} from "@/lib/taxonomy-api";
import type { AuthUser } from "@/types/auth";
import type { TaxonomyEntry } from "@/types/taxonomy";
import Ionicons from "@expo/vector-icons/Ionicons";
import {
    Link,
    Redirect,
    router,
    useFocusEffect,
    useLocalSearchParams,
} from "expo-router";
import { useCallback, useContext, useRef, useState } from "react";
import {
    ActivityIndicator,
    Alert,
    FlatList,
    Platform,
    Pressable,
    Text,
    View,
} from "react-native";

export default function TopicsScreen() {
  const { user, isRestoring } = useAuth();
  const { categoryId = "", categoryName = "" } = useLocalSearchParams<{
    categoryId?: string;
    categoryName?: string;
  }>();
  if (isRestoring)
    return (
      <Screen>
        <ActivityIndicator accessibilityLabel="Checking session" />
      </Screen>
    );
  if (!user)
    return (
      <Redirect
        href={{ pathname: "/auth/[action]", params: { action: "sign-in" } }}
      />
    );
  return (
    <Topics
      key={`${user.id}:${categoryId}`}
      user={user}
      categoryId={categoryId}
      categoryName={categoryName}
    />
  );
}

function Topics({
  user,
  categoryId,
  categoryName,
}: {
  user: AuthUser;
  categoryId: string;
  categoryName: string;
}) {
  const kind = categoryId ? "tags" : "categories";
  const singular = categoryId ? "tag" : "category";
  const { colors } = useTheme();
  const { getAccessToken } = useAuth();
  const cache = useContext(BlogContext);
  const [items, setItems] = useState<TaxonomyEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [attempt, setAttempt] = useState(0);
  const [busy, setBusy] = useState(false);
  const pending = useRef(false);

  useFocusEffect(
    useCallback(() => {
      setLoading(true);
      const controller = new AbortController();
      taxonomyApi
        .list(kind, categoryId, controller.signal)
        .then((result) => {
          if (!controller.signal.aborted) {
            setItems(result);
            setError("");
          }
        })
        .catch(() => {
          if (!controller.signal.aborted)
            setError("Couldn't load this list. Refresh to try again.");
        })
        .finally(() => {
          if (!controller.signal.aborted) setLoading(false);
        });
      return () => controller.abort();
      // Pull-to-refresh replaces the focused callback to reload the list.
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [kind, categoryId, attempt]),
  );

  function refresh() {
    setLoading(true);
    setAttempt((value) => value + 1);
  }

  async function remove(entry: TaxonomyEntry) {
    if (pending.current || !canDeleteTaxonomy(entry, user)) return;
    pending.current = true;
    setBusy(true);
    setError("");
    try {
      const token = await getAccessToken();
      try {
        await taxonomyApi.remove(kind, entry.id, token);
      } catch (failure) {
        if (!(failure instanceof ApiError) || failure.status !== 404)
          throw failure;
      }
      setItems((current) => current.filter((item) => item.id !== entry.id));
      cache?.invalidate();
      refresh();
    } catch (failure) {
      setError(
        failure instanceof Error
          ? failure.message
          : "Couldn't delete this item.",
      );
    } finally {
      pending.current = false;
      setBusy(false);
    }
  }

  function confirmDelete(entry: TaxonomyEntry) {
    if (pending.current || !canDeleteTaxonomy(entry, user)) return;
    const message = `Delete “${entry.name}” permanently? ${
      categoryId
        ? "It will be removed from every post."
        : "All tags in this category will also be deleted, including tags made by other authors. Posts will become Uncategorized."
    } Post content is kept. This cannot be undone.`;
    if (Platform.OS === "web") {
      if (window.confirm(message)) void remove(entry);
    } else {
      Alert.alert(`Delete ${singular}?`, message, [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete",
          style: "destructive",
          onPress: () => {
            void remove(entry);
          },
        },
      ]);
    }
  }

  const editParams = { kind, categoryId, categoryName };
  return (
    <Screen edges={["top", "bottom", "left", "right"]}>
      <View className="screen-header">
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Go back"
          className="icon-button -ml-3"
          onPress={() =>
            router.canGoBack()
              ? router.back()
              : router.replace("/(tabs)/profile")
          }
        >
          <Ionicons
            name="arrow-back-outline"
            size={24}
            color={colors.foreground}
          />
        </Pressable>
        <Text className="font-brand text-[16px] text-foreground">BlogHub</Text>
      </View>
      <FlatList
        data={items}
        keyExtractor={(item) => item.id}
        refreshing={loading}
        onRefresh={refresh}
        contentContainerClassName="px-5 pb-6"
        ListHeaderComponent={
          <View className="pt-4 pb-3">
            <Text className="screen-title" accessibilityRole="header">
              {categoryId ? "Tags" : "Categories"}
            </Text>
            <Text className="form-description mt-2 mb-4">
              {categoryId
                ? `Labels within ${categoryName || "this category"}.`
                : "Main topics for posts. Open a category to manage its tags."}{" "}
              These are shared across BlogHub.{" "}
              {user.permissions?.includes("taxonomy.delete")
                ? "You can rename your own entries and delete any entry."
                : "You can rename and delete only entries you created."}
            </Text>
            <Link
              href={{ pathname: "/topics/edit", params: editParams }}
              asChild
            >
              <Pressable
                className="secondary-button flex-row gap-2"
                accessibilityRole="link"
                disabled={busy}
              >
                <Ionicons
                  name="add-outline"
                  size={22}
                  color={colors.foreground}
                />
                <Text className="text-[14px] leading-5 font-semibold text-foreground">
                  Add {singular}
                </Text>
              </Pressable>
            </Link>
            {!!error && (
              <View className="mt-4">
                <FormMessage error>{error}</FormMessage>
                <Pressable
                  className="text-action"
                  accessibilityRole="button"
                  onPress={refresh}
                >
                  <Text className="text-action-label">Refresh list</Text>
                </Pressable>
              </View>
            )}
            {busy && (
              <ActivityIndicator
                className="mt-3"
                color={colors.foreground}
                accessibilityLabel="Deleting item"
              />
            )}
          </View>
        }
        ListEmptyComponent={
          !loading && !error ? (
            <Text className="form-description py-6">
              No {kind} yet. Add the first {singular}.
            </Text>
          ) : undefined
        }
        renderItem={({ item }) => (
          <View className="border-b border-border py-3">
            {categoryId ? (
              <Text className="text-[17px] leading-6 font-semibold text-foreground">
                #{item.name}
              </Text>
            ) : (
              <Link
                href={{
                  pathname: "/topics",
                  params: { categoryId: item.id, categoryName: item.name },
                }}
                asChild
              >
                <Pressable
                  accessibilityRole="link"
                  className="min-h-11 flex-row items-center gap-3"
                  disabled={busy}
                >
                  <Text className="flex-1 text-[17px] leading-6 font-semibold text-foreground">
                    {item.name}
                  </Text>
                  <Text className="text-[13px] leading-5 text-secondary">
                    Manage tags
                  </Text>
                  <Ionicons
                    name="chevron-forward"
                    size={18}
                    color={colors.secondary}
                  />
                </Pressable>
              </Link>
            )}
            <View className="flex-row gap-4">
              {canEditTaxonomy(item, user) && (
                <Link
                  href={{
                    pathname: "/topics/edit",
                    params: { ...editParams, id: item.id, name: item.name },
                  }}
                  asChild
                >
                  <Pressable
                    accessibilityRole="link"
                    accessibilityLabel={`Rename ${item.name}`}
                    className="text-action"
                    disabled={busy}
                  >
                    <Text className="text-action-label">Rename</Text>
                  </Pressable>
                </Link>
              )}
              {canDeleteTaxonomy(item, user) && (
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={`Delete ${item.name}`}
                  className="text-action"
                  disabled={busy}
                  onPress={() => confirmDelete(item)}
                >
                  <Text className="text-action-label text-destructive">
                    Delete
                  </Text>
                </Pressable>
              )}
            </View>
          </View>
        )}
      />
    </Screen>
  );
}
