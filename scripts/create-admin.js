const crypto = require("crypto");
const bcrypt = require("bcryptjs");

require("../lib/env");
const db = require("../lib/db");

async function main() {
  const email = String(process.env.ADMIN_EMAIL || "").trim().toLowerCase();
  const password = String(process.env.ADMIN_PASSWORD || "");
  const name = String(process.env.ADMIN_NAME || "Momently Admin").trim();

  if (!email || !password) {
    throw new Error(
      "Set ADMIN_EMAIL and ADMIN_PASSWORD in your .env file before running this script."
    );
  }

  const passwordHash = await bcrypt.hash(password, 12);

  const existingResult = await db.query(
    "SELECT id FROM admin_users WHERE email = $1",
    [email]
  );

  const existing = existingResult.rows[0];

  if (existing) {
    await db.query(
      `UPDATE admin_users
       SET full_name = $1,
           password_hash = $2
       WHERE id = $3`,
      [name, passwordHash, existing.id]
    );

    console.log(`Updated admin: ${email}`);
  } else {
    await db.query(
      `INSERT INTO admin_users
       (id, full_name, email, password_hash)
       VALUES ($1, $2, $3, $4)`,
      [crypto.randomUUID(), name, email, passwordHash]
    );

    console.log(`Created admin: ${email}`);
  }
}

main()
  .then(() => db.close())
  .catch(async (err) => {
    console.error("Create-admin failed:", err);
    await db.close().catch(() => {});
    process.exit(1);
  });