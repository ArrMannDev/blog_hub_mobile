import { Text, View } from "react-native";
import { initials } from "@/lib/reading";

export default function AuthorLine({ name }: { name: string }) {
  return (
    <View className="author-row">
      <View className="author-avatar" accessible={false}>
        <Text className="author-initials">{initials(name)}</Text>
      </View>
      <Text className="author-name">{name}</Text>
    </View>
  );
}
