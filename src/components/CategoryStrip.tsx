import { clsx } from "clsx";
import {
  Pressable,
  ScrollView,
  Text,
  View,
  useWindowDimensions,
} from "react-native";
import type { Category } from "@/types/blog";

interface CategoryStripProps {
  categories: Category[];
  selected?: string;
  onSelect: (slug: string) => void;
  allLabel?: string;
}

export default function CategoryStrip({
  categories,
  selected = "",
  onSelect,
  allLabel = "All",
}: CategoryStripProps) {
  const { fontScale } = useWindowDimensions();
  const stripHeight = Math.max(44, Math.ceil(20 * fontScale + 16));

  return (
    <View className="category-strip">
      <ScrollView
        horizontal
        className="category-scroll"
        style={{ height: stripHeight }}
        contentContainerClassName="category-scroll-content"
        showsHorizontalScrollIndicator={false}
      >
        {[{ id: "all", slug: "", name: allLabel }, ...categories].map(
          (category) => (
            <Pressable
              key={category.id}
              accessibilityRole="tab"
              accessibilityState={{ selected: selected === category.slug }}
              className={clsx(
                "category-option",
                selected === category.slug && "category-selected",
              )}
              onPress={() => onSelect(category.slug)}
            >
              <Text
                className={clsx(
                  "category-label",
                  selected === category.slug && "category-label-selected",
                )}
              >
                {category.name}
              </Text>
            </Pressable>
          ),
        )}
      </ScrollView>
    </View>
  );
}
