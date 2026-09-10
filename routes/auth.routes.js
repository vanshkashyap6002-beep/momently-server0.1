const express = require("express");
const crypto = require("crypto");
const bcrypt = require("bcryptjs");
const db = require("../lib/db");
const { checkRateLimit } = require("../lib/rateLimit");
const {
  CUSTOMER_COOKIE,
  signCustomerToken,
  cookieOptions,
} = require("../lib/jwt");
const googleOAuth = require("../lib/googleOAuth");
const { requireCustomer } = require("../middleware/customerAuth");

const router = express.Router();

function publicUser(user) {
  return {
    id: user.id,
    fullName: user.full_name,
    email: user.email,
    avatarUrl: user.avatar_url,
  };
}

// POST /api/auth/signup
router.post("/signup", async (req, res) => {
  try {
    const { fullName, email, password } = req.body || {};

    if (
      !checkRateLimit(
        `signup:${req.ip}`,
        5,
        60 * 60 * 1000
      )
    ) {
      return res.status(429).json({
        error: "Too many signup attempts. Please try again later.",
      });
    }

    if (
      !fullName ||
      !email ||
      !password ||
      String(password).length < 8
    ) {
      return res.status(400).json({
        error: "Name, email, and an 8+ character password are required.",
      });
    }

    const normalizedEmail = email.toLowerCase().trim();

    const existingResult = await db.query(
      "SELECT id FROM users WHERE email = $1",
      [normalizedEmail]
    );

    const existing = existingResult.rows[0];

    if (existing) {
      return res.status(409).json({
        error: "An account with that email already exists.",
      });
    }

    const id = crypto.randomUUID();
    const passwordHash = bcrypt.hashSync(password, 10);

    await db.query(
      `
      INSERT INTO users
        (id, full_name, email, password_hash)
      VALUES
        ($1, $2, $3, $4)
      `,
      [
        id,
        fullName.trim(),
        normalizedEmail,
        passwordHash,
      ]
    );

    const userResult = await db.query(
      "SELECT * FROM users WHERE id = $1",
      [id]
    );

    const user = userResult.rows[0];

    res.cookie(
      CUSTOMER_COOKIE,
      signCustomerToken(user),
      cookieOptions
    );

    return res.status(201).json({
      user: publicUser(user),
    });
  } catch (err) {
    console.error("Signup error:", err);

    return res.status(500).json({
      error: "Unable to create your account.",
    });
  }
});

// POST /api/auth/login
router.post("/login", async (req, res) => {
  try {
    const { email, password } = req.body || {};

    if (
      !checkRateLimit(
        `login:${String(email || "").toLowerCase()}`,
        10,
        5 * 60 * 1000
      )
    ) {
      return res.status(429).json({
        error: "Too many attempts. Please wait a few minutes and try again.",
      });
    }

    if (!email || !password) {
      return res.status(400).json({
        error: "Email and password are required.",
      });
    }

    const normalizedEmail = email.toLowerCase().trim();

    const result = await db.query(
      "SELECT * FROM users WHERE email = $1",
      [normalizedEmail]
    );

    const user = result.rows[0];

    if (
      !user ||
      !user.password_hash ||
      !bcrypt.compareSync(password, user.password_hash)
    ) {
      return res.status(401).json({
        error: "Incorrect email or password.",
      });
    }

    res.cookie(
      CUSTOMER_COOKIE,
      signCustomerToken(user),
      cookieOptions
    );

    return res.json({
      user: publicUser(user),
    });
  } catch (err) {
    console.error("Login error:", err);

    return res.status(500).json({
      error: "Unable to sign in.",
    });
  }
});

// GET /api/auth/google
router.get("/google", (req, res) => {
  if (!googleOAuth.isConfigured()) {
    return res
      .status(503)
      .send("Google sign-in isn't configured on this server yet.");
  }

  const state = googleOAuth.generateState();

  const nextUrl =
    typeof req.query.next === "string"
      ? req.query.next
      : "/templates.html";

  res.cookie(
    "momently_oauth_state",
    JSON.stringify({
      state,
      nextUrl,
    }),
    {
      httpOnly: true,
      sameSite: "lax",
      maxAge: 10 * 60 * 1000,
      path: "/",
    }
  );

  res.redirect(
    googleOAuth.buildAuthUrl(state)
  );
});

// GET /api/auth/google/callback
router.get("/google/callback", async (req, res) => {
  try {
    const raw = req.cookies?.momently_oauth_state;

    const saved = raw
      ? JSON.parse(raw)
      : null;

    if (
      !saved ||
      !req.query.state ||
      saved.state !== req.query.state
    ) {
      return res.status(400).send(
        "Google sign-in failed: state mismatch. Please try again."
      );
    }

    res.clearCookie(
      "momently_oauth_state",
      { path: "/" }
    );

    const profile =
      await googleOAuth.exchangeCodeForProfile(
        req.query.code
      );

    const normalizedEmail =
      profile.email.toLowerCase().trim();

    const userResult = await db.query(
      `
      SELECT *
      FROM users
      WHERE google_id = $1
         OR email = $2
      `,
      [
        profile.googleId,
        normalizedEmail,
      ]
    );

    let user = userResult.rows[0];

    if (!user) {
      const id = crypto.randomUUID();

      await db.query(
        `
        INSERT INTO users
          (id, full_name, email, google_id, avatar_url)
        VALUES
          ($1, $2, $3, $4, $5)
        `,
        [
          id,
          profile.name,
          normalizedEmail,
          profile.googleId,
          profile.avatarUrl,
        ]
      );

      const createdResult = await db.query(
        "SELECT * FROM users WHERE id = $1",
        [id]
      );

      user = createdResult.rows[0];
    } else if (!user.google_id) {
      await db.query(
        `
        UPDATE users
        SET
          google_id = $1,
          avatar_url = COALESCE(avatar_url, $2)
        WHERE id = $3
        `,
        [
          profile.googleId,
          profile.avatarUrl,
          user.id,
        ]
      );

      const updatedResult = await db.query(
        "SELECT * FROM users WHERE id = $1",
        [user.id]
      );

      user = updatedResult.rows[0];
    }

    res.cookie(
      CUSTOMER_COOKIE,
      signCustomerToken(user),
      cookieOptions
    );

    return res.redirect(
      saved.nextUrl || "/templates.html"
    );
  } catch (err) {
    console.error(
      "Google OAuth callback error:",
      err.message
    );

    return res.status(502).send(
      "Google sign-in failed. Please go back and try again."
    );
  }
});

// POST /api/auth/logout
router.post("/logout", (_req, res) => {
  res.clearCookie(
    CUSTOMER_COOKIE,
    { path: "/" }
  );

  res.json({ ok: true });
});

// GET /api/auth/me
router.get(
  "/me",
  requireCustomer,
  (req, res) => {
    res.json({
      user: publicUser(req.user),
    });
  }
);

// GET /api/auth/google/available
router.get(
  "/google/available",
  (_req, res) => {
    res.json({
      available:
        googleOAuth.isConfigured(),
    });
  }
);

module.exports = router;