const express = require("express");
const db = require("../lib/db");

const router = express.Router();

// GET /api/memory/:slug
// Public route.
// Only returns memories that are already PUBLISHED.
router.get("/:slug", async (req, res) => {
  try {
    const { slug } = req.params;

    const orderResult = await db.pool.query(
      `
      SELECT
        orders.*,
        templates.name AS template_name,
        templates.accent AS accent
      FROM orders
      JOIN templates
        ON templates.id = orders.template_id
      WHERE orders.memory_slug = $1
        AND orders.status = 'PUBLISHED'
      LIMIT 1
      `,
      [slug]
    );

    const order = orderResult.rows[0];

    if (!order) {
      return res.status(404).json({
        error:
          "This memory doesn't exist or isn't published yet."
      });
    }

    const mediaResult = await db.pool.query(
      `
      SELECT
        id,
        mime_type
      FROM media
      WHERE order_id = $1
      ORDER BY sort_order
      `,
      [order.id]
    );

    const media = mediaResult.rows.map((m) => ({
      id: m.id,
      url: `/api/media/${m.id}/file`,
      isVideo: (m.mime_type || "").startsWith("video/")
    }));

    const timelineResult = await db.pool.query(
      `
      SELECT
        entry_date,
        title,
        description
      FROM memory_timeline
      WHERE order_id = $1
      ORDER BY sort_order
      `,
      [order.id]
    );

    const timeline = timelineResult.rows.map((t) => ({
      date: t.entry_date,
      title: t.title,
      description: t.description
    }));

    return res.json({
      memory: {
        title: order.memory_title,
        subtitle: order.memory_subtitle,
        recipientName: order.recipient_name,
        importantDate: order.important_date,
        closingMessage:
          order.memory_closing_message ||
          order.personal_message,
        accent: order.accent,
        templateName: order.template_name,
        songTitle: order.memory_song_title,
        songArtist: order.memory_song_artist,
        publishedAt: order.published_at,
        media,
        timeline
      }
    });
  } catch (error) {
    console.error(
      "Public memory error:",
      error
    );

    return res.status(500).json({
      error: "Unable to load this memory."
    });
  }
});

module.exports = router;