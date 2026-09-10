const db = require("../lib/db");
const {
  ADMIN_COOKIE,
  verifyAdminToken,
} = require("../lib/jwt");

async function requireAdmin(req, res, next) {
  const token =
    req.cookies?.[ADMIN_COOKIE];

  if (!token) {
    return res.status(401).json({
      error: "Admin sign-in required.",
    });
  }

  try {
    const payload =
      verifyAdminToken(token);

    const result = await db.query(
      `
      SELECT
        id,
        full_name,
        email
      FROM admin_users
      WHERE id = $1
      `,
      [payload.sub]
    );

    const admin = result.rows[0];

    if (!admin) {
      return res.status(401).json({
        error: "Admin sign-in required.",
      });
    }

    req.admin = admin;

    next();
  } catch (err) {
    console.error(
      "Admin authentication error:",
      err.message
    );

    return res.status(401).json({
      error:
        "Your admin session has expired. Please sign in again.",
    });
  }
}

module.exports = {
  requireAdmin,
};