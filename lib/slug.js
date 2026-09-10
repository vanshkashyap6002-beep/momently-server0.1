const db = require("./db");

function slugify(value) {
  return String(value || "")
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}

async function buildUniqueMemorySlug({ recipientName, memoryTitle }) {
  const base =
    slugify(`${recipientName || "memory"}-${memoryTitle || "momently"}`) ||
    "momently-memory";

  let candidate = base;
  let n = 2;

  while (true) {
    const result = await db.query(
      "SELECT 1 FROM orders WHERE memory_slug = $1 LIMIT 1",
      [candidate]
    );

    if (result.rowCount === 0) {
      return candidate;
    }

    candidate = `${base}-${n}`;
    n++;
  }
}

module.exports = {
  slugify,
  buildUniqueMemorySlug,
};