const express = require("express");
const bcrypt = require("bcryptjs");
const db = require("../lib/db");
const { signAdminToken, ADMIN_COOKIE } = require("../lib/jwt");
const { requireAdmin } = require("../middleware/adminAuth");
const { buildUniqueMemorySlug } = require("../lib/slug");

const router = express.Router();

router.post("/login", async (req, res) => {
  const { email, password } = req.body || {};

  try {
    const result = await db.query(
      "SELECT * FROM admin_users WHERE email = $1",
      [String(email).toLowerCase()]
    );

    const admin = result.rows[0];

    if (!admin) {
      return res.status(401).json({ error: "Invalid credentials." });
    }

    const ok = await bcrypt.compare(password || "", admin.password_hash);

    if (!ok) {
      return res.status(401).json({ error: "Invalid credentials." });
    }

    const token = signAdminToken(admin);

    res.cookie(ADMIN_COOKIE, token, {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      maxAge: 7 * 24 * 60 * 60 * 1000,
    });

    res.json({
      ok: true,
      admin: {
        id: admin.id,
        fullName: admin.full_name,
        email: admin.email,
      },
    });
  } catch (err) {
    console.error("Admin login error:", err);
    res.status(500).json({ error: "Unable to login." });
  }
});

router.post("/logout", (_req, res) => {
  res.clearCookie(ADMIN_COOKIE);
  res.json({ ok: true });
});

router.get("/orders", requireAdmin, async (req, res) => {
  try {
    const { status, search } = req.query;

    let sql = `
      SELECT
        orders.*,
        users.full_name AS customer_name,
        users.email AS customer_email,
        templates.name AS template_name
      FROM orders
      JOIN users ON users.id = orders.user_id
      JOIN templates ON templates.id = orders.template_id
      WHERE 1 = 1
    `;

    const params = [];

    if (status) {
      params.push(status);
      sql += ` AND orders.status = $${params.length}`;
    }

    if (search) {
      params.push(`%${String(search).toLowerCase()}%`);
      sql += `
        AND (
          LOWER(users.email) LIKE $${params.length}
          OR LOWER(users.full_name) LIKE $${params.length}
          OR LOWER(COALESCE(orders.recipient_name, '')) LIKE $${params.length}
          OR LOWER(COALESCE(orders.memory_title, '')) LIKE $${params.length}
        )
      `;
    }

    sql += " ORDER BY orders.created_at DESC";

    const result = await db.query(sql, params);

    const rows = result.rows;

    for (const row of rows) {
      const mediaResult = await db.query(
        `SELECT id, filename, mime_type, size_bytes
         FROM media
         WHERE order_id = $1
         ORDER BY sort_order`,
        [row.id]
      );

      const timelineResult = await db.query(
        `SELECT id, entry_date, title, description, sort_order
         FROM memory_timeline
         WHERE order_id = $1
         ORDER BY sort_order`,
        [row.id]
      );

      row.media = mediaResult.rows;
      row.timeline = timelineResult.rows;
    }

    res.json({ orders: rows });
  } catch (err) {
    console.error("Admin orders error:", err);
    res.status(500).json({ error: "Unable to load orders." });
  }
});

router.get("/orders/:id", requireAdmin, async (req, res) => {
  try {
    const result = await db.query(
      "SELECT * FROM orders WHERE id = $1",
      [req.params.id]
    );

    const order = result.rows[0];

    if (!order) {
      return res.status(404).json({ error: "Order not found." });
    }

    const mediaResult = await db.query(
      `SELECT *
       FROM media
       WHERE order_id = $1
       ORDER BY sort_order`,
      [order.id]
    );

    const timelineResult = await db.query(
      `SELECT *
       FROM memory_timeline
       WHERE order_id = $1
       ORDER BY sort_order`,
      [order.id]
    );

    res.json({
      order,
      media: mediaResult.rows,
      timeline: timelineResult.rows,
    });
  } catch (err) {
    console.error("Admin order error:", err);
    res.status(500).json({ error: "Unable to load order." });
  }
});

router.patch("/orders/:id/status", requireAdmin, async (req, res) => {
  const { status } = req.body || {};

  const allowedStatuses = [
    "PENDING",
    "PAID",
    "IN_PROGRESS",
    "READY",
    "PUBLISHED",
  ];

  if (!allowedStatuses.includes(status)) {
    return res.status(400).json({ error: "Invalid status." });
  }

  try {
    const result = await db.query(
      "SELECT * FROM orders WHERE id = $1",
      [req.params.id]
    );

    const order = result.rows[0];

    if (!order) {
      return res.status(404).json({ error: "Order not found." });
    }

    await db.query(
      `UPDATE orders
       SET status = $1,
           updated_at = CURRENT_TIMESTAMP
       WHERE id = $2`,
      [status, order.id]
    );

    res.json({
      ok: true,
      order: {
        id: order.id,
        status,
      },
    });
  } catch (err) {
    console.error("Admin status update error:", err);
    res.status(500).json({ error: "Unable to update order status." });
  }
});

router.put("/orders/:id/memory", requireAdmin, async (req, res) => {
  const {
    memoryTitle,
    memorySubtitle,
    memoryClosingMessage,
    memorySongTitle,
    memorySongArtist,
    timeline,
  } = req.body || {};

  try {
    const result = await db.query(
      "SELECT * FROM orders WHERE id = $1",
      [req.params.id]
    );

    const order = result.rows[0];

    if (!order) {
      return res.status(404).json({ error: "Order not found." });
    }

    await db.query(
      `UPDATE orders
       SET memory_title = $1,
           memory_subtitle = $2,
           memory_closing_message = $3,
           memory_song_title = $4,
           memory_song_artist = $5,
           updated_at = CURRENT_TIMESTAMP
       WHERE id = $6`,
      [
        memoryTitle || null,
        memorySubtitle || null,
        memoryClosingMessage || null,
        memorySongTitle || null,
        memorySongArtist || null,
        order.id,
      ]
    );

    const client = await db.pool.connect();

    try {
      await client.query("BEGIN");

      await client.query(
        "DELETE FROM memory_timeline WHERE order_id = $1",
        [order.id]
      );

      const entries = Array.isArray(timeline) ? timeline : [];

      for (let i = 0; i < entries.length; i++) {
        const entry = entries[i];

        await client.query(
          `INSERT INTO memory_timeline
           (id, order_id, entry_date, title, description, sort_order)
           VALUES ($1, $2, $3, $4, $5, $6)`,
          [
            require("crypto").randomUUID(),
            order.id,
            entry.entryDate || null,
            entry.title || null,
            entry.description || null,
            i,
          ]
        );
      }

      await client.query("COMMIT");
    } catch (err) {
      await client.query("ROLLBACK");
      throw err;
    } finally {
      client.release();
    }

    res.json({ ok: true });
  } catch (err) {
    console.error("Admin memory save error:", err);
    res.status(500).json({ error: "Unable to save memory." });
  }
});

router.post("/orders/:id/publish", requireAdmin, async (req, res) => {
  try {
    const result = await db.query(
      `SELECT
         orders.*,
         users.email AS customer_email
       FROM orders
       JOIN users ON users.id = orders.user_id
       WHERE orders.id = $1`,
      [req.params.id]
    );

    const order = result.rows[0];

    if (!order) {
      return res.status(404).json({ error: "Order not found." });
    }

    if (order.status !== "READY") {
      return res.status(409).json({
        error: "Order must be READY before publishing.",
      });
    }

    const memorySlug = await buildUniqueMemorySlug({
      recipientName: order.recipient_name,
      memoryTitle: order.memory_title,
    });

    await db.query(
      `UPDATE orders
       SET status = 'PUBLISHED',
           memory_slug = $1,
           published_at = CURRENT_TIMESTAMP,
           updated_at = CURRENT_TIMESTAMP
       WHERE id = $2`,
      [memorySlug, order.id]
    );

    res.json({
      ok: true,
      memorySlug,
    });
  } catch (err) {
    console.error("Admin publish error:", err);
    res.status(500).json({
      error: "Unable to publish memory.",
    });
  }
});

module.exports = router;