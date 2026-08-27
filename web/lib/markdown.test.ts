import assert from "node:assert/strict";
import { test } from "node:test";

import { parseBlocks, parseInline, toText, type Block } from "./markdown.ts";

const text = (s: string) => toText(parseInline(s));
const only = (s: string): Block => parseBlocks(s)[0];

test("emphasis, bold and code", () => {
  assert.deepEqual(parseInline("a *b* c"), [
    { t: "text", v: "a " },
    { t: "i", kids: [{ t: "text", v: "b" }] },
    { t: "text", v: " c" },
  ]);
  assert.deepEqual(parseInline("**loud**"), [{ t: "b", kids: [{ t: "text", v: "loud" }] }]);
  assert.deepEqual(parseInline("`x = 1`"), [{ t: "code", v: "x = 1" }]);
});

test("bold contains its text; nested emphasis is left literal (documented limitation)", () => {
  assert.deepEqual(parseInline("**a claim** and more"), [
    { t: "b", kids: [{ t: "text", v: "a claim" }] },
    { t: "text", v: " and more" },
  ]);
  // A full delimiter-run parser would nest these. Nothing in the corpus does this, so the
  // inner marker stays literal rather than carrying a parser twice the size.
  assert.deepEqual(parseInline("**very *odd***"), [
    { t: "b", kids: [{ t: "text", v: "very *odd" }] },
    { t: "text", v: "*" },
  ]);
});

test("two separate bold spans on one line stay separate", () => {
  const nodes = parseInline("**one** middle **two**");
  assert.deepEqual(nodes.map((n) => n.t), ["b", "text", "b"]);
});

test("invented notation survives untouched", () => {
  // The protocol config produced exactly this line; mangling it would destroy the finding.
  const src = "[TaskID] Act {Target} @Loc ($Mat) -> Status";
  assert.deepEqual(parseInline(src), [{ t: "text", v: src }]);
});

test("stray asterisks and snake_case are not emphasis", () => {
  for (const src of ["2 * 3 * 4", "a_b_c", "cost * quantity", "**", "* "]) {
    assert.equal(text(src), src);
  }
});

test("bullets, including wrapped continuation lines", () => {
  const block = only("- first item\n  wrapped on\n- second");
  assert.equal(block.t, "ul");
  assert.deepEqual((block as Extract<Block, { t: "ul" }>).items.map(toText), [
    "first item wrapped on",
    "second",
  ]);
});

test("ordered lists keep their starting number", () => {
  const block = only("3. three\n4. four");
  assert.equal(block.t, "ol");
  assert.equal((block as Extract<Block, { t: "ol" }>).start, 3);
});

test("tables need a divider row", () => {
  const block = only("| a | b |\n|---|---|\n| 1 | 2 |");
  assert.equal(block.t, "table");
  const table = block as Extract<Block, { t: "table" }>;
  assert.deepEqual(table.head.map(toText), ["a", "b"]);
  assert.deepEqual(table.rows[0].map(toText), ["1", "2"]);

  // A pipe-ish line without a divider stays prose.
  assert.equal(only("| not a table |").t, "p");
});

test("blockquotes and fenced code", () => {
  assert.equal(only("> quoted line").t, "quote");
  assert.deepEqual(only("```py\nx = 1\n```"), { t: "code", v: "x = 1", lang: "py" });
});

test("paragraphs split on blank lines and keep internal breaks", () => {
  const blocks = parseBlocks("one\nstill one\n\ntwo");
  assert.equal(blocks.length, 2);
  assert.equal(toText((blocks[0] as Extract<Block, { t: "p" }>).kids), "one\nstill one");
});

test("a block-ish line nobody claims still advances the parser", () => {
  // Regression: this line matches the table pattern but has no divider row, and once spun forever.
  const blocks = parseBlocks("| not a table |\nplain follow-on\n\nsecond para");
  assert.equal(blocks.length, 2);
  assert.equal(blocks[0].t, "p");
});

test("an unterminated fence still closes", () => {
  assert.deepEqual(only("```\nx"), { t: "code", v: "x", lang: undefined });
});
