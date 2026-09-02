const db = require("../lib/db");
const { ADMIN_COOKIE, verifyAdminToken } = require("../lib/jwt");

/** Requires a logged-in admin. Reads ONLY the admin cookie — a customer
 * session cookie is a different name and a different signing secret, so it
 * is structurally impossible for a customer session to satisfy this check. */
function requireAdmin(req, res, next) {
  const token = req.cookies?.[ADMIN_COOKIE];
  if (!token) return res.status(401).json({ error: "Admin sign-in required." });

  try {
    const payload = verifyAdminToken(token);
    const admin = db.prepare("SELECT id, full_name, email FROM admin_users WHERE id = ?").get(payload.sub);
    if (!admin) return res.status(401).json({ error: "Admin sign-in required." });
    req.admin = admin;
    next();
  } catch {
    return res.status(401).json({ error: "Your admin session has expired. Please sign in again." });
  }
}

module.exports = { requireAdmin };
