const express = require("express");
const db = require("../lib/db");
const { requireCustomer } = require("../middleware/customerAuth");

const router = express.Router();

// GET /api/profile
router.get("/", requireCustomer, async (req, res) => {
  try {
    const result = await db.query(
      `SELECT
         id,
         full_name,
         email,
         avatar_url,
         date_of_birth,
         gender,
         relationship_status,
         bio,
         created_at
       FROM users
       WHERE id = $1`,
      [req.user.id]
    );

    const user = result.rows[0];

    if (!user) {
      return res.status(404).json({ error: "User not found." });
    }

    res.json({ user });
  } catch (err) {
    console.error("Profile fetch error:", err);
    res.status(500).json({ error: "Unable to load profile." });
  }
});

// PUT /api/profile
router.put("/", requireCustomer, async (req, res) => {
  const {
    fullName,
    dateOfBirth,
    gender,
    relationshipStatus,
    bio,
  } = req.body || {};

  try {
    await db.query(
      `UPDATE users
       SET full_name = $1,
           date_of_birth = $2,
           gender = $3,
           relationship_status = $4,
           bio = $5
       WHERE id = $6`,
      [
        fullName || null,
        dateOfBirth || null,
        gender || null,
        relationshipStatus || null,
        bio || null,
        req.user.id,
      ]
    );

    const result = await db.query(
      `SELECT
         id,
         full_name,
         email,
         avatar_url,
         date_of_birth,
         gender,
         relationship_status,
         bio,
         created_at
       FROM users
       WHERE id = $1`,
      [req.user.id]
    );

    const updated = result.rows[0];

    if (!updated) {
      return res.status(404).json({ error: "User not found." });
    }

    res.json({ user: updated });
  } catch (err) {
    console.error("Profile update error:", err);
    res.status(500).json({ error: "Unable to update profile." });
  }
});

module.exports = router;