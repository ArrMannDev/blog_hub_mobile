import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import postcss from "postcss";
import tailwind from "@tailwindcss/postcss";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const source = readFileSync(
  new URL("../src/global.css", import.meta.url),
  "utf8",
);
const result = await postcss([tailwind()]).process(source, {
  from: "src/global.css",
});
const stylesheet = require("react-native-css/compiler")
  .compile(result.css)
  .stylesheet();

function declarations(name) {
  const [, rules] = stylesheet.s.find(([key]) => key === name);
  return Object.assign(
    {},
    ...rules
      .filter((rule) => !rule.p)
      .flatMap((rule) => rule.d ?? [])
      .filter((declaration) => !Array.isArray(declaration)),
  );
}

test("article rows are horizontal and cannot expand to fill the viewport", () => {
  const row = declarations("article-row");
  assert.equal(row.flexGrow, 0);
  assert.equal(row.flexShrink, 0);
  assert.notEqual(row.flexBasis, "0%");
  assert.equal(row.flexDirection, "row");
  assert.equal(declarations("article-title").flexGrow, 0);
  assert.equal(declarations("article-excerpt").flexGrow, 0);
});

test("only the list viewport grows, not its header, filters, or content", () => {
  for (const name of [
    "screen-header",
    "category-strip",
    "category-scroll",
    "category-option",
    "feed-content",
  ]) {
    assert.equal(declarations(name).flexGrow, 0, name);
  }
});

test("feed covers keep a bounded landscape ratio", () => {
  assert.equal(declarations("article-cover").aspectRatio, "16/9");
});

test("native spacing and type use the same 16px root as the design", () => {
  assert.equal(declarations("screen-header").minHeight, 56);
  assert.equal(declarations("article-avatar").width, 40);
  assert.equal(declarations("article-title").fontSize, 20);
});

test("native text line heights cannot be multiplied by the font size", () => {
  for (const [name, height] of [
    ["brand", 32],
    ["article-title", 28],
    ["article-author", 20],
    ["article-date", 20],
    ["category-label", 20],
  ]) {
    const [, rules] = stylesheet.s.find(([key]) => key === name);
    const dynamicHeight = rules
      .flatMap((rule) => rule.d ?? [])
      .some(
        (declaration) =>
          Array.isArray(declaration) && declaration[1] === "lineHeight",
      );
    assert.equal(
      dynamicHeight,
      false,
      name + " has a runtime line-height multiplier",
    );
    assert.equal(declarations(name).lineHeight, height, name);
  }
});

test("the author and date line is vertically centered beside the avatar", () => {
  const byline = declarations("article-byline");
  assert.equal(byline.minHeight, declarations("article-avatar").height);
  assert.equal(byline.alignItems, "center");
  assert.equal(byline.alignContent, "center");
});
