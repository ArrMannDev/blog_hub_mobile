import { tabs } from "@/constants/data";
import { tabBar } from "@/constants/theme";
import { useAuth } from "@/contexts/AuthContext";
import { useTheme } from "@/hooks/use-theme";
import Ionicons from "@expo/vector-icons/Ionicons";
import { router, Tabs } from "expo-router";
import { Pressable, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

export default function TabLayout() {
  const insets = useSafeAreaInsets();
  const { colors } = useTheme();
  const { isAuthenticated } = useAuth();

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarShowLabel: true,
        tabBarHideOnKeyboard: true,
        tabBarActiveTintColor: colors.foreground,
        tabBarInactiveTintColor: colors.secondary,
        tabBarStyle: {
          height: tabBar.height + insets.bottom,
          paddingBottom: insets.bottom,
          paddingTop: 6,
          backgroundColor: colors.navigation,
          borderTopColor: colors.border,
          borderTopWidth: 1,
          elevation: 0,
        },
        tabBarItemStyle: {
          flex: 1,
          alignItems: "center",
          justifyContent: "center",
        },
        tabBarLabelPosition: "below-icon",
        tabBarLabelStyle: {
          fontSize: 12,
          lineHeight: 18,
          fontWeight: "600",
          marginTop: 2,
        },
        tabBarIconStyle: { width: 28, height: 28, margin: 0 },
        tabBarButton: ({
          children,
          onPress,
          onLongPress,
          accessibilityLabel,
          accessibilityState,
          "aria-label": ariaLabel,
          "aria-selected": selected,
          testID,
        }) => (
          <Pressable
            className="tab-button"
            accessibilityRole="tab"
            accessibilityLabel={ariaLabel ?? accessibilityLabel}
            accessibilityState={{
              ...accessibilityState,
              selected: selected ?? accessibilityState?.selected,
            }}
            testID={testID}
            onPress={onPress}
            onLongPress={onLongPress}
          >
            {children}
          </Pressable>
        ),
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
            // Keep Explore registered for Home search; its tab slot becomes the create action.
            ...(tab.name === "explore"
              ? {
                  tabBarButton: () => (
                    <Pressable
                      className="tab-button"
                      accessibilityRole="button"
                      accessibilityLabel="Create a post"
                      onPress={() =>
                        router.push(
                          isAuthenticated
                            ? "/posts/new"
                            : {
                                pathname: "/auth/[action]",
                                params: { action: "sign-in" },
                              },
                        )
                      }
                    >
                      <View
                        className="h-10 w-16 items-center justify-center rounded-lg bg-foreground"
                        accessible={false}
                      >
                        <Ionicons
                          name="add"
                          size={30}
                          color={colors.background}
                          style={{ lineHeight: 30 }}
                        />
                      </View>
                    </Pressable>
                  ),
                }
              : {}),
            tabBarIcon: ({ focused }) => (
              <Ionicons
                name={focused ? tab.activeIcon : tab.icon}
                size={26}
                color={focused ? colors.foreground : colors.secondary}
                style={{ lineHeight: 28 }}
              />
            ),
          }}
        />
      ))}
    </Tabs>
  );
}
