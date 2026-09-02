const express = require("express");
const crypto = require("crypto");
const multer = require("multer");
const db = require("../lib/db");
const { requireCustomer } = require("../middleware/customerAuth");
const storage = require("../lib/storage");

const router = express.Router();

const ALLOWED_MIME = new Set(["image/jpeg", "image/png", "image/webp", "video/mp4", "video/quicktime", "video/webm"]);
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 100 * 1024 * 1024, files: 10 },
  fileFilter(_req, file, cb) {
    if (!ALLOWED_MIME.has(file.mimetype)) return cb(new Error("Unsupported file type."));
    cb(null, true);
  },
});

function toPublicOrder(row) {
  return {
    id: row.id,
    templateId: row.template_id,
    recipientName: row.recipient_name,
    memoryTitle: row.memory_title,
    importantDate: row.important_date,
    personalMessage: row.personal_message,
    status: row.status,
    paymentStatus: row.payment_status,
    amount: row.amount,
    memorySlug: row.memory_slug,
    createdAt: row.created_at,
  };
}

/** Loads the order and 404/403s if it doesn't belong to req.user. Used by
 * every route below so ownership is checked in exactly one place. */
function loadOwnedOrder(req, res) {
  const order = db.prepare("SELECT * FROM orders WHERE id = ?").get(req.params.id);
  if (!order || order.user_id !== req.user.id) {
    res.status(404).json({ error: "Order not found." });
    return null;
  }
  return order;
}

// POST /api/orders  { templateSlug } — starts (or reuses) a draft order.
router.post("/", requireCustomer, (req, res) => {
  const { templateSlug } = req.body || {};
  const template = db.prepare("SELECT * FROM templates WHERE slug = ? AND is_enabled = 1").get(templateSlug);
  if (!template) return res.status(404).json({ error: "That template isn't available." });

  // Reuse an existing PENDING draft for this user+template instead of piling up duplicates.
  const existing = db
    .prepare("SELECT * FROM orders WHERE user_id = ? AND template_id = ? AND status = 'PENDING' ORDER BY created_at DESC")
    .get(req.user.id, template.id);
  if (existing) return res.status(200).json({ order: toPublicOrder(existing) });

  const id = crypto.randomUUID();
  db.prepare(
    "INSERT INTO orders (id, user_id, template_id, amount) VALUES (?, ?, ?, ?)"
  ).run(id, req.user.id, template.id, template.price);

  const order = db.prepare("SELECT * FROM orders WHERE id = ?").get(id);
  res.status(201).json({ order: toPublicOrder(order) });
});

// GET /api/orders/:id
router.get("/:id", requireCustomer, (req, res) => {
  const order = loadOwnedOrder(req, res);
  if (!order) return;
  res.json({ order: toPublicOrder(order) });
});

// PATCH /api/orders/:id — customer information step
router.patch("/:id", requireCustomer, (req, res) => {
  const order = loadOwnedOrder(req, res);
  if (!order) return;
  if (order.status !== "PENDING") {
    return res.status(409).json({ error: "This order can no longer be edited." });
  }

  const { recipientName, memoryTitle, importantDate, personalMessage } = req.body || {};
  if (!recipientName || !memoryTitle) {
    return res.status(400).json({ error: "Recipient name and memory title are required." });
  }

  db.prepare(
    `UPDATE orders SET recipient_name = ?, memory_title = ?, important_date = ?, personal_message = ?, updated_at = datetime('now')
     WHERE id = ?`
  ).run(recipientName, memoryTitle, importantDate || null, personalMessage || null, order.id);

  res.json({ order: toPublicOrder(db.prepare("SELECT * FROM orders WHERE id = ?").get(order.id)) });
});

// POST /api/orders/:id/media — multipart upload, up to 10 files at once
router.post("/:id/media", requireCustomer, upload.array("files", 10), (req, res) => {
  const order = loadOwnedOrder(req, res);
  if (!order) return;
  if (order.status !== "PENDING") {
    return res.status(409).json({ error: "This order can no longer accept uploads." });
  }
  if (!req.files || req.files.length === 0) {
    return res.status(400).json({ error: "No files received." });
  }

  const maxOrder = db.prepare("SELECT COALESCE(MAX(sort_order), -1) AS m FROM media WHERE order_id = ?").get(order.id).m;
  const insert = db.prepare(
    "INSERT INTO media (id, order_id, filename, stored_path, mime_type, size_bytes, sort_order) VALUES (?, ?, ?, ?, ?, ?, ?)"
  );

  const created = req.files.map((file, i) => {
    const storedPath = storage.saveFile(order.id, file);
    const id = crypto.randomUUID();
    insert.run(id, order.id, file.originalname, storedPath, file.mimetype, file.size, maxOrder + 1 + i);
    return { id, filename: file.originalname, mimeType: file.mimetype, sizeBytes: file.size };
  });

  res.status(201).json({ media: created });
});

// GET /api/orders/:id/media — list (metadata only; bytes come from /api/media/:id/file)
router.get("/:id/media", requireCustomer, (req, res) => {
  const order = loadOwnedOrder(req, res);
  if (!order) return;
  const rows = db.prepare("SELECT id, filename, mime_type, size_bytes, sort_order FROM media WHERE order_id = ? ORDER BY sort_order").all(order.id);
  res.json({ media: rows.map((r) => ({ id: r.id, filename: r.filename, mimeType: r.mime_type, sizeBytes: r.size_bytes })) });
});

// DELETE /api/orders/:id/media/:mediaId
router.delete("/:id/media/:mediaId", requireCustomer, (req, res) => {
  const order = loadOwnedOrder(req, res);
  if (!order) return;
  const media = db.prepare("SELECT * FROM media WHERE id = ? AND order_id = ?").get(req.params.mediaId, order.id);
  if (!media) return res.status(404).json({ error: "File not found." });

  storage.deleteFile(media.stored_path);
  db.prepare("DELETE FROM media WHERE id = ?").run(media.id);
  res.json({ ok: true });
});

module.exports = router;
