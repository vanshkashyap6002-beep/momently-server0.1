const test = require("node:test");
const assert = require("node:assert/strict");
const { parseMemoryLink } = require("./memoryLink");

test("parses the canonical CHERMO memory URL into its stable slug", () => {
  assert.deepEqual(parseMemoryLink("https://chermo.in/memory/rahul-abc123"), {
    slug: "rahul-abc123",
    url: "https://chermo.in/memory/rahul-abc123",
  });
});

test("rejects non-canonical, insecure, or unrelated URLs", () => {
  for (const value of [
    "http://chermo.in/memory/rahul",
    "https://www.chermo.in/memory/rahul",
    "https://example.com/memory/rahul",
    "https://chermo.in/other/rahul",
    "https://chermo.in/memory/rahul?next=other",
    "https://chermo.in/memory/rahul#section",
    "https://user@chermo.in/memory/rahul",
    "not a URL",
    null,
  ]) {
    assert.equal(parseMemoryLink(value), null, String(value));
  }
});

test("accepts only lowercase URL-safe slugs up to 80 characters", () => {
  assert.equal(parseMemoryLink(`https://chermo.in/memory/${"a".repeat(80)}`).slug.length, 80);
  assert.equal(parseMemoryLink(`https://chermo.in/memory/${"a".repeat(81)}`), null);
  assert.equal(parseMemoryLink("https://chermo.in/memory/Uppercase"), null);
  assert.equal(parseMemoryLink("https://chermo.in/memory/a--b"), null);
});
