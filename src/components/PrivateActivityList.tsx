import Ionicons from "@expo/vector-icons/Ionicons";
import { router } from "expo-router";
import type { ReactNode } from "react";
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  Text,
  View,
  type ListRenderItem,
} from "react-native";
import { useTheme } from "@/hooks/use-theme";
import Screen from "./Screen";
import StateMessage from "./StateMessage";

export default function PrivateActivityList<T extends { id: string }>({
  title,
  description,
  empty,
  feed,
  renderItem,
  children,
}: {
  title: string;
  description: string;
  empty: string;
  children?: ReactNode;
  feed: {
    items: T[];
    loading: boolean;
    error: string;
    refresh(): void;
    retry(): void;
    loadMore(): void;
  };
  renderItem: ListRenderItem<T>;
}) {
  const { colors } = useTheme();
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
        data={feed.items}
        keyExtractor={(item) => item.id}
        renderItem={renderItem}
        contentContainerClassName="px-5 pb-8"
        refreshing={feed.loading && feed.items.length > 0}
        onRefresh={feed.refresh}
        onEndReached={feed.loadMore}
        onEndReachedThreshold={0.4}
        ListHeaderComponent={
          <View className="pt-4 pb-4">
            <Text className="screen-title" accessibilityRole="header">
              {title}
            </Text>
            <Text className="form-description mt-2">{description}</Text>
            {children}
          </View>
        }
        ListEmptyComponent={
          !feed.loading && !feed.error ? (
            <StateMessage
              title={empty}
              description="Pull down to check for updates."
            />
          ) : undefined
        }
        ListFooterComponent={
          feed.loading ? (
            <ActivityIndicator
              className="py-6"
              color={colors.foreground}
              accessibilityLabel={`Loading ${title.toLowerCase()}`}
            />
          ) : feed.error ? (
            <StateMessage
              title="Couldn't load this"
              description={feed.error}
              action="Try again"
              onAction={feed.retry}
            />
          ) : undefined
        }
      />
    </Screen>
  );
}
