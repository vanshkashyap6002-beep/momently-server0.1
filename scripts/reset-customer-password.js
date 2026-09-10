const bcrypt = require("bcryptjs");

require("../lib/env");
const db = require("../lib/db");

async function main() {
  const email = "vanshkashyap6002@gmail.com";

  const newPassword = "V@nsh2006";

  const passwordHash = await bcrypt.hash(newPassword, 10);

  const result = await db.query(
    `UPDATE users
     SET password_hash = $1
     WHERE email = $2
     RETURNING id, email`,
    [passwordHash, email]
  );

  if (result.rowCount === 0) {
    throw new Error("Customer account not found.");
  }

  console.log("Password reset successfully for:", result.rows[0].email);
}

main()
  .then(() => db.close())
  .catch(async (err) => {
    console.error("Password reset failed:", err);
    await db.close().catch(() => {});
    process.exit(1);
  });