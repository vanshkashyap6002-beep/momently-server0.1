// Two completely separate token namespaces — separate secrets, separate
// cookie names, separate `type` claim. This is deliberate: it's how the
// customer login and the admin login stay non-colliding all the way down,
// not just at the UI/route level. A customer token can never pass
// requireAdmin, and an admin token can never pass requireCustomer, even if
// someone tried to hand-craft a cookie.

const jwt = require("jsonwebtoken");

const CUSTOMER_SECRET = process.env.SESSION_SECRET || "dev-only-customer-secret-change-me";
const ADMIN_SECRET = process.env.ADMIN_SESSION_SECRET || "dev-only-admin-secret-change-me";

const CUSTOMER_COOKIE = "momently_session";
const ADMIN_COOKIE = "momently_admin_session";
const SEVEN_DAYS = 60 * 60 * 24 * 7;

function signCustomerToken(user) {
  return jwt.sign({ sub: user.id, type: "customer" }, CUSTOMER_SECRET, { expiresIn: SEVEN_DAYS });
}

function verifyCustomerToken(token) {
  const payload = jwt.verify(token, CUSTOMER_SECRET);
  if (payload.type !== "customer") throw new Error("Wrong token type");
  return payload;
}

function signAdminToken(admin) {
  return jwt.sign({ sub: admin.id, type: "admin" }, ADMIN_SECRET, { expiresIn: SEVEN_DAYS });
}

function verifyAdminToken(token) {
  const payload = jwt.verify(token, ADMIN_SECRET);
  if (payload.type !== "admin") throw new Error("Wrong token type");
  return payload;
}

const cookieOptions = {
  httpOnly: true,
  sameSite: "lax",
  secure: process.env.NODE_ENV === "production",
  maxAge: SEVEN_DAYS * 1000,
  path: "/",
};

module.exports = {
  CUSTOMER_COOKIE,
  ADMIN_COOKIE,
  signCustomerToken,
  verifyCustomerToken,
  signAdminToken,
  verifyAdminToken,
  cookieOptions,
};
