const express = require("express");
const db = require("../lib/db");

const router = express.Router();

// GET /api/memory/:slug — public, no auth. Only ever returns PUBLISHED
// orders, and only the fields meant to be shown on a public page (no
// email, no raw personal_message unless it was chosen as the closing
// message, no payment details).
router.get("/:slug", (req, res) => {
  const order = db
    .prepare(
      `SELECT orders.*, templates.name AS template_name, templates.accent AS accent
       FROM orders JOIN templates ON templates.id = orders.template_id
       WHERE orders.memory_slug = ? AND orders.status = 'PUBLISHED'`
    )
    .get(req.params.slug);

  if (!order) return res.status(404).json({ error: "This memory doesn't exist or isn't published yet." });

  const media = db
    .prepare("SELECT id, mime_type FROM media WHERE order_id = ? ORDER BY sort_order")
    .all(order.id)
    .map((m) => ({ id: m.id, url: `/api/media/${m.id}/file`, isVideo: (m.mime_type || "").startsWith("video/") }));

  const timeline = db
    .prepare("SELECT entry_date, title, description FROM memory_timeline WHERE order_id = ? ORDER BY sort_order")
    .all(order.id)
    .map((t) => ({ date: t.entry_date, title: t.title, description: t.description }));

  res.json({
    memory: {
      title: order.memory_title,
      subtitle: order.memory_subtitle,
      recipientName: order.recipient_name,
      importantDate: order.important_date,
      closingMessage: order.memory_closing_message || order.personal_message,
      accent: order.accent,
      templateName: order.template_name,
      songTitle: order.memory_song_title,
      songArtist: order.memory_song_artist,
      publishedAt: order.published_at,
      media,
      timeline,
    },
  });
});

module.exports = router;
