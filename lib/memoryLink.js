const MEMORY_PATH = /^\/memory\/([a-z0-9]+(?:-[a-z0-9]+)*)$/;
const MAX_SLUG_LENGTH = 80;

function parseMemoryLink(value) {
  if (typeof value !== "string") {
    return null;
  }
  const text = value.trim();
  if (!/^https:\/\//i.test(text) || /[\s\u0000-\u001f\u007f\\<>"]/.test(text)) return null;

  let url;
  try {
    url = new URL(text);
  } catch {
    return null;
  }

  const match = MEMORY_PATH.exec(url.pathname);
  if (
    url.protocol !== "https:" ||
    !url.hostname ||
    url.username ||
    url.password
  ) {
    return null;
  }

  return {
    // Preserve legacy internal routing without rewriting the supplied destination.
    slug: ["https://chermo.in", "https://www.chermo.in"].includes(url.origin) && match && match[1].length <= MAX_SLUG_LENGTH ? match[1] : null,
    url: text,
  };
}

module.exports = { parseMemoryLink };
