import { BlogProvider } from "@/contexts/BlogContext";
import { Lora_700Bold } from "@expo-google-fonts/lora/700Bold";
import "@/global.css";
import { Lora_400Regular } from "@expo-google-fonts/lora/400Regular";
import { Lora_400Regular_Italic } from "@expo-google-fonts/lora/400Regular_Italic";
import { Lora_600SemiBold_Italic } from "@expo-google-fonts/lora/600SemiBold_Italic";
import { useFonts } from "expo-font";
import { Stack, ThemeProvider, DarkTheme, DefaultTheme } from "expo-router";
import * as SplashScreen from "expo-splash-screen";
import { StatusBar } from "expo-status-bar";
import { useEffect } from "react";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { useTheme } from "@/hooks/use-theme";

void SplashScreen.preventAutoHideAsync();

export default function RootLayout() {
  const { colors, isDark } = useTheme();
  const [loaded, error] = useFonts({
    Lora_700Bold,
    Lora_400Regular,
    Lora_400Regular_Italic,
    Lora_600SemiBold_Italic,
  });

  useEffect(() => {
    if (loaded || error) void SplashScreen.hideAsync();
  }, [loaded, error]);

  if (!loaded && !error) return null;
  const base = isDark ? DarkTheme : DefaultTheme;

  return (
    <SafeAreaProvider>
      <ThemeProvider
        value={{
          ...base,
          colors: {
            ...base.colors,
            background: colors.background,
            card: colors.background,
            text: colors.foreground,
            primary: colors.foreground,
            border: colors.border,
          },
        }}
      >
        <BlogProvider>
          <StatusBar style={isDark ? "light" : "dark"} />
          <Stack
            screenOptions={{
              headerShown: false,
              contentStyle: { backgroundColor: colors.background },
            }}
          />
        </BlogProvider>
      </ThemeProvider>
    </SafeAreaProvider>
  );
}
