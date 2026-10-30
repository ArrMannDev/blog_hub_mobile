import { tabs } from "@/constants/data";
import { tabBar } from "@/constants/theme";
import { useTheme } from "@/hooks/use-theme";
import Ionicons from "@expo/vector-icons/Ionicons";
import { clsx } from "clsx";
import { BlurView } from "expo-blur";
import { Tabs } from "expo-router";
import { styled } from "nativewind";
import { Pressable, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

const GlassBackground = styled(BlurView);

export default function TabLayout() {
  const insets = useSafeAreaInsets();
  const { colors, isDark } = useTheme();

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarShowLabel: false,
        tabBarHideOnKeyboard: true,
        tabBarStyle: {
          position: "absolute",
          bottom: Math.max(insets.bottom, tabBar.inset),
          height: tabBar.height,
          marginHorizontal: tabBar.inset,
          borderRadius: tabBar.radius,
          backgroundColor: "transparent",
          overflow: "hidden",
          borderTopWidth: 0,
          paddingBottom: 0,
          paddingTop: 0,
          elevation: 0,
        },
        tabBarItemStyle: {
          flex: 1,
          alignItems: "center",
          justifyContent: "center",
          padding: 0,
        },
        tabBarLabelPosition: "below-icon",
        tabBarButton: ({
          children,
          onPress,
          onLongPress,
          accessibilityLabel,
          accessibilityState,
          testID,
        }) => (
          <Pressable
            className="tab-button"
            accessibilityRole="tab"
            accessibilityLabel={accessibilityLabel}
            accessibilityState={accessibilityState}
            testID={testID}
            onPress={onPress}
            onLongPress={onLongPress}
          >
            {children}
          </Pressable>
        ),
        // shortcut: Android uses a translucent tint; add a BlurTargetView when Android blur is required.
        tabBarBackground: () => (
          <GlassBackground
            tint={
              isDark
                ? "systemUltraThinMaterialDark"
                : "systemUltraThinMaterialLight"
            }
            intensity={35}
            className="absolute inset-0 rounded-4xl border border-white/30 bg-[#808080]/10"
          />
        ),
        tabBarIconStyle: {
          width: tabBar.iconSize,
          height: tabBar.iconSize,
          alignItems: "center",
          justifyContent: "center",
          margin: 0,
          transform: [{ translateY: -3 }],
        },
        sceneStyle: { backgroundColor: colors.background },
      }}
    >
      {tabs.map((tab) => (
        <Tabs.Screen
          key={tab.name}
          name={tab.name}
          options={{
            title: tab.title,
            tabBarAccessibilityLabel: tab.title,
            tabBarIcon: ({ focused }) => (
              <View className={clsx("tab-icon", focused && "tab-icon-active")}>
                <Ionicons
                  name={focused ? tab.activeIcon : tab.icon}
                  size={24}
                  style={{ lineHeight: 24, textAlign: "center" }}
                  color={focused ? colors.foreground : colors.secondary}
                />
              </View>
            ),
          }}
        />
      ))}
    </Tabs>
  );
}
