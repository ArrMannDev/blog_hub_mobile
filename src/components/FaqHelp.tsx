import Ionicons from "@expo/vector-icons/Ionicons";
import { useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Modal,
  PanResponder,
  Pressable,
  ScrollView,
  Text,
  View,
  useWindowDimensions,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { tabBar } from "@/constants/theme";
import { useTheme } from "@/hooks/use-theme";
import { ApiError, request } from "@/lib/api";

type Question = { id: string; question: string; category: string };
type Answer = Question & { answer: string };
type Position = { x: number; y: number };

const size = 56;
const margin = 12;
const clamp = (value: number, min: number, max: number) =>
  Math.min(Math.max(value, min), max);

function useLauncherPosition() {
  const { width, height } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const left = insets.left + margin;
  const right = Math.max(left, width - insets.right - size - margin);
  const top = insets.top + margin;
  const bottom = Math.max(
    top,
    height - insets.bottom - tabBar.height - size - margin,
  );
  const [drag, setDrag] = useState<{
    start: Position;
    position: Position;
  } | null>(null);
  const responder = useMemo(() => {
    function move(dx: number, dy: number, snap: boolean) {
      setDrag((drag) => {
        if (!drag) return drag;
        const x = clamp(drag.start.x + dx, left, right);
        return {
          start: drag.start,
          position: {
            x: snap ? (x < (left + right) / 2 ? left : right) : x,
            y: clamp(drag.start.y + dy, top, bottom),
          },
        };
      });
    }
    return PanResponder.create({
      onMoveShouldSetPanResponderCapture: (_, { dx, dy }) =>
        Math.hypot(dx, dy) > 7,
      onPanResponderGrant: () => {
        setDrag((drag) => {
          const position = {
            x: clamp(drag?.position.x ?? right, left, right),
            y: clamp(drag?.position.y ?? bottom, top, bottom),
          };
          return { start: position, position };
        });
      },
      onPanResponderMove: (_, { dx, dy }) => move(dx, dy, false),
      onPanResponderRelease: (_, { dx, dy }) => move(dx, dy, true),
      onPanResponderTerminate: (_, { dx, dy }) => move(dx, dy, true),
    });
  }, [left, right, top, bottom]);

  return {
    handlers: responder.panHandlers,
    x: clamp(drag?.position.x ?? right, left, right),
    y: clamp(drag?.position.y ?? bottom, top, bottom),
  };
}

export default function FaqHelp() {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const launcher = useLauncherPosition();
  const [open, setOpen] = useState(false);
  const [questions, setQuestions] = useState<Question[] | null>(null);
  const [selected, setSelected] = useState<Question | null>(null);
  const [answer, setAnswer] = useState<Answer | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const pending = useRef(false);

  async function load(question?: Question) {
    if (pending.current) return;
    pending.current = true;
    setSelected(question ?? null);
    setAnswer(null);
    setError("");
    setLoading(true);
    try {
      if (question) {
        setAnswer(
          await request<Answer>("/faq/" + encodeURIComponent(question.id)),
        );
      } else {
        setQuestions(await request<Question[]>("/faq/suggestions?limit=5"));
      }
    } catch (failure) {
      setError(
        failure instanceof ApiError && failure.status === 404 && question
          ? "This question is no longer available. Choose another question."
          : failure instanceof Error
            ? failure.message
            : "Couldn’t load Help. Try again.",
      );
    } finally {
      pending.current = false;
      setLoading(false);
    }
  }

  function openHelp() {
    setOpen(true);
    if (questions === null) void load();
  }

  function moreQuestions() {
    setSelected(null);
    setAnswer(null);
    setError("");
  }

  const close = () => setOpen(false);

  return (
    <>
      <View
        {...launcher.handlers}
        className="absolute z-50"
        style={{ left: launcher.x, top: launcher.y, width: size, height: size }}
      >
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Open BlogHub Help"
          accessibilityHint="Opens frequently asked questions"
          className="size-full items-center justify-center rounded-full border border-control-border bg-navigation active:opacity-75"
          onPress={openHelp}
        >
          <Ionicons
            name="headset-outline"
            size={27}
            color={colors.foreground}
          />
        </Pressable>
      </View>
      {open && (
        <Modal
          transparent
          visible
          animationType="slide"
          statusBarTranslucent
          navigationBarTranslucent
          onRequestClose={close}
        >
          <View
            className="flex-1 justify-end"
            style={{ paddingTop: insets.top + 24 }}
          >
            <Pressable
              className="absolute inset-0 bg-black/40"
              accessible={false}
              onPress={close}
            />
            <View
              accessibilityViewIsModal
              className="max-h-[90%] rounded-t-3xl border-t border-border bg-background"
              style={{
                paddingLeft: insets.left,
                paddingRight: insets.right,
                paddingBottom: Math.max(insets.bottom, 12),
              }}
            >
              <View className="flex-row items-center justify-between border-b border-border px-5 py-2">
                <Text
                  className="font-title text-xl text-foreground"
                  accessibilityRole="header"
                >
                  BlogHub Help
                </Text>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="Close Help"
                  className="icon-button"
                  onPress={close}
                >
                  <Ionicons
                    name="close-outline"
                    size={24}
                    color={colors.foreground}
                  />
                </Pressable>
              </View>
              <ScrollView
                key={selected?.id ?? "questions"}
                className="shrink"
                contentContainerClassName="gap-3 px-5 py-4"
              >
                {selected ? (
                  <View className="max-w-[90%] self-end rounded-2xl rounded-br-sm bg-navigation px-4 py-3">
                    <Text className="text-base text-foreground">
                      {selected.question}
                    </Text>
                  </View>
                ) : (
                  <View className="max-w-[90%] self-start rounded-2xl rounded-bl-sm bg-surface px-4 py-3">
                    <Text className="text-base text-foreground">
                      Hi! Tap a question below to get help with BlogHub.
                    </Text>
                  </View>
                )}
                {loading && (
                  <ActivityIndicator
                    accessibilityLabel={
                      selected ? "Loading answer" : "Loading questions"
                    }
                    color={colors.foreground}
                    className="self-start"
                  />
                )}
                {!!error && (
                  <>
                    <Text accessibilityRole="alert" className="form-error">
                      {error}
                    </Text>
                    <Pressable
                      accessibilityRole="button"
                      className="secondary-button self-start"
                      onPress={() => void load(selected ?? undefined)}
                    >
                      <Text className="font-semibold text-foreground">
                        Try again
                      </Text>
                    </Pressable>
                  </>
                )}
                {answer && (
                  <View className="max-w-[95%] self-start rounded-2xl rounded-bl-sm bg-surface px-4 py-3">
                    <Text
                      selectable
                      accessibilityLiveRegion="polite"
                      className="text-base leading-6 text-foreground"
                    >
                      {answer.answer}
                    </Text>
                  </View>
                )}
                {selected && !loading && (
                  <Pressable
                    accessibilityRole="button"
                    className="secondary-button self-start"
                    onPress={moreQuestions}
                  >
                    <Text className="font-semibold text-foreground">
                      More questions
                    </Text>
                  </Pressable>
                )}
                {!selected &&
                  questions?.map((question) => (
                    <Pressable
                      key={question.id}
                      accessibilityRole="button"
                      className="secondary-button items-start self-start py-2"
                      onPress={() => void load(question)}
                    >
                      <Text className="text-base text-foreground">
                        {question.question}
                      </Text>
                    </Pressable>
                  ))}
                {!loading && !error && questions?.length === 0 && (
                  <Text className="form-description">
                    No help questions are available yet.
                  </Text>
                )}
              </ScrollView>
            </View>
          </View>
        </Modal>
      )}
    </>
  );
}
