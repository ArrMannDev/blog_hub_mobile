import assert from "node:assert/strict";
import { test } from "node:test";
import { load } from "./helpers/offline.mjs";

test("Trash keeps owner access and requires explicit admin grants", async () => {
  let scope, profile, detail;
  const calls = [];
  const Redirect = () => null;
  const { default: Route } = load("app/trash.tsx", {
    "expo-router": { Redirect, useLocalSearchParams: () => ({ scope }) },
    react: {
      useCallback: (fn) => fn,
      useRef: (current) => ({ current }),
      useState: (value) => [value, () => {}],
    },
    "react-native": {
      Platform: { OS: "ios" },
      Pressable: "button",
      Text: "text",
      View: "view",
    },
    "@/components/ActionButton": "action",
    "@/components/FormScreen": "screen",
    "@expo/vector-icons/Ionicons": "icon",
    "@/hooks/use-theme": { useTheme: () => ({ colors: {} }) },
    "@/contexts/AuthContext": {
      useAuth: () => ({ user: profile, getAccessToken: async () => "token" }),
    },
    "@/hooks/use-private-page": {
      usePrivatePage: (fetchPage) => {
        void fetchPage(1, "token");
        return { items: [detail] };
      },
    },
    "@/lib/api": { request: async (...args) => calls.push(args) },
    "@/lib/post-events": {},
    "@/lib/reading": { formatDate: () => "", initials: () => "A" },
  });
  function visible(node, label) {
    if (node === label || node?.props?.label === label) return true;
    if (Array.isArray(node)) return node.some((child) => visible(child, label));
    return node?.props ? visible(node.props.children, label) : false;
  }
  function render() {
    const route = Route();
    return route.type(route.props);
  }
  assert.equal(Route().type, Redirect);
  profile = { id: "owner", role: "author" };
  detail = {
    id: "post",
    author: { displayName: "Author" },
    title: "Post preview",
    canRestore: false,
    canPermanentlyDelete: true,
  };
  assert.equal(visible(render(), "Post preview"), true);
  assert.equal(visible(render(), "Restore as draft"), false);
  assert.equal(visible(render(), "Delete permanently"), true);
  assert.equal(calls.at(-1)[0], "/me/blog-trash?page=1&limit=10");

  scope = "admin";
  profile = { id: "staff", role: "admin", permissions: ["blogs.delete"] };
  assert.equal(Route().type, Redirect);
  profile.permissions.push("blogs.moderate");
  detail.canRestore = true;
  assert.equal(visible(render(), "Restore as draft"), false);
  assert.equal(visible(render(), "Delete permanently"), false);
  profile.permissions.push("blogs.restore");
  assert.equal(visible(render(), "Restore as draft"), true);
  assert.equal(visible(render(), "Delete permanently"), false);
  assert.equal(calls.at(-1)[0], "/admin/blog-trash?page=1&limit=10");
});
