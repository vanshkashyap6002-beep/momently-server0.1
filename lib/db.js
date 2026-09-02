// Singleton better-sqlite3 connection. better-sqlite3 is synchronous, which
// is exactly what we want for a small single-instance app like this — no
// connection pool to manage, no async ceremony around simple reads.
//
// Why SQLite instead of the reference project's Postgres+Prisma: this is
// meant to run and be testable with zero external services. `prisma
// generate` needs to reach binaries.prisma.sh, and a real Postgres needs a
// server — neither is a fair "simplest suitable backend" default for a
// Stage 1 build. Swapping to Postgres later only means changing this file
// and the two db calls in each route file use (`db.prepare(...)`) to a
// Postgres client — the schema in schema.sql translates directly.

const path = require("path");
const fs = require("fs");
const Database = require("better-sqlite3");

// Resolved against the project root (not process.cwd()) so this behaves
// the same whether the app is started with `node server.js` from inside
// server/, `node server/server.js` from the project root, or by a process
// manager with some other working directory.
const PROJECT_ROOT = path.join(__dirname, "..", "..");
const DB_PATH = process.env.DATABASE_PATH
  ? path.resolve(PROJECT_ROOT, process.env.DATABASE_PATH)
  : path.join(__dirname, "..", "data", "momently.db");

fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });

const db = new Database(DB_PATH);
db.pragma("journal_mode = WAL");
db.pragma("foreign_keys = ON");

const schema = fs.readFileSync(path.join(__dirname, "..", "db", "schema.sql"), "utf8");
db.exec(schema);

// Safely add profile columns to users table if they do not exist
const columnsToAdd = [
  { name: "date_of_birth", type: "TEXT" },
  { name: "gender", type: "TEXT" },
  { name: "relationship_status", type: "TEXT" },
  { name: "bio", type: "TEXT" },
];

const existingColumns = db.prepare("PRAGMA table_info(users)").all().map((c) => c.name);

for (const col of columnsToAdd) {
  if (!existingColumns.includes(col.name)) {
    db.exec(`ALTER TABLE users ADD COLUMN ${col.name} ${col.type};`);
  }
}

module.exports = db;
