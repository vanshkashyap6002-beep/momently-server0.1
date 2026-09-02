const express = require("express");
const db = require("../lib/db");
const storage = require("../lib/storage");
const { CUSTOMER_COOKIE, ADMIN_COOKIE, verifyCustomerToken, verifyAdminToken } = require("../lib/jwt");

const router = express.Router();

/**
 * GET /api/media/:id/file
 *
 * Access rule (this is the one place it's enforced): a media file is
 * readable by (a) the customer who owns its order, (b) any admin, or
 * (c) anyone at all — no login required — once the order has been
 * PUBLISHED, because at that point the photo is intentionally part of a
 * public memory page. Anything not yet published stays private, matching
 * "customer files must be stored privately... only authorized Momently
 * users/admins should be able to access it."
 */
router.get("/:id/file", (req, res) => {
  const media = db.prepare("SELECT media.*, orders.user_id AS owner_id, orders.status AS order_status FROM media JOIN orders ON orders.id = media.order_id WHERE media.id = ?").get(req.params.id);
  if (!media) return res.status(404).end();

  if (media.order_status === "PUBLISHED") {
    return res.sendFile(storage.absolutePath(media.stored_path));
  }

  const customerToken = req.cookies?.[CUSTOMER_COOKIE];
  if (customerToken) {
    try {
      const payload = verifyCustomerToken(customerToken);
      if (payload.sub === media.owner_id) return res.sendFile(storage.absolutePath(media.stored_path));
    } catch {
      /* fall through to admin check */
    }
  }

  const adminToken = req.cookies?.[ADMIN_COOKIE];
  if (adminToken) {
    try {
      verifyAdminToken(adminToken);
      return res.sendFile(storage.absolutePath(media.stored_path));
    } catch {
      /* fall through to 403 */
    }
  }

  res.status(403).json({ error: "You don't have access to this file." });
});

module.exports = router;
