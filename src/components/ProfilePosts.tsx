import { useMyBlogs } from "@/hooks/use-my-blogs";
import { useTheme } from "@/hooks/use-theme";
import type { AuthUser } from "@/types/auth";
import type { BlogStatus } from "@/types/blog";
import { useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  RefreshControl,
  Text,
  View,
} from "react-native";
import ArticleCard from "./ArticleCard";
import ProfileHeader from "./ProfileHeader";
import StateMessage from "./StateMessage";

export default function ProfilePosts({ user }: { user: AuthUser }) {
  const [status, setStatus] = useState<BlogStatus>("published");
  // Mount a fresh private list for each account/status, rather than sharing public feed caches.
  return (
    <PostList
      key={`${user.id}:${status}`}
      user={user}
      status={status}
      onSelect={setStatus}
    />
  );
}

function PostList({
  user,
  status,
  onSelect,
}: {
  user: AuthUser;
  status: BlogStatus;
  onSelect(status: BlogStatus): void;
}) {
  const { colors } = useTheme();
  const { items, loading, refreshing, error, refresh, loadMore, retry } =
    useMyBlogs(status);
  return (
    <FlatList
      className="flex-1"
      data={items}
      keyExtractor={(item) => item.id}
      renderItem={({ item }) => <ArticleCard blog={item} editable />}
      contentContainerStyle={{
        paddingBottom: 16,
      }}
      onEndReached={loadMore}
      onEndReachedThreshold={0.4}
      refreshControl={
        <RefreshControl
          refreshing={refreshing}
          onRefresh={refresh}
          tintColor={colors.foreground}
          colors={[colors.foreground]}
        />
      }
      ListHeaderComponent={
        <>
          <ProfileHeader user={user} />
          <View className="border-t border-border px-5 pt-5">
            <View
              className="mt-3 flex-row gap-6 border-b border-border"
              accessibilityRole="tablist"
            >
              {(["published", "draft"] as const).map((value) => (
                <Pressable
                  key={value}
                  accessibilityRole="tab"
                  accessibilityState={{ selected: status === value }}
                  onPress={() => onSelect(value)}
                  className={`category-option ${status === value ? "category-selected" : ""}`}
                >
                  <Text
                    className={`category-label ${status === value ? "category-label-selected" : ""}`}
                  >
                    {value === "published" ? "Published" : "Drafts"}
                  </Text>
                </Pressable>
              ))}
            </View>
          </View>
        </>
      }
      ListEmptyComponent={
        loading ? (
          <View className="items-center py-10">
            <ActivityIndicator
              color={colors.foreground}
              accessibilityLabel="Loading your posts"
            />
          </View>
        ) : error ? (
          <StateMessage
            title="Couldn't load your posts"
            description={error}
            action="Try again"
            onAction={retry}
          />
        ) : (
          <StateMessage
            title={
              status === "draft" ? "No drafts yet" : "No published posts yet"
            }
            description={
              status === "draft"
                ? "Your saved drafts will appear here."
                : "Your published stories will appear here."
            }
          />
        )
      }
      ListFooterComponent={
        items.length > 0 ? (
          error ? (
            <StateMessage
              title="Your posts are still here"
              description={error}
              action="Try again"
              onAction={retry}
            />
          ) : loading && !refreshing ? (
            <ActivityIndicator
              className="py-6"
              color={colors.foreground}
              accessibilityLabel="Loading more posts"
            />
          ) : undefined
        ) : undefined
      }
    />
  );
}
