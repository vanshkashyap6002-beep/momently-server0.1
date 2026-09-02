const db = require("./db");

function slugify(input) {
  return String(input || "")
    .toLowerCase()
    .trim()
    .replace(/['"]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60) || "memory";
}

/** Builds a unique /memory/<slug> from the recipient name and/or memory
 * title (e.g. "rahul-priya"), appending -2, -3, etc. on collision. */
function buildUniqueMemorySlug({ recipientName, memoryTitle }) {
  const base = slugify(recipientName || memoryTitle || "memory");
  let candidate = base;
  let n = 2;
  const exists = db.prepare("SELECT 1 FROM orders WHERE memory_slug = ?");
  while (exists.get(candidate)) {
    candidate = `${base}-${n}`;
    n += 1;
  }
  return candidate;
}

module.exports = { slugify, buildUniqueMemorySlug };
