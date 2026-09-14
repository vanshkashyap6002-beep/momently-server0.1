const jwt = require("jsonwebtoken");

// --------------------------------------------------
// Customer session
// --------------------------------------------------

const CUSTOMER_SECRET =
  process.env.SESSION_SECRET ||
  "dev-only-customer-secret-change-me";

// --------------------------------------------------
// Admin session
// --------------------------------------------------

const ADMIN_SECRET =
  process.env.ADMIN_SESSION_SECRET ||
  "dev-only-admin-secret-change-me";

// --------------------------------------------------
// Cookie names
// --------------------------------------------------

const CUSTOMER_COOKIE = "momently_session";
const ADMIN_COOKIE = "momently_admin_session";

// --------------------------------------------------
// Session duration
// --------------------------------------------------

const SEVEN_DAYS = 60 * 60 * 24 * 7;

// --------------------------------------------------
// Environment
// --------------------------------------------------

const isProduction =
  process.env.NODE_ENV === "production";

// --------------------------------------------------
// Cookie options
// --------------------------------------------------

const cookieOptions = {
  httpOnly: true,

  sameSite: isProduction
    ? "none"
    : "lax",

  secure: isProduction,

  maxAge: SEVEN_DAYS * 1000,

  path: "/",
};

// --------------------------------------------------
// Customer token
// --------------------------------------------------

function signCustomerToken(user) {
  return jwt.sign(
    {
      sub: user.id,
      type: "customer",
    },
    CUSTOMER_SECRET,
    {
      expiresIn: SEVEN_DAYS,
    }
  );
}

function verifyCustomerToken(token) {
  const payload = jwt.verify(
    token,
    CUSTOMER_SECRET
  );

  if (payload.type !== "customer") {
    throw new Error("Wrong token type");
  }

  return payload;
}

// --------------------------------------------------
// Admin token
// --------------------------------------------------

function signAdminToken(admin) {
  return jwt.sign(
    {
      sub: admin.id,
      type: "admin",
    },
    ADMIN_SECRET,
    {
      expiresIn: SEVEN_DAYS,
    }
  );
}

function verifyAdminToken(token) {
  const payload = jwt.verify(
    token,
    ADMIN_SECRET
  );

  if (payload.type !== "admin") {
    throw new Error("Wrong token type");
  }

  return payload;
}

// --------------------------------------------------
// Exports
// --------------------------------------------------

module.exports = {
  CUSTOMER_COOKIE,
  ADMIN_COOKIE,

  signCustomerToken,
  verifyCustomerToken,

  signAdminToken,
  verifyAdminToken,

  cookieOptions,
};