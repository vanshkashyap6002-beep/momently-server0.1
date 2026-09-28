const CANONICAL_FRONTEND_ORIGIN = "https://chermo.in";
const MEMORY_PATH = /^\/memory\/([a-z0-9]+(?:-[a-z0-9]+)*)$/;
const MAX_SLUG_LENGTH = 80;

function parseMemoryLink(value) {
  if (typeof value !== "string" || !value.trim() || value.length > 2048) {
    return null;
  }

  let url;
  try {
    url = new URL(value.trim());
  } catch {
    return null;
  }

  const match = MEMORY_PATH.exec(url.pathname);
  if (
    url.protocol !== "https:" ||
    url.origin !== CANONICAL_FRONTEND_ORIGIN ||
    url.username ||
    url.password ||
    url.search ||
    url.hash ||
    !match ||
    match[1].length > MAX_SLUG_LENGTH
  ) {
    return null;
  }

  return {
    slug: match[1],
    url: `${CANONICAL_FRONTEND_ORIGIN}/memory/${match[1]}`,
  };
}

module.exports = { parseMemoryLink };
