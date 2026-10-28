const test = require("node:test");
const assert = require("node:assert/strict");
const { parseMemoryLink } = require("./memoryLink");

test("parses the canonical CHERMO memory URL into its stable slug", () => {
  assert.deepEqual(parseMemoryLink("https://chermo.in/memory/rahul-abc123"), {
    slug: "rahul-abc123",
    url: "https://chermo.in/memory/rahul-abc123",
  });
});

test("rejects insecure or malformed URLs", () => {
  for (const value of [
    "http://chermo.in/memory/rahul",
    "https://user@chermo.in/memory/rahul",
    "not a URL",
    null,
  ]) {
    assert.equal(parseMemoryLink(value), null, String(value));
  }
});

test("derives legacy route keys only when compatible, without restricting other URLs", () => {
  assert.equal(parseMemoryLink(`https://chermo.in/memory/${"a".repeat(80)}`).slug.length, 80);
  assert.equal(parseMemoryLink(`https://chermo.in/memory/${"a".repeat(81)}`).slug, null);
  assert.equal(parseMemoryLink("https://chermo.in/memory/Uppercase").slug, null);
  assert.equal(parseMemoryLink("https://chermo.in/memory/a--b").slug, null);
});
