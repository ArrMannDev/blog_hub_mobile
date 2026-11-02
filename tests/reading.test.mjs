import assert from "node:assert/strict";
import test from "node:test";
import {
  filterQuery,
  formatDate,
  imageUrl,
  initials,
  mergeBlogs,
  safeLink,
} from "../src/lib/reading.ts";

test("image URLs resolve legacy paths and reject executable schemes", () => {
  assert.equal(
    imageUrl("/images/cover.jpg"),
    `${new URL(process.env.EXPO_PUBLIC_API_URL).origin}/images/cover.jpg`,
  );
  assert.equal(
    imageUrl("https://example.com/cover.png"),
    "https://example.com/cover.png",
  );
  assert.equal(imageUrl("javascript:alert(1)"), undefined);
  assert.equal(imageUrl("data:text/html,test"), undefined);
  assert.equal(imageUrl(null), undefined);
});

test("article links only allow supported external schemes", () => {
  for (const url of [
    "https://example.com",
    "http://example.com",
    "mailto:reader@example.com",
  ])
    assert.equal(safeLink(url), true);
  for (const url of [
    "javascript:alert(1)",
    "data:text/html,hello",
    "file:///etc/passwd",
    "/relative",
  ])
    assert.equal(safeLink(url), false);
});

test("filter queries omit blanks, preserve Unicode, and encode reserved text", () => {
  const query = new URLSearchParams(
    filterQuery({
      q: "  art & books  ",
      category: "မြန်မာ",
      author: " ",
      tag: undefined,
    }),
  );
  assert.equal(query.get("q"), "art & books");
  assert.equal(query.get("category"), "မြန်မာ");
  assert.equal(query.has("author"), false);
  assert.equal(query.has("tag"), false);
});

test("overlapping pages do not duplicate articles and retain newer fields", () => {
  assert.deepEqual(
    mergeBlogs(
      [
        { id: "a", title: "old" },
        { id: "b", title: "B" },
      ],
      [
        { id: "a", title: "updated" },
        { id: "c", title: "C" },
      ],
    ),
    [
      { id: "a", title: "updated" },
      { id: "b", title: "B" },
      { id: "c", title: "C" },
    ],
  );
});

test("missing names and invalid publication dates are safe", () => {
  assert.equal(initials(" Orlando   Diggs "), "OD");
  assert.equal(initials(""), "?");
  assert.equal(initials("ဦး မြ"), "ဦမ");
  assert.equal(formatDate(null), "");
  assert.equal(formatDate("not-a-date"), "");
});

// Exercise the exact overridden parser used by the native renderer.
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const rendererRequire = createRequire(
  require.resolve("react-native-markdown-display"),
);
const MarkdownIt = rendererRequire("markdown-it");

test("the patched Markdown parser renders content without executable HTML or links", () => {
  const parser = MarkdownIt({ html: false, linkify: true, typographer: true });
  assert.match(
    parser.render("## A heading\n\n**Readable** text"),
    /<h2>A heading<\/h2>/,
  );
  assert.match(parser.render("<script>alert(1)</script>"), /&lt;script&gt;/);
  assert.doesNotMatch(parser.render("[unsafe](javascript:alert(1))"), /<a /);
  assert.match(
    parser.render("https://example.com"),
    /href="https:\/\/example.com"/,
  );
  const tokens = parser.parse("A table\n\n| A | B |\n|---|---|\n| 1 | 2 |", {});
  assert.ok(tokens.some((token) => token.type === "table_open"));
});
