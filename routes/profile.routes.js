const express = require('express');
const router = express.Router();
const db = require('../lib/db');

// Import middleware safely whether exported as a function or an object
const customerAuthModule = require('../middleware/customerAuth');
const customerAuth = typeof customerAuthModule === 'function'
  ? customerAuthModule
  : (customerAuthModule.authenticateCustomer || customerAuthModule.requireAuth || customerAuthModule.customerAuth || Object.values(customerAuthModule)[0]);

// GET /api/profile
router.get('/', customerAuth, (req, res) => {
  try {
    const userId = req.user.userId || req.user.id;

    const user = db.prepare(`
      SELECT id, full_name, email, avatar_url, date_of_birth, gender, relationship_status, bio, created_at
      FROM users
      WHERE id = ?
    `).get(userId);

    if (!user) {
      return res.status(404).json({ success: false, message: 'User not found.' });
    }

    res.json({
      success: true,
      data: {
        id: user.id,
        full_name: user.full_name || '',
        email: user.email,
        avatar_url: user.avatar_url || '',
        date_of_birth: user.date_of_birth || '',
        gender: user.gender || '',
        relationship_status: user.relationship_status || '',
        bio: user.bio || '',
        created_at: user.created_at
      }
    });
  } catch (err) {
    console.error('Profile GET error:', err);
    res.status(500).json({ success: false, message: 'Failed to retrieve profile.' });
  }
});

// PUT /api/profile
router.put('/', customerAuth, (req, res) => {
  try {
    const userId = req.user.userId || req.user.id;
    const { full_name, date_of_birth, gender, relationship_status, bio } = req.body;

    if (!full_name || full_name.trim().length === 0) {
      return res.status(400).json({ success: false, message: 'Full name is required.' });
    }

    const cleanName = full_name.trim();
    const cleanDob = date_of_birth ? date_of_birth.trim() : null;
    const cleanGender = gender ? gender.trim() : null;
    const cleanRel = relationship_status ? relationship_status.trim() : null;
    const cleanBio = bio ? bio.trim() : null;

    db.prepare(`
      UPDATE users
      SET full_name = ?,
          date_of_birth = ?,
          gender = ?,
          relationship_status = ?,
          bio = ?
      WHERE id = ?
    `).run(cleanName, cleanDob, cleanGender, cleanRel, cleanBio, userId);

    const updated = db.prepare(`
      SELECT id, full_name, email, avatar_url, date_of_birth, gender, relationship_status, bio, created_at
      FROM users
      WHERE id = ?
    `).get(userId);

    res.json({
      success: true,
      message: 'Profile updated successfully.',
      data: updated
    });
  } catch (err) {
    console.error('Profile PUT error:', err);
    res.status(500).json({ success: false, message: 'Failed to update profile.' });
  }
});

module.exports = router;