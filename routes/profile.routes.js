const express = require("express");
const db = require("../lib/db");
const { requireCustomer } = require("../middleware/customerAuth");
const { validateProfileInput } = require("../lib/profileValidation");

const router = express.Router();

function toProfile(row) {
  return {
    fullName: row.full_name,
    email: row.email,
    phone: row.phone || "",
    dateOfBirth: row.date_of_birth || "",
    relationshipStatus: row.relationship_status || "",
    aboutMe: row.bio || "",
  };
}

// GET /api/profile — return only the signed-in customer's profile.
router.get("/", requireCustomer, async (req, res) => {
  try {
    const result = await db.query(
      `SELECT full_name, email, phone, date_of_birth, relationship_status, bio
       FROM users
       WHERE id = $1`,
      [req.user.id]
    );

    const user = result.rows[0];
    if (!user) {
      return res.status(404).json({ error: "User not found." });
    }

    return res.json({ user: toProfile(user) });
  } catch (err) {
    console.error("Profile fetch error:", err);
    return res.status(500).json({ error: "Unable to load profile." });
  }
});

// PUT /api/profile — the target account always comes from the customer session.
router.put("/", requireCustomer, async (req, res) => {
  const { profile, errors } = validateProfileInput(req.body);
  if (errors) {
    return res.status(400).json({
      error: Object.values(errors)[0],
      fieldErrors: errors,
    });
  }

  try {
    const result = await db.query(
      `UPDATE users
       SET full_name = $1,
           phone = $2,
           date_of_birth = $3,
           relationship_status = $4,
           bio = $5
       WHERE id = $6
       RETURNING full_name, email, phone, date_of_birth, relationship_status, bio`,
      [
        profile.fullName,
        profile.phone,
        profile.dateOfBirth,
        profile.relationshipStatus,
        profile.aboutMe,
        req.user.id,
      ]
    );

    const updated = result.rows[0];
    if (!updated) {
      return res.status(404).json({ error: "User not found." });
    }

    return res.json({ user: toProfile(updated) });
  } catch (err) {
    console.error("Profile update error:", err);
    return res.status(500).json({ error: "Unable to update profile." });
  }
});

module.exports = router;
