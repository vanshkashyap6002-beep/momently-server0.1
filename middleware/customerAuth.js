const db = require("../lib/db");
const { CUSTOMER_COOKIE, verifyCustomerToken } = require("../lib/jwt");

/** Requires a logged-in customer. Never accepts an admin token — see lib/jwt.js. */
function requireCustomer(req, res, next) {
  const token = req.cookies?.[CUSTOMER_COOKIE];
  if (!token) return res.status(401).json({ error: "Please sign in to continue." });

  try {
    const payload = verifyCustomerToken(token);
    const user = db.prepare("SELECT id, full_name, email, avatar_url FROM users WHERE id = ?").get(payload.sub);
    if (!user) return res.status(401).json({ error: "Please sign in to continue." });
    req.user = user;
    next();
  } catch {
    return res.status(401).json({ error: "Your session has expired. Please sign in again." });
  }
}

/** Attaches req.user if a valid customer session exists, but doesn't block the request. */
function attachCustomerIfPresent(req, _res, next) {
  const token = req.cookies?.[CUSTOMER_COOKIE];
  if (!token) return next();
  try {
    const payload = verifyCustomerToken(token);
    const user = db.prepare("SELECT id, full_name, email, avatar_url FROM users WHERE id = ?").get(payload.sub);
    if (user) req.user = user;
  } catch {
    // Not signed in — fine, this middleware never blocks.
  }
  next();
}

module.exports = { requireCustomer, attachCustomerIfPresent };
