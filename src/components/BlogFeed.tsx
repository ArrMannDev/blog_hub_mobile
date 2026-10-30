import { tabBar } from "@/constants/theme";
import { useBlogs } from "@/contexts/BlogContext";
import { useTheme } from "@/hooks/use-theme";
import { useBottomTabBarHeight } from "expo-router/js-tabs";
import {
  ActivityIndicator,
  FlatList,
  RefreshControl,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import ArticleCard from "./ArticleCard";
import StateMessage from "./StateMessage";

export default function BlogFeed({
  query = "",
  filtered = false,
}: {
  query?: string;
  filtered?: boolean;
}) {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const tabHeight = useBottomTabBarHeight();
  const { items, loading, refreshing, error, refresh, loadMore, retry } =
    useBlogs(query);

  return (
    <FlatList
      className="flex-1"
      data={items}
      keyExtractor={(item) => item.id}
      renderItem={({ item }) => <ArticleCard blog={item} />}
      contentContainerClassName="feed-content"
      contentContainerStyle={{
        paddingBottom: tabHeight + Math.max(insets.bottom, tabBar.inset) + 16,
      }}
      refreshControl={
        <RefreshControl
          refreshing={refreshing}
          onRefresh={refresh}
          tintColor={colors.foreground}
          colors={[colors.foreground]}
        />
      }
      onEndReached={loadMore}
      onEndReachedThreshold={0.4}
      ListEmptyComponent={
        loading ? (
          <View className="items-center py-12">
            <ActivityIndicator
              accessibilityLabel="Loading articles"
              color={colors.foreground}
            />
          </View>
        ) : error ? (
          <StateMessage
            title="A little trouble loading"
            description="We couldn't reach the articles. Please try again."
            action="Try again"
            onAction={retry}
          />
        ) : (
          <StateMessage
            title={
              filtered
                ? "No matching articles"
                : "The next good read is on its way"
            }
            description={
              filtered
                ? "Try another topic or adjust your search."
                : "There aren't any published articles yet. Pull down to refresh."
            }
          />
        )
      }
      ListFooterComponent={
        items.length > 0 ? (
          error ? (
            <StateMessage
              title="Your articles are still here"
              description="We couldn't update the list. Try loading it again."
              action="Try again"
              onAction={retry}
            />
          ) : loading && !refreshing ? (
            <ActivityIndicator
              className="py-6"
              color={colors.foreground}
              accessibilityLabel="Loading more articles"
            />
          ) : undefined
        ) : undefined
      }
    />
  );
}
