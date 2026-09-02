// The only way an admin account is ever created — there is no public
// signup route for admins (see routes/admin.routes.js). Run this on the
// server, not from a browser.
//
// Usage:
//   node scripts/create-admin.js --name "Ops" --email admin@momently.app --password "at-least-8-chars"
// or, non-interactively via env vars (handy for CI/deploy scripts):
//   ADMIN_NAME=... ADMIN_EMAIL=... ADMIN_PASSWORD=... node scripts/create-admin.js
// or with no arguments at all, it will prompt for each value.

const crypto = require("crypto");
const readline = require("readline");
const bcrypt = require("bcryptjs");
require("../lib/env");
const db = require("../lib/db");

function parseArgs() {
  const args = {};
  const argv = process.argv.slice(2);
  for (let i = 0; i < argv.length; i += 2) {
    const key = argv[i].replace(/^--/, "");
    args[key] = argv[i + 1];
  }
  return args;
}

function prompt(question) {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  return new Promise((resolve) => rl.question(question, (answer) => { rl.close(); resolve(answer); }));
}

async function main() {
  const args = parseArgs();

  const name = args.name || process.env.ADMIN_NAME || (await prompt("Admin full name: "));
  const email = (args.email || process.env.ADMIN_EMAIL || (await prompt("Admin email: "))).toLowerCase().trim();
  const password = args.password || process.env.ADMIN_PASSWORD || (await prompt("Admin password (min 8 chars): "));

  if (!name || !email || !password || password.length < 8) {
    console.error("Name, a valid email, and a password of at least 8 characters are all required.");
    process.exit(1);
  }

  const existing = db.prepare("SELECT id FROM admin_users WHERE email = ?").get(email);
  const passwordHash = bcrypt.hashSync(password, 10);

  if (existing) {
    db.prepare("UPDATE admin_users SET full_name = ?, password_hash = ? WHERE id = ?").run(name, passwordHash, existing.id);
    console.log(`Updated existing admin: ${email}`);
  } else {
    db.prepare("INSERT INTO admin_users (id, full_name, email, password_hash) VALUES (?, ?, ?, ?)").run(
      crypto.randomUUID(), name, email, passwordHash
    );
    console.log(`Created admin: ${email}`);
  }
  console.log("Sign in at /admin/index.html with this email and password.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
