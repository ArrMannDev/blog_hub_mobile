import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { runInNewContext } from "node:vm";
import test from "node:test";
import ts from "typescript";

const require = createRequire(import.meta.url);
const tick = () => new Promise(setImmediate);
function load(path, mocks = {}, globals = {}) {
  const { outputText } = ts.transpileModule(
    readFileSync(new URL(`../src/${path}`, import.meta.url), "utf8"),
    {
      compilerOptions: {
        module: ts.ModuleKind.CommonJS,
        jsx: ts.JsxEmit.ReactJSX,
      },
    },
  );
  const module = { exports: {} };
  runInNewContext(outputText, {
    exports: module.exports,
    Error,
    AbortController,
    setTimeout,
    clearTimeout,
    ...globals,
    require: (name) => (name in mocks ? mocks[name] : require(name)),
  });
  return module.exports;
}
const json = (value) => JSON.parse(JSON.stringify(value));
function hooks() {
  const states = [],
    refs = [];
  let index, refIndex;
  return {
    reset() {
      index = refIndex = 0;
    },
    react: {
      ...require("react"),
      useState(initial) {
        const i = index++;
        if (!(i in states)) states[i] = initial;
        return [
          states[i],
          (value) => {
            states[i] = typeof value === "function" ? value(states[i]) : value;
          },
        ];
      },
      useRef(initial) {
        return (refs[refIndex++] ??= { current: initial });
      },
      useCallback: (callback) => callback,
    },
  };
}
const message = {
  id: "server",
  conversationId: "conversation",
  senderId: "owner",
  clientMessageId: "client",
  content: "Hello",
  createdAt: "2026-11-02T01:00:00Z",
  deletedAt: null,
  isRead: false,
};
const helpers = load("lib/chat-messages.ts");

test("messages validate Unicode limits and merge pending acknowledgements without duplicate rows", () => {
  assert.throws(() => helpers.validateMessage(" \n "));
  assert.throws(() => helpers.validateMessage("a".repeat(2001)));
  assert.doesNotThrow(() => helpers.validateMessage("😀".repeat(2000)));
  const pending = { ...message, id: "pending", delivery: "sending" };
  const merged = helpers.mergeMessages([pending], [message], new Map());
  assert.equal(merged.length, 1);
  assert.equal(merged[0].id, "server");
  assert.equal(merged[0].delivery, undefined);
});

test("deletion wins over late socket events, acknowledgements and history; read flags never regress", () => {
  const deleted = new Map([
    [
      message.id,
      {
        messageId: message.id,
        conversationId: message.conversationId,
        deletedAt: "2026-11-02T02:00:00Z",
      },
    ],
  ]);
  const merged = helpers.mergeMessages(
    [
      {
        ...message,
        content: null,
        deletedAt: deleted.get(message.id).deletedAt,
      },
    ],
    [message],
    deleted,
  );
  assert.equal(merged[0].content, null);
  assert.ok(merged[0].deletedAt);
  assert.equal(
    helpers.mergeMessages(
      [{ ...message, isRead: true }],
      [message],
      new Map(),
    )[0].isRead,
    true,
  );
  assert.equal(helpers.isChatMessage({ id: "broken" }), false);
});

test("chat REST uses protected conversation/history routes and whitelists recipient creation", async () => {
  const calls = [];
  const { chatApi } = load("lib/chat-api.ts", {
    "./api": {
      request: async (...args) => {
        calls.push(args);
      },
    },
  });
  await chatApi.conversations(2, "token");
  await chatApi.start("recipient", "token");
  await chatApi.messages("a/b", 3, "token");
  assert.equal(calls[0][0], "/chat/conversations?page=2&limit=20");
  assert.deepEqual(JSON.parse(calls[1][1].body), { recipientId: "recipient" });
  assert.equal(
    calls[2][0],
    "/chat/conversations/a%2Fb/messages?page=3&limit=20",
  );
  for (const [, options] of calls)
    assert.equal(options.headers.Authorization, "Bearer token");
});

test("unread message total includes every conversation page", async () => {
  const signal = new AbortController().signal;
  const { countUnreadMessages } = load("lib/chat-api.ts", {
    "./api": {
      request: async (path, options) => {
        assert.equal(options.signal, signal);
        const first = path.includes("page=1");
        return {
          totalPages: 2,
          items: [{ id: first ? "a" : "b", unreadCount: first ? 2 : 3 }],
        };
      },
    },
  });
  assert.equal(await countUnreadMessages("token", signal), 5);
});

function transport() {
  const listeners = new Map(),
    packets = [],
    statuses = [],
    events = [],
    timers = new Map();
  let options,
    connects = 0,
    checks = 0,
    token = "first",
    timerId = 0;
  const socket = {
    connected: false,
    on(event, callback) {
      listeners.set(event, callback);
      return this;
    },
    connect() {
      connects++;
      return this;
    },
    disconnect() {
      this.connected = false;
      return this;
    },
    removeAllListeners() {
      listeners.clear();
    },
    timeout() {
      return {
        emit: (event, payload, callback) =>
          packets.push({ event, payload, callback }),
      };
    },
  };
  const module = load(
    "lib/chat-client.ts",
    {
      "socket.io-client": {
        io: (_url, input) => {
          assert.equal(_url, "https://example.com/chat");
          options = input;
          return socket;
        },
      },
      "react-native": { Platform: { OS: "ios" } },
      "./reading": { API_ORIGIN: "https://example.com" },
      "./auth-api": { AUTH_ORIGIN: "https://allowed.example" },
    },
    {
      setTimeout: (callback) => {
        const id = ++timerId;
        timers.set(id, callback);
        return id;
      },
      clearTimeout: (id) => timers.delete(id),
    },
  );
  const client = module.createChatClient({
    getAccessToken: async () => token,
    checkSession: async () => {
      checks++;
    },
    onStatus: (status) => statuses.push(status),
    onEvent: (...args) => events.push(args),
  });
  return {
    client,
    socket,
    packets,
    statuses,
    events,
    options,
    timers,
    fire(event, value) {
      if (event === "connect") socket.connected = true;
      if (event === "disconnect") socket.connected = false;
      listeners.get(event)?.(value);
    },
    set token(value) {
      token = value;
    },
    get checks() {
      return checks;
    },
    get connects() {
      return connects;
    },
  };
}

test("socket auth reads current tokens, does not queue offline sends, and closes all handlers", async () => {
  const app = transport();
  await assert.rejects(app.client.emit("message:send", {}), /offline/);
  app.client.start();
  let auth;
  app.options.auth((value) => {
    auth = value;
  });
  await tick();
  assert.equal(auth.accessToken, "first");
  app.token = "refreshed";
  app.options.auth((value) => {
    auth = value;
  });
  await tick();
  assert.equal(auth.accessToken, "refreshed");
  assert.deepEqual(json(app.options.transports), ["websocket"]);
  assert.equal(app.options.extraHeaders.Origin, "https://allowed.example");
  app.fire("connect");
  assert.equal(app.statuses.at(-1), "connected");
  app.fire("message:new", message);
  assert.equal(app.events.at(-1)[0], "message:new");
  app.client.pause();
  await assert.rejects(app.client.emit("message:send", {}), /offline/);
  app.client.close();
  app.fire("message:new", message);
  assert.equal(app.events.length, 2);
});

test("socket acknowledgements handle timeouts, errors and malformed responses without hanging", async () => {
  const app = transport();
  app.client.start();
  app.fire("connect");
  for (const reply of [
    null,
    { ok: false },
    {
      ok: false,
      error: { code: "RATE_LIMITED", message: "Wait before retrying" },
    },
  ]) {
    const pending = app.client.emit("message:send", {});
    app.packets.at(-1).callback(null, reply);
    await assert.rejects(pending);
  }
  const timeout = app.client.emit("message:send", {});
  app.packets.at(-1).callback(new Error("timeout"));
  await assert.rejects(timeout, /without sending a duplicate/);
  const success = app.client.emit("message:send", {});
  app.packets.at(-1).callback(null, { ok: true, data: message });
  assert.equal((await success).id, message.id);
  const late = app.client.emit("message:send", {});
  app.client.close();
  app.packets.at(-1).callback(null, { ok: true, data: message });
  await assert.rejects(late, /session ended/);
});

test("server disconnect revalidates the session before reconnecting and teardown cancels recovery", async () => {
  const app = transport();
  app.client.start();
  app.fire("connect");
  app.fire("disconnect", "io server disconnect");
  await tick();
  assert.equal(app.checks, 1);
  assert.equal(app.timers.size, 1);
  const retry = [...app.timers.values()][0];
  retry();
  assert.equal(app.connects, 2);
  app.client.close();
  assert.equal(app.timers.size, 0);
});

function session({ userId = "owner", reply } = {}) {
  const h = hooks();
  let effect,
    cleanup,
    connectionOptions,
    appState,
    uuid = 0,
    closed = 0;
  const packets = [],
    timers = new Map();
  let timerId = 0;
  const getAccessToken = async () => "token",
    checkSession = async () => {};
  const connection = {
    start() {
      connectionOptions.onStatus("connected");
      connectionOptions.onEvent("connected");
    },
    pause() {
      connectionOptions.onStatus("offline");
    },
    close() {
      closed++;
    },
    async emit(event, payload) {
      packets.push({ event, payload });
      if (reply) return reply(event, payload);
      if (event === "message:send")
        return {
          created: true,
          message: {
            ...message,
            ...payload,
            senderId: userId,
            id: `server-${payload.clientMessageId}`,
          },
        };
      if (event === "message:delete")
        return {
          messageId: payload.messageId,
          conversationId: "conversation",
          deletedAt: "2026-11-02T03:00:00Z",
        };
      return { updated: 0 };
    },
  };
  const module = load(
    "contexts/ChatContext.tsx",
    {
      react: {
        ...h.react,
        useContext: () => null,
        useEffect: (callback) => {
          effect = callback;
        },
      },
      "react-native": {
        AppState: {
          currentState: "active",
          addEventListener: (_event, callback) => {
            appState = callback;
            return { remove() {} };
          },
        },
      },
      "expo-crypto": { randomUUID: () => `client-${++uuid}` },
      "./AuthContext": {
        useAuth: () => ({
          user: userId ? { id: userId, role: "admin" } : null,
          getAccessToken,
          checkSession,
        }),
      },
      "@/lib/chat-client": {
        createChatClient: (options) => {
          connectionOptions = options;
          return connection;
        },
      },
      "@/lib/chat-api": { countUnreadMessages: async () => 0 },
      "@/lib/chat-messages": helpers,
    },
    {
      setTimeout: (callback) => {
        const id = ++timerId;
        timers.set(id, callback);
        return id;
      },
      clearTimeout: (id) => timers.delete(id),
    },
  );
  const outer = module.ChatContextProvider({ children: null });
  const render = () => {
    h.reset();
    return outer.type(outer.props).props.value;
  };
  render();
  cleanup = effect();
  return {
    render,
    packets,
    key: outer.key,
    event: (event, data) => connectionOptions?.onEvent(event, data),
    background: () => appState("background"),
    foreground: () => appState("active"),
    close() {
      cleanup?.();
    },
    timers,
    get closed() {
      return closed;
    },
    module,
  };
}

test("chat context blocks guest connections, guards its hook and keys private state by account", () => {
  const guest = session({ userId: undefined });
  guest.close();
  const loggedOut = session({ userId: "" });
  assert.equal(loggedOut.key, "guest");
  assert.equal(loggedOut.render().status, "offline");
  assert.throws(
    () => loggedOut.module.useChat(),
    /within a ChatContextProvider/,
  );
  assert.throws(
    () => loggedOut.render().sendMessage("conversation", "hello"),
    /Sign in/,
  );
  assert.notEqual(session({ userId: "a" }).key, session({ userId: "b" }).key);
});

test("failed sends retain their UUID and text, retry once, and acknowledge without duplicate bubbles", async () => {
  let fail = true;
  const app = session({
    reply: async (event, payload) => {
      if (event === "message:send") {
        if (fail) throw new Error("timeout");
        return { created: false, message: { ...message, ...payload } };
      }
      return { updated: 0 };
    },
  });
  app.render().sendMessage("conversation", "Hello");
  await tick();
  const failed = app.render().threads.conversation[0];
  assert.equal(failed.delivery, "failed");
  assert.equal(failed.content, "Hello");
  fail = false;
  app.render().retryMessage(failed);
  app.render().retryMessage(failed);
  await tick();
  assert.equal(
    app.packets.filter((packet) => packet.event === "message:send").length,
    2,
  );
  assert.equal(
    app.packets[0].payload.clientMessageId,
    app.packets[1].payload.clientMessageId,
  );
  assert.equal(app.render().threads.conversation.length, 1);
  assert.equal(app.render().threads.conversation[0].delivery, undefined);
  app.close();
});

test("only the sender can delete, including admins; late history cannot restore deleted text", async () => {
  const app = session();
  app.render().mergeThread("conversation", [message]);
  await assert.rejects(
    app.render().deleteMessage({ ...message, senderId: "other" }),
    /only your own/,
  );
  assert.equal(app.packets.length, 0);
  await app.render().deleteMessage(message);
  app.render().mergeThread("conversation", [message]);
  assert.equal(app.render().threads.conversation[0].content, null);
  assert.ok(app.render().threads.conversation[0].deletedAt);
  app.close();
});

test("deletion received before a send acknowledgement stays deleted; read receipts only request canonical reconciliation", async () => {
  let resolve;
  const app = session({
    reply: (_event, payload) =>
      new Promise((done) => {
        resolve = () => done({ message: { ...message, ...payload } });
      }),
  });
  app.render().sendMessage("conversation", "Hello");
  await tick();
  app.event("message:deleted", {
    messageId: message.id,
    conversationId: "conversation",
    deletedAt: "2026-11-02T02:00:00Z",
  });
  resolve();
  await tick();
  assert.equal(app.render().threads.conversation[0].content, null);
  const before = app.render().threads.conversation[0].isRead;
  app.event("message:read", {
    conversationId: "conversation",
    readerId: "other",
    updated: 1,
  });
  assert.equal(app.render().threads.conversation[0].isRead, before);
  assert.equal(app.render().readVersions.conversation, 1);
  app.close();
});

test("typing is throttled and expires, drafts survive thread navigation, and backgrounding stops the connection", async () => {
  const app = session();
  app.render().setDraft("conversation", "Unsent text");
  assert.equal(app.render().drafts.conversation, "Unsent text");
  app.render().setTyping("conversation", true);
  app.render().setTyping("conversation", true);
  await tick();
  assert.equal(app.packets.length, 1);
  app.render().setTyping("conversation", false);
  app.render().setTyping("conversation", false);
  await tick();
  assert.equal(app.packets.length, 2);
  app.event("typing:start", {
    conversationId: "conversation",
    userId: "other",
  });
  assert.equal(app.render().typing.conversation, true);
  [...app.timers.values()][0]();
  assert.equal(app.render().typing.conversation, false);
  app.background();
  assert.equal(app.render().status, "offline");
  app.foreground();
  assert.equal(app.render().status, "connected");
  app.close();
  assert.equal(app.closed, 1);
});

test("thread history loads older pages, refreshes canonical read flags and cancels late responses", async () => {
  const h = hooks();
  let focus,
    cleanup,
    connectionVersion = 0;
  const threads = {},
    readVersions = {},
    calls = [];
  let result = { items: [message], page: 1, totalPages: 2 },
    fail = false;
  const mergeThread = (id, items) => {
    threads[id] = helpers.mergeMessages(threads[id] || [], items, new Map());
  };
  const { useMessages } = load("hooks/use-messages.ts", {
    react: h.react,
    "expo-router": {
      useFocusEffect: (callback) => {
        focus = callback;
      },
    },
    "@/contexts/AuthContext": {
      useAuth: () => ({ getAccessToken: async () => "token" }),
    },
    "@/contexts/ChatContext": {
      useChat: () => ({
        threads,
        mergeThread,
        connectionVersion,
        readVersions,
      }),
    },
    "@/lib/chat-api": {
      chatApi: {
        messages: async (...args) => {
          calls.push(args);
          if (fail) throw new Error("offline");
          return result;
        },
      },
    },
  });
  const render = () => {
    h.reset();
    return useMessages("conversation");
  };
  render();
  cleanup = focus();
  await tick();
  assert.equal(render().messages.length, 1);
  fail = true;
  render().loadOlder();
  await tick();
  assert.equal(render().messages.length, 1);
  assert.equal(render().error, "offline");
  fail = false;
  result = {
    items: [
      {
        ...message,
        id: "older",
        clientMessageId: "older",
        createdAt: "2026-11-01T01:00:00Z",
      },
    ],
    page: 2,
    totalPages: 2,
  };
  render().retry();
  await tick();
  assert.equal(calls.at(-1)[1], 2);
  assert.equal(render().messages.length, 2);
  cleanup();
  connectionVersion++;
  result = { items: [{ ...message, isRead: true }], page: 1, totalPages: 1 };
  render();
  cleanup = focus();
  await tick();
  assert.equal(render().messages[0].isRead, true);
  let resolve;
  cleanup();
  result = new Promise((done) => {
    resolve = done;
  });
  render();
  cleanup = focus();
  await tick();
  cleanup();
  resolve({
    items: [{ ...message, id: "late", clientMessageId: "late" }],
    page: 1,
    totalPages: 1,
  });
  await tick();
  assert.equal(
    render().messages.some((item) => item.id === "late"),
    false,
  );
});

function elements(node) {
  if (!node || typeof node !== "object") return [];
  return [node, ...[].concat(node.props?.children ?? []).flatMap(elements)];
}
const native = Object.fromEntries(
  ["Text", "View", "Pressable", "ActivityIndicator"].map((name) => [
    name,
    name,
  ]),
);

test("Home places the messages link immediately to the right of Search", () => {
  const h = hooks();
  h.reset();
  const { default: Home } = load("app/(tabs)/index.tsx", {
    react: h.react,
    "react-native": native,
    "expo-router": { Link: "Link" },
    "@expo/vector-icons/Ionicons": { __esModule: true, default: "Icon" },
    "@/components/Screen": { __esModule: true, default: "Screen" },
    "@/components/BlogFeed": { __esModule: true, default: "BlogFeed" },
    "@/components/CategoryStrip": {
      __esModule: true,
      default: "CategoryStrip",
    },
    "@/hooks/use-categories": { useCategories: () => ({ categories: [] }) },
    "@/hooks/use-theme": { useTheme: () => ({ colors: {} }) },
    "@/contexts/ChatContext": { useChat: () => ({ unreadMessageCount: 5 }) },
    "@/lib/reading": { filterQuery: () => "" },
  });
  assert.deepEqual(
    elements(Home())
      .filter((node) => node.type === "Link")
      .map((node) => node.props.href),
    ["/explore", "/chats/inbox"],
  );
  assert.ok(
    elements(Home()).some(
      (node) => node.props.accessibilityLabel === "Open messages, 5 unread",
    ),
  );
});

test("author profile sheet hides self messaging, sends guests to sign-in and reuses conversation creation", async () => {
  const h = hooks();
  let user = null,
    creates = 0;
  let closed = 0,
    failure,
    deferred = false,
    resolve;
  const destinations = [];
  const { default: AuthorProfileSheet } = load(
    "components/AuthorProfileSheet.tsx",
    {
      react: h.react,
      "react-native": { ...native, Modal: "Modal", ScrollView: "ScrollView" },
      "react-native-safe-area-context": {
        useSafeAreaInsets: () => ({ top: 20, bottom: 34 }),
      },
      "@/lib/reading": { initials: () => "W" },
      "expo-router": { router: { push: (value) => destinations.push(value) } },
      "@expo/vector-icons/Ionicons": { __esModule: true, default: "Icon" },
      "@/components/AuthFields": { FormMessage: "FormMessage" },
      "./AuthFields": { FormMessage: "FormMessage" },
      "@/hooks/use-theme": { useTheme: () => ({ colors: {} }) },
      "@/contexts/AuthContext": {
        useAuth: () => ({
          user,
          isRestoring: false,
          getAccessToken: async () => "token",
        }),
      },
      "@/lib/chat-api": {
        chatApi: {
          start: async (id, token) => {
            creates++;
            assert.equal(id, "other");
            assert.equal(token, "token");
            if (failure) throw failure;
            if (deferred)
              return new Promise((done) => {
                resolve = done;
              });
            return { id: "conversation", otherUser: { displayName: "Writer" } };
          },
        },
      },
    },
  );
  const render = () => {
    h.reset();
    return AuthorProfileSheet({
      author: { id: "other", displayName: "Writer" },
      onClose() {
        closed++;
      },
    });
  };
  elements(render())
    .find((node) => node.props?.accessibilityLabel === "Message Writer")
    .props.onPress();
  await tick();
  assert.equal(destinations[0].params.action, "sign-in");
  assert.equal(creates, 0);
  user = { id: "other" };
  assert.equal(
    elements(render()).some(
      (node) => node.props?.accessibilityLabel === "Message Writer",
    ),
    false,
  );
  user = { id: "owner" };
  const button = elements(render()).find(
    (node) => node.props?.accessibilityLabel === "Message Writer",
  );
  button.props.onPress();
  button.props.onPress();
  await tick();
  assert.equal(creates, 1);
  assert.equal(destinations.at(-1).params.id, "conversation");
  assert.equal(closed, 2);
  failure = new Error("offline");
  elements(render())
    .find((node) => node.props?.accessibilityLabel === "Message Writer")
    .props.onPress();
  await tick();
  assert.equal(closed, 2);
  assert.ok(
    elements(render()).some(
      (node) =>
        node.type === "FormMessage" && node.props.children === "offline",
    ),
  );
  failure = undefined;
  deferred = true;
  elements(render())
    .find((node) => node.props?.accessibilityLabel === "Message Writer")
    .props.onPress();
  render().props.onRequestClose();
  assert.equal(closed, 2);
  await tick();
  resolve({ id: "conversation", otherUser: { displayName: "Writer" } });
  await tick();
  assert.equal(closed, 3);
});

test("article reader author avatar and name share a popup trigger while the date stays separate", () => {
  const h = hooks();
  const { default: AuthorLine } = load("components/AuthorLine.tsx", {
    react: h.react,
    "react-native": native,
    "@/lib/reading": { initials: () => "W", formatDate: () => "Today" },
    "./AuthorProfileSheet": { __esModule: true, default: "AuthorProfileSheet" },
  });
  const render = () => {
    h.reset();
    return AuthorLine({
      author: { id: "other", displayName: "Writer" },
      date: "2026-11-02",
    });
  };
  const trigger = elements(render()).find(
    (node) => node.props?.accessibilityLabel === "View Writer's profile",
  );
  assert.ok(
    elements(trigger).some((node) => node.props?.children === "Writer"),
  );
  assert.ok(elements(trigger).some((node) => node.props?.children === "W"));
  assert.equal(
    elements(trigger).some((node) => node.props?.children === "Today"),
    false,
  );
  trigger.props.onPress();
  const sheet = elements(render()).find(
    (node) => node.type === "AuthorProfileSheet",
  );
  assert.equal(sheet.props.author.id, "other");
  sheet.props.onClose();
  assert.equal(
    elements(render()).some((node) => node.type === "AuthorProfileSheet"),
    false,
  );
});

test("message bubbles offer deletion only for the sender and retain deleted placeholders", () => {
  const { default: Bubble } = load("components/MessageBubble.tsx", {
    "react-native": native,
  });
  const render = (item, userId = "owner") =>
    Bubble({ message: item, userId, onRetry() {}, onDelete() {} });
  assert.equal(
    elements(render(message)).find((node) => node.type === "Pressable").props
      .disabled,
    false,
  );
  assert.equal(
    elements(render(message, "other")).find((node) => node.type === "Pressable")
      .props.onLongPress,
    undefined,
  );
  const deleted = render({
    ...message,
    content: null,
    deletedAt: "2026-11-02",
  });
  assert.ok(
    elements(deleted).some(
      (node) =>
        node.type === "Text" && node.props.children === "Message deleted",
    ),
  );
  assert.equal(
    elements(deleted).find((node) => node.type === "Pressable").props
      .onLongPress,
    undefined,
  );
});

test("Inbox never shows deleted message text from a stale conversation response", () => {
  const conversation = {
    id: "conversation",
    otherUser: { id: "other", displayName: "Writer" },
    unreadCount: 0,
    lastMessage: message,
    createdAt: message.createdAt,
  };
  const { default: Inbox } = load("app/chats/inbox.tsx", {
    "react-native": native,
    "expo-router": { Link: "Link", Redirect: "Redirect" },
    "@/contexts/AuthContext": { useAuth: () => ({ user: { id: "owner" } }) },
    "@/contexts/ChatContext": {
      useChat: () => ({
        status: "connected",
        deletedMessages: { server: "2026-11-02" },
      }),
    },
    "@/hooks/use-conversations": {
      useConversations: () => ({ items: [conversation] }),
    },
    "@/lib/reading": { formatDate: () => "Today", initials: () => "W" },
    "@/components/PrivateActivityList": { __esModule: true, default: "List" },
    "@/components/Screen": { __esModule: true, default: "Screen" },
  });
  const root = Inbox();
  const list = root.type(root.props);
  const row = list.props.renderItem({ item: conversation });
  assert.ok(
    elements(row).some(
      (node) =>
        node.type === "Text" && node.props.children === "Message deleted",
    ),
  );
  assert.equal(
    elements(row).some(
      (node) => node.type === "Text" && node.props.children === "Hello",
    ),
    false,
  );
});
