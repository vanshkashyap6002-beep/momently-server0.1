require("dotenv").config({
  path: require("path").join(__dirname, "..", ".env.render"),
});

const fs = require("fs");
const path = require("path");
const { Pool } = require("pg");

const db = new Pool({
  connectionString: process.env.RENDER_DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});

async function main() {
  console.log("Connecting to Render PostgreSQL...");

  await db.query("SELECT 1");

  console.log("Render PostgreSQL connection OK.");

  const schemaPath = path.join(
    __dirname,
    "..",
    "db",
    "schema-postgres.sql"
  );

  const schema = fs.readFileSync(schemaPath, "utf8");

  console.log("Creating PostgreSQL tables...");

  await db.query(schema);

  console.log("PostgreSQL tables created successfully.");

  await db.end();
}

main().catch(async (error) => {
  console.error("Database setup failed:");
  console.error(error);
  await db.end().catch(() => {});
  process.exit(1);
});