import Ionicons from "@expo/vector-icons/Ionicons";
import { useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  Text,
  TextInput,
  View,
  type TextInputProps,
} from "react-native";
import { useTheme } from "@/hooks/use-theme";

export function FormField({
  label,
  error,
  password = false,
  ...props
}: TextInputProps & {
  label: string;
  error?: string;
  password?: boolean;
}) {
  const { colors } = useTheme();
  const [visible, setVisible] = useState(false);
  return (
    <View className="mb-5">
      <Text className="field-label">{label}</Text>
      <View
        className={`form-field ${error ? "border-destructive" : "border-control-border"}`}
      >
        <TextInput
          autoCapitalize="none"
          autoCorrect={false}
          placeholderTextColor={colors.secondary}
          selectionColor={colors.focus}
          {...props}
          accessibilityLabel={label}
          accessibilityHint={error}
          secureTextEntry={password && !visible}
          className="min-h-12 flex-1 px-4 py-3 text-[16px] leading-[24px] text-foreground"
        />
        {password && (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`${visible ? "Hide" : "Show"} ${label.toLowerCase()}`}
            accessibilityState={{ disabled: props.editable === false }}
            disabled={props.editable === false}
            className="icon-button mr-1"
            onPress={() => setVisible((value) => !value)}
          >
            <Ionicons
              name={visible ? "eye-off-outline" : "eye-outline"}
              size={21}
              color={colors.secondary}
            />
          </Pressable>
        )}
      </View>
      {!!error && (
        <Text accessibilityLiveRegion="polite" className="form-error mt-2">
          {error}
        </Text>
      )}
    </View>
  );
}

export function SubmitButton({
  label,
  pendingLabel,
  busy,
  disabled,
  onPress,
}: {
  label: string;
  pendingLabel: string;
  busy: boolean;
  disabled?: boolean;
  onPress(): void;
}) {
  const { colors } = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled: busy || disabled, busy }}
      disabled={busy || disabled}
      onPress={onPress}
      className="action-button flex-row gap-2"
    >
      {busy && <ActivityIndicator size="small" color={colors.background} />}
      <Text className="action-label">{busy ? pendingLabel : label}</Text>
    </Pressable>
  );
}

export function FormMessage({
  children,
  error = false,
}: {
  children: string;
  error?: boolean;
}) {
  return (
    <Text
      accessibilityRole={error ? "alert" : undefined}
      accessibilityLiveRegion="polite"
      className={error ? "form-error mb-5" : "form-description mb-5"}
    >
      {children}
    </Text>
  );
}
