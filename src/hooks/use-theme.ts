import { useColorScheme } from "react-native";
import { colors } from "@/constants/theme";

export function useTheme() {
  const isDark = useColorScheme() === "dark";
  return { colors: colors[isDark ? "dark" : "light"], isDark };
}
