import { Text, View } from "react-native";
import { formatDate, initials } from "@/lib/reading";

export default function AuthorLine({
  name,
  date,
}: {
  name: string;
  date: string | null;
}) {
  return (
    <View className="flex-row items-center justify-between gap-3">
      <View className="author-row min-w-0 flex-1">
        <View className="author-avatar" accessible={false}>
          <Text className="author-initials">{initials(name)}</Text>
        </View>
        <Text className="author-name" numberOfLines={1}>
          {name}
        </Text>
      </View>
      <Text className="flex-none text-[12px] leading-4.5 text-secondary">
        {formatDate(date)}
      </Text>
    </View>
  );
}
