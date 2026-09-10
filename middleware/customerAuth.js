const db = require("../lib/db");
const {
  CUSTOMER_COOKIE,
  verifyCustomerToken,
} = require("../lib/jwt");

/**
 * Requires a logged-in customer.
 */
async function requireCustomer(req, res, next) {
  const token =
    req.cookies?.[CUSTOMER_COOKIE];

  if (!token) {
    return res.status(401).json({
      error: "Please sign in to continue.",
    });
  }

  try {
    const payload =
      verifyCustomerToken(token);

    const result = await db.query(
      `
      SELECT
        id,
        full_name,
        email,
        avatar_url
      FROM users
      WHERE id = $1
      `,
      [payload.sub]
    );

    const user = result.rows[0];

    if (!user) {
      return res.status(401).json({
        error: "Please sign in to continue.",
      });
    }

    req.user = user;

    next();
  } catch (err) {
    console.error(
      "Customer authentication error:",
      err.message
    );

    return res.status(401).json({
      error:
        "Your session has expired. Please sign in again.",
    });
  }
}

/**
 * Attaches req.user if a valid customer session exists,
 * but doesn't block the request.
 */
async function attachCustomerIfPresent(
  req,
  _res,
  next
) {
  const token =
    req.cookies?.[CUSTOMER_COOKIE];

  if (!token) {
    return next();
  }

  try {
    const payload =
      verifyCustomerToken(token);

    const result = await db.query(
      `
      SELECT
        id,
        full_name,
        email,
        avatar_url
      FROM users
      WHERE id = $1
      `,
      [payload.sub]
    );

    const user = result.rows[0];

    if (user) {
      req.user = user;
    }
  } catch (err) {
    // Invalid/expired customer session.
    // This middleware intentionally doesn't block.
  }

  next();
}

module.exports = {
  requireCustomer,
  attachCustomerIfPresent,
};