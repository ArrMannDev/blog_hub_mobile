import { Platform } from "react-native";

export const colors = {
  light: {
    background: "#F2EDE3",
    surface: "#F7F3EA",
    navigation: "#C5D7BA",
    foreground: "#24251B",
    secondary: "#5D5C52",
    border: "#D9D6C9",
    controlBorder: "#827E6C",
    focus: "#625B35",
    destructive: "#963B32",
  },
  dark: {
    background: "#1D1E18",
    surface: "#272820",
    navigation: "#2C4232",
    foreground: "#F2EDE3",
    secondary: "#C7C3B7",
    border: "#45463A",
    controlBorder: "#8E8A78",
    focus: "#E8E0BC",
    destructive: "#F0B0A5",
  },
} as const;

export const fonts = {
  serif: "Lora_400Regular",
  italic: "Lora_400Regular_Italic",
  brand: "Lora_600SemiBold_Italic",
  mono: Platform.select({ ios: "Menlo", default: "monospace" }),
};

export const tabBar = { height: 64 } as const;
