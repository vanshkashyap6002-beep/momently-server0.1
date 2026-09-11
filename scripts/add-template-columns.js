require("dotenv").config();

const { Pool } = require("pg");

const db = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: {
    rejectUnauthorized: false,
  },
});

async function run() {
  try {
    await db.query(`
      ALTER TABLE templates
      ADD COLUMN IF NOT EXISTS "shortDescription" TEXT;

      ALTER TABLE templates
      ADD COLUMN IF NOT EXISTS description TEXT;
    `);

    console.log("Template columns added successfully.");
  } catch (error) {
    console.error("Migration failed:", error);
  } finally {
    await db.end();
  }
}

run();