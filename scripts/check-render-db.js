require("dotenv").config({
  path: require("path").join(__dirname, "..", ".env.render"),
});

const { Pool } = require("pg");

const db = new Pool({
  connectionString: process.env.RENDER_DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});

async function main() {
  console.log("Checking Render PostgreSQL...");

  for (const table of [
    "users",
    "admin_users",
    "templates",
    "orders",
    "media",
    "memory_timeline",
  ]) {
    const result = await db.query(
      `SELECT COUNT(*)::int AS count FROM ${table}`
    );

    console.log(`${table}: ${result.rows[0].count}`);
  }

  await db.end();
}

main().catch(async (error) => {
  console.error("Check failed:");
  console.error(error);
  await db.end().catch(() => {});
  process.exit(1);
});