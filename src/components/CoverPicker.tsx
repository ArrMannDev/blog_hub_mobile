import * as ImagePicker from "expo-image-picker";
import { useRef, useState } from "react";
import { Image, Pressable, Text, View } from "react-native";
import { imageUrl } from "@/lib/reading";
import { validateCover } from "@/lib/post-body";
import type { CoverUpload } from "@/types/blog";
import { FormMessage } from "./AuthFields";

export default function CoverPicker({
  value,
  existingUrl,
  disabled,
  onChange,
  onPicking,
}: {
  value: CoverUpload | null | undefined;
  existingUrl: string | null;
  disabled: boolean;
  onChange(value: CoverUpload | null | undefined): void;
  onPicking(value: boolean): void;
}) {
  const [error, setError] = useState("");
  const pending = useRef(false);
  const uri = value === undefined ? imageUrl(existingUrl) : value?.uri;

  async function choose() {
    if (disabled || pending.current) return;
    pending.current = true;
    onPicking(true);
    setError("");
    try {
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ["images"],
        allowsEditing: true,
        quality: 0.8,
        preferredAssetRepresentationMode:
          ImagePicker.UIImagePickerPreferredAssetRepresentationMode.Compatible,
      });
      if (result.canceled) return;
      const asset = result.assets[0];
      const extension = asset.uri.split("?")[0].split(".").pop()?.toLowerCase();
      const types: Record<string, string> = {
        jpg: "image/jpeg",
        jpeg: "image/jpeg",
        png: "image/png",
        webp: "image/webp",
      };
      const mimeType =
        asset.file?.type || types[extension || ""] || asset.mimeType || "";
      const image = {
        uri: asset.uri,
        name: `cover.${mimeType === "image/jpeg" ? "jpg" : mimeType.split("/")[1] || "jpg"}`,
        mimeType,
        size: asset.file?.size ?? asset.fileSize ?? 0,
        file: asset.file,
      };
      validateCover(image);
      onChange(image);
    } catch (failure) {
      setError(
        failure instanceof Error
          ? failure.message
          : "Couldn't open your photos. Check photo access in Settings.",
      );
    } finally {
      pending.current = false;
      onPicking(false);
    }
  }

  return (
    <View className="mb-5">
      <Text className="field-label">Cover image · Optional</Text>
      <Text className="form-description mb-3">
        JPEG, PNG, or WebP · Up to 5 MB. Uploaded covers are public, including
        draft covers.
      </Text>
      {!!uri && (
        <Image
          key={uri}
          source={{ uri }}
          resizeMode="cover"
          className="mb-3 h-44 w-full rounded-xl"
          accessibilityLabel="Post cover preview"
        />
      )}
      {!!error && <FormMessage error>{error}</FormMessage>}
      <View className="flex-row flex-wrap gap-3">
        <Pressable
          accessibilityRole="button"
          className="secondary-button"
          disabled={disabled}
          onPress={() => {
            void choose();
          }}
        >
          <Text className="text-[14px] leading-[20px] font-semibold text-foreground">
            {uri ? "Change image" : "Choose image"}
          </Text>
        </Pressable>
        {!!uri && (
          <Pressable
            accessibilityRole="button"
            className="text-action"
            disabled={disabled}
            onPress={() => onChange(existingUrl ? null : undefined)}
          >
            <Text className="text-action-label">Remove image</Text>
          </Pressable>
        )}
        {value !== undefined && (
          <Pressable
            accessibilityRole="button"
            className="text-action"
            disabled={disabled}
            onPress={() => onChange(undefined)}
          >
            <Text className="text-action-label">Undo cover change</Text>
          </Pressable>
        )}
      </View>
    </View>
  );
}
