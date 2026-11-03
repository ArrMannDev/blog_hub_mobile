import { useState } from "react";
import { Image } from "react-native";
import { imageUrl } from "@/lib/reading";

interface ArticleImageProps {
  url: string | null;
  feed?: boolean;
  alt?: string;
  local?: boolean;
}

export default function ArticleImage({
  url,
  feed = false,
  alt,
  local = false,
}: ArticleImageProps) {
  const [failed, setFailed] = useState(false);
  const [ratio, setRatio] = useState(3 / 2);
  const uri = local && url?.startsWith("file://") ? url : imageUrl(url);
  if (!uri || failed) return null;

  return (
    <Image
      source={{ uri }}
      className={feed ? "article-cover" : "reader-cover"}
      style={feed ? undefined : { aspectRatio: ratio }}
      resizeMode={feed ? "cover" : "contain"}
      accessible={!!alt}
      accessibilityLabel={alt}
      onError={() => setFailed(true)}
      onLoad={({ nativeEvent }) => {
        if (!feed && nativeEvent.source.width && nativeEvent.source.height) {
          setRatio(nativeEvent.source.width / nativeEvent.source.height);
        }
      }}
    />
  );
}
