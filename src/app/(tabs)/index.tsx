import Ionicons from "@expo/vector-icons/Ionicons";
import { Link } from "expo-router";
import { useState } from "react";
import { Pressable, Text, View } from "react-native";
import Screen from "@/components/Screen";
import BlogFeed from "@/components/BlogFeed";
import CategoryStrip from "@/components/CategoryStrip";
import { useCategories } from "@/hooks/use-categories";
import { useTheme } from "@/hooks/use-theme";
import { filterQuery } from "@/lib/reading";

export default function HomeScreen() {
  const [category, setCategory] = useState("");
  const { categories, error, retry } = useCategories();
  const { colors } = useTheme();

  return (
    <Screen>
      <View className="screen-header">
        <Text className="brand" accessibilityRole="header">
          BlogHub
        </Text>
        <View className="flex-row items-center gap-1">
          <Link href="/explore" asChild>
            <Pressable
              className="icon-button"
              accessibilityRole="link"
              accessibilityLabel="Search articles"
            >
              <Ionicons
                name="search-outline"
                size={22}
                color={colors.foreground}
              />
            </Pressable>
          </Link>
        </View>
      </View>
      <CategoryStrip
        categories={categories}
        selected={category}
        onSelect={setCategory}
      />
      {error && (
        <Pressable
          className="text-action px-5"
          accessibilityRole="button"
          onPress={retry}
        >
          <Text className="text-action-label">
            Could not load topics. Try again
          </Text>
        </Pressable>
      )}
      <BlogFeed
        key={category}
        query={filterQuery({ category })}
        filtered={!!category}
      />
    </Screen>
  );
}
