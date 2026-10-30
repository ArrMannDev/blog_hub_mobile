import type { PropsWithChildren } from "react";
import { View } from "react-native";
import { styled } from "nativewind";
import {
  SafeAreaView as RNSafeAreaView,
  type Edge,
} from "react-native-safe-area-context";

const SafeAreaView = styled(RNSafeAreaView);

export default function Screen({
  children,
  edges = ["top", "left", "right"],
}: PropsWithChildren<{ edges?: Edge[] }>) {
  return (
    <SafeAreaView edges={edges} className="flex-1 bg-background">
      <View className="screen-content">{children}</View>
    </SafeAreaView>
  );
}
