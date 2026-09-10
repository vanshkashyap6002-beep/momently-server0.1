const express = require("express");
const db = require("../lib/db");
const storage = require("../lib/storage");
const {
  CUSTOMER_COOKIE,
  ADMIN_COOKIE,
  verifyCustomerToken,
  verifyAdminToken,
} = require("../lib/jwt");

const router = express.Router();

/**
 * GET /api/media/:id/file
 *
 * Access rule:
 * (a) the customer who owns the order,
 * (b) any admin,
 * (c) anyone once the order is PUBLISHED.
 */
router.get("/:id/file", async (req, res) => {
  try {
    const result = await db.query(
      `
      SELECT
        media.*,
        orders.user_id AS owner_id,
        orders.status AS order_status
      FROM media
      JOIN orders
        ON orders.id = media.order_id
      WHERE media.id = $1
      `,
      [req.params.id]
    );

    const media = result.rows[0];

    if (!media) {
      return res.status(404).end();
    }

    // Published memories are publicly accessible.
    if (media.order_status === "PUBLISHED") {
      return res.sendFile(
        storage.absolutePath(media.stored_path)
      );
    }

    // Check customer ownership.
    const customerToken =
      req.cookies?.[CUSTOMER_COOKIE];

    if (customerToken) {
      try {
        const payload =
          verifyCustomerToken(customerToken);

        if (payload.sub === media.owner_id) {
          return res.sendFile(
            storage.absolutePath(media.stored_path)
          );
        }
      } catch {
        // Fall through to admin check.
      }
    }

    // Check admin authentication.
    const adminToken =
      req.cookies?.[ADMIN_COOKIE];

    if (adminToken) {
      try {
        verifyAdminToken(adminToken);

        return res.sendFile(
          storage.absolutePath(media.stored_path)
        );
      } catch {
        // Fall through to 403.
      }
    }

    return res.status(403).json({
      error: "You don't have access to this file.",
    });
  } catch (err) {
    console.error("Media file error:", err);

    return res.status(500).json({
      error: "Unable to load media file.",
    });
  }
});

module.exports = router;