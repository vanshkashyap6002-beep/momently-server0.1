require("dotenv").config();

const { Pool } = require("pg");

if (!process.env.DATABASE_URL) {
  throw new Error("DATABASE_URL is not configured.");
}

const db = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === "production"
    ? { rejectUnauthorized: false }
    : false,
});

async function run() {
  try {
    await db.query("ALTER TABLE users ADD COLUMN IF NOT EXISTS phone TEXT");
    console.log("Profile phone column is ready.");
  } catch (error) {
    console.error("Profile migration failed:", error);
    process.exitCode = 1;
  } finally {
    await db.end();
  }
}

run();
