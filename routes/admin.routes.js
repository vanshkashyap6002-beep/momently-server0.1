const express = require("express");
const bcrypt = require("bcryptjs");
const db = require("../lib/db");
const { checkRateLimit } = require("../lib/rateLimit");
const { ADMIN_COOKIE, signAdminToken, cookieOptions } = require("../lib/jwt");
const { requireAdmin } = require("../middleware/adminAuth");
const { buildUniqueMemorySlug } = require("../lib/slug");
const { sendMemoryPublishedEmail } = require("../lib/mailer");

const router = express.Router();

// ---------------------------------------------------------------------------
// Admin auth — entirely separate from /api/auth/*. There is no signup route
// here on purpose: admin accounts are only ever created by running
// `npm run create-admin` on the server (see scripts/create-admin.js).
// ---------------------------------------------------------------------------

router.post("/login", (req, res) => {
  const { email, password } = req.body || {};
  if (!checkRateLimit(`admin-login:${String(email || "").toLowerCase()}`, 10, 5 * 60 * 1000)) {
    return res.status(429).json({ error: "Too many attempts. Please wait a few minutes and try again." });
  }
  if (!email || !password) return res.status(400).json({ error: "Email and password are required." });

  const admin = db.prepare("SELECT * FROM admin_users WHERE email = ?").get(String(email).toLowerCase());
  if (!admin || !bcrypt.compareSync(password, admin.password_hash)) {
    return res.status(401).json({ error: "Incorrect email or password." });
  }

  res.cookie(ADMIN_COOKIE, signAdminToken(admin), cookieOptions);
  res.json({ admin: { id: admin.id, fullName: admin.full_name, email: admin.email } });
});

router.post("/logout", (_req, res) => {
  res.clearCookie(ADMIN_COOKIE, { path: "/" });
  res.json({ ok: true });
});

router.get("/me", requireAdmin, (req, res) => {
  res.json({ admin: { id: req.admin.id, fullName: req.admin.full_name, email: req.admin.email } });
});

// ---------------------------------------------------------------------------
// Orders — everything below requires an admin session.
// ---------------------------------------------------------------------------

function summarizeOrder(row) {
  return {
    id: row.id,
    customerName: row.full_name,
    customerEmail: row.email,
    templateName: row.template_name,
    accent: row.accent,
    recipientName: row.recipient_name,
    memoryTitle: row.memory_title,
    status: row.status,
    paymentStatus: row.payment_status,
    amount: row.amount,
    memorySlug: row.memory_slug,
    createdAt: row.created_at,
  };
}

router.get("/orders", requireAdmin, (req, res) => {
  const { status } = req.query;
  let sql = `SELECT orders.*, users.full_name, users.email, templates.name AS template_name, templates.accent AS accent
             FROM orders
             JOIN users ON users.id = orders.user_id
             JOIN templates ON templates.id = orders.template_id`;
  const params = [];
  if (status) {
    sql += " WHERE orders.status = ?";
    params.push(status);
  }
  sql += " ORDER BY orders.created_at DESC";

  const rows = db.prepare(sql).all(...params);
  res.json({ orders: rows.map(summarizeOrder) });
});

router.get("/orders/:id", requireAdmin, (req, res) => {
  const row = db
    .prepare(
      `SELECT orders.*, users.full_name, users.email, templates.name AS template_name, templates.accent AS accent, templates.slug AS template_slug
       FROM orders
       JOIN users ON users.id = orders.user_id
       JOIN templates ON templates.id = orders.template_id
       WHERE orders.id = ?`
    )
    .get(req.params.id);
  if (!row) return res.status(404).json({ error: "Order not found." });

  const media = db.prepare("SELECT id, filename, mime_type, size_bytes FROM media WHERE order_id = ? ORDER BY sort_order").all(row.id);
  const timeline = db.prepare("SELECT id, entry_date, title, description, sort_order FROM memory_timeline WHERE order_id = ? ORDER BY sort_order").all(row.id);

  res.json({
    order: {
      ...summarizeOrder(row),
      customerEmail: row.email,
      importantDate: row.important_date,
      personalMessage: row.personal_message,
      templateSlug: row.template_slug,
      memorySubtitle: row.memory_subtitle,
      memoryClosingMessage: row.memory_closing_message,
      memorySongTitle: row.memory_song_title,
      memorySongArtist: row.memory_song_artist,
      media: media.map((m) => ({ id: m.id, filename: m.filename, mimeType: m.mime_type, sizeBytes: m.size_bytes, url: `/api/media/${m.id}/file` })),
      timeline: timeline.map((t) => ({ id: t.id, date: t.entry_date, title: t.title, description: t.description })),
    },
  });
});

const VALID_STATUSES = ["PENDING", "PAID", "IN_PROGRESS", "READY", "PUBLISHED"];

// PATCH /api/admin/orders/:id/status  { status }
router.patch("/orders/:id/status", requireAdmin, (req, res) => {
  const { status } = req.body || {};
  if (!VALID_STATUSES.includes(status)) return res.status(400).json({ error: "Invalid status." });
  if (status === "PUBLISHED") {
    return res.status(400).json({ error: "Use POST /orders/:id/publish to publish — it also creates the memory link and sends the email." });
  }

  const order = db.prepare("SELECT * FROM orders WHERE id = ?").get(req.params.id);
  if (!order) return res.status(404).json({ error: "Order not found." });

  db.prepare("UPDATE orders SET status = ?, updated_at = datetime('now') WHERE id = ?").run(status, order.id);
  res.json({ ok: true });
});

// PATCH /api/admin/orders/:id/memory — save the hand-built memory content
// (draft; does not publish). timeline replaces the full set each save,
// which keeps reordering/deleting entries simple from the admin UI.
router.patch("/orders/:id/memory", requireAdmin, (req, res) => {
  const order = db.prepare("SELECT * FROM orders WHERE id = ?").get(req.params.id);
  if (!order) return res.status(404).json({ error: "Order not found." });

  const { memoryTitle, memorySubtitle, closingMessage, songTitle, songArtist, timeline } = req.body || {};

  db.prepare(
    `UPDATE orders SET memory_title = ?, memory_subtitle = ?, memory_closing_message = ?, memory_song_title = ?, memory_song_artist = ?, updated_at = datetime('now')
     WHERE id = ?`
  ).run(memoryTitle ?? order.memory_title, memorySubtitle ?? null, closingMessage ?? null, songTitle ?? null, songArtist ?? null, order.id);

  if (Array.isArray(timeline)) {
    const del = db.prepare("DELETE FROM memory_timeline WHERE order_id = ?");
    const ins = db.prepare("INSERT INTO memory_timeline (id, order_id, entry_date, title, description, sort_order) VALUES (?, ?, ?, ?, ?, ?)");
    const tx = db.transaction((entries) => {
      del.run(order.id);
      entries.forEach((entry, i) => {
        ins.run(require("crypto").randomUUID(), order.id, entry.date || null, entry.title || null, entry.description || null, i);
      });
    });
    tx(timeline);
  }

  res.json({ ok: true });
});

// POST /api/admin/orders/:id/publish — flips status, mints the slug, emails the customer.
router.post("/orders/:id/publish", requireAdmin, async (req, res) => {
  const order = db.prepare("SELECT orders.*, users.email AS customer_email FROM orders JOIN users ON users.id = orders.user_id WHERE orders.id = ?").get(req.params.id);
  if (!order) return res.status(404).json({ error: "Order not found." });
  if (order.payment_status !== "PAID") return res.status(409).json({ error: "This order hasn't been paid for yet." });
  if (!order.memory_title) return res.status(409).json({ error: "Add a memory title before publishing." });

  const slug = order.memory_slug || buildUniqueMemorySlug({ recipientName: order.recipient_name, memoryTitle: order.memory_title });

  db.prepare(
    "UPDATE orders SET status = 'PUBLISHED', memory_slug = ?, published_at = datetime('now'), updated_at = datetime('now') WHERE id = ?"
  ).run(slug, order.id);

  const base = process.env.APP_BASE_URL || "http://localhost:3000";
  const memoryUrl = `${base}/memory/${slug}`;

  let emailResult;
  try {
    emailResult = await sendMemoryPublishedEmail({
      to: order.customer_email,
      recipientName: order.recipient_name,
      memoryTitle: order.memory_title,
      memoryUrl,
    });
  } catch (err) {
    console.error("Publish email failed to send:", err.message);
    // The publish itself already succeeded and was saved — email delivery
    // failing shouldn't roll that back. Surface it so the admin knows to
    // resend or check SMTP config, without pretending nothing happened.
    return res.json({ ok: true, memoryUrl, emailSent: false });
  }

  res.json({ ok: true, memoryUrl, emailSent: emailResult.delivered });
});

module.exports = router;
