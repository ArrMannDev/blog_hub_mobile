import { useState } from "react";
import { Image } from "react-native";
import { imageUrl } from "@/lib/reading";

interface ArticleImageProps {
  url: string | null;
  feed?: boolean;
  alt?: string;
}

export default function ArticleImage({
  url,
  feed = false,
  alt,
}: ArticleImageProps) {
  const [failed, setFailed] = useState(false);
  const [ratio, setRatio] = useState(3 / 2);
  const uri = imageUrl(url);
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
