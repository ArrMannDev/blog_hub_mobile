import { Pressable, Text, View } from "react-native";

interface StateMessageProps {
  title: string;
  description: string;
  action?: string;
  onAction?: () => void;
}

export default function StateMessage({
  title,
  description,
  action,
  onAction,
}: StateMessageProps) {
  return (
    <View className="items-center px-6 py-10" accessibilityLiveRegion="polite">
      <Text className="state-title">{title}</Text>
      <Text className="state-description">{description}</Text>
      {action && onAction && (
        <Pressable
          accessibilityRole="button"
          className="text-action mt-3"
          onPress={onAction}
        >
          <Text className="text-action-label">{action}</Text>
        </Pressable>
      )}
    </View>
  );
}
