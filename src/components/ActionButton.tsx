import { Pressable, Text } from "react-native";

export default function ActionButton({
  label,
  onPress,
  disabled,
  destructive = false,
}: {
  label: string;
  onPress: () => void;
  disabled: boolean;
  destructive?: boolean;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      className="text-action min-h-11 justify-center"
      disabled={disabled}
      onPress={onPress}
    >
      <Text className={destructive ? "form-error" : "text-action-label"}>
        {label}
      </Text>
    </Pressable>
  );
}
