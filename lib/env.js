// Every entrypoint (server.js and the scripts/ CLIs) requires this FIRST,
// before anything that reads process.env (like lib/db.js or lib/storage.js).
// Without this, running `node scripts/seed-templates.js` directly would
// silently fall back to default paths instead of respecting a custom
// DATABASE_PATH in .env, and disagree with the running server about where
// the database lives — exactly the class of bug this file exists to avoid.

const path = require("path");
require("dotenv").config({ path: path.join(__dirname, "..", "..", ".env") });
