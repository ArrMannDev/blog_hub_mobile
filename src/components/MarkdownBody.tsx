import { fonts } from "@/constants/theme";
import { useTheme } from "@/hooks/use-theme";
import { safeLink } from "@/lib/reading";
import { Linking, ScrollView, Text, View } from "react-native";
import Markdown, {
    MarkdownIt,
    type RenderRules,
} from "react-native-markdown-display";
import ArticleImage from "./ArticleImage";

const parser = MarkdownIt({ html: false, linkify: true, typographer: true });

const rules: RenderRules = {
  fence: (node) => (
    <ScrollView
      key={node.key}
      horizontal
      className="my-4 rounded-lg bg-surface"
      contentContainerClassName="p-4"
    >
      <Text
        style={{ fontFamily: fonts.mono }}
        className="text-[14px] leading-5.5 text-foreground"
        selectable
      >
        {node.content.trimEnd()}
      </Text>
    </ScrollView>
  ),
  code_block: (node) => (
    <ScrollView
      key={node.key}
      horizontal
      className="my-4 rounded-lg bg-surface"
      contentContainerClassName="p-4"
    >
      <Text
        style={{ fontFamily: fonts.mono }}
        className="text-[14px] leading-5.5 text-foreground"
        selectable
      >
        {node.content.trimEnd()}
      </Text>
    </ScrollView>
  ),
  table: (node, children) => (
    <ScrollView key={node.key} horizontal className="my-4">
      <View className="border border-border">{children}</View>
    </ScrollView>
  ),
  image: (node) => (
    <View key={node.key} className="my-4">
      <ArticleImage
        url={
          typeof node.attributes.src === "string" ? node.attributes.src : null
        }
        alt={
          typeof node.attributes.alt === "string"
            ? node.attributes.alt
            : undefined
        }
      />
    </View>
  ),
};

export default function MarkdownBody({ content }: { content: string }) {
  const { colors } = useTheme();
  return (
    <Markdown
      markdownit={parser}
      rules={rules}
      onLinkPress={(url) => {
        if (safeLink(url)) void Linking.openURL(url).catch(() => {});
        return false;
      }}
      style={{
        body: {
          fontFamily: fonts.serif,
          fontSize: 18,
          lineHeight: 29,
          color: colors.foreground,
        },
        heading1: {
          fontFamily: fonts.serif,
          fontSize: 26,
          lineHeight: 35,
          marginTop: 24,
          marginBottom: 8,
        },
        heading2: {
          fontFamily: fonts.serif,
          fontSize: 24,
          lineHeight: 32,
          marginTop: 24,
          marginBottom: 8,
        },
        heading3: {
          fontFamily: fonts.serif,
          fontSize: 21,
          lineHeight: 29,
          marginTop: 20,
          marginBottom: 8,
        },
        paragraph: { marginTop: 0, marginBottom: 20 },
        link: { color: colors.focus, textDecorationLine: "underline" },
        blockquote: {
          borderLeftWidth: 1,
          borderColor: colors.controlBorder,
          backgroundColor: colors.surface,
          paddingHorizontal: 16,
          paddingTop: 16,
          marginLeft: 0,
          marginBottom: 20,
        },
        code_inline: {
          fontFamily: fonts.mono,
          fontSize: 14,
          backgroundColor: colors.surface,
          borderWidth: 0,
          color: colors.foreground,
        },
        hr: { backgroundColor: colors.border, marginVertical: 20 },
        table: { borderColor: colors.border },
        tr: { borderColor: colors.border },
        th: { minWidth: 140, padding: 10, backgroundColor: colors.surface },
        td: { minWidth: 140, padding: 10 },
        bullet_list: { marginBottom: 20 },
        ordered_list: { marginBottom: 20 },
      }}
    >
      {content}
    </Markdown>
  );
}
