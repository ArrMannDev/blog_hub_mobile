import { useState } from "react";
import { Pressable, Text, View } from "react-native";
import { formatDate, initials } from "@/lib/reading";
import AuthorProfileSheet from "./AuthorProfileSheet";

export default function AuthorLine({
  author,
  date,
}: {
  author: { id: string; displayName: string };
  date: string | null;
}) {
  const [open, setOpen] = useState(false);
  return (
    <View className="flex-row items-center justify-between gap-3">
      <Pressable
        className="author-row min-h-11 min-w-0 flex-1"
        accessibilityRole="button"
        accessibilityLabel={`View ${author.displayName}'s profile`}
        onPress={() => setOpen(true)}
      >
        <View className="author-avatar" accessible={false}>
          <Text className="author-initials">
            {initials(author.displayName)}
          </Text>
        </View>
        <Text className="author-name" numberOfLines={1}>
          {author.displayName}
        </Text>
      </Pressable>
      <Text className="flex-none text-[12px] leading-4.5 text-secondary">
        {formatDate(date)}
      </Text>
      {open && (
        <AuthorProfileSheet author={author} onClose={() => setOpen(false)} />
      )}
    </View>
  );
}
