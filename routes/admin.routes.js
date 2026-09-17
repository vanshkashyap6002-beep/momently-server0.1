const express = require("express");
const bcrypt = require("bcryptjs");
const db = require("../lib/db");
const crypto = require("crypto");

const {
  signAdminToken,
  ADMIN_COOKIE,
  cookieOptions,
} = require("../lib/jwt");

const {
  requireAdmin,
} = require("../middleware/adminAuth");

const {
  buildUniqueMemorySlug,
} = require("../lib/slug");

const router = express.Router();


// ============================================================
// ADMIN LOGIN
// ============================================================

router.post("/login", async (req, res) => {
  const { email, password } = req.body || {};

  try {
    const normalizedEmail = String(email || "")
      .trim()
      .toLowerCase();

    const normalizedPassword = String(password || "");

    if (!normalizedEmail || !normalizedPassword) {
      return res.status(400).json({
        error: "Email and password are required.",
      });
    }

    const result = await db.query(
      "SELECT * FROM admin_users WHERE email = $1",
      [normalizedEmail]
    );

    const admin = result.rows[0];

    if (!admin) {
      return res.status(401).json({
        error: "Invalid credentials.",
      });
    }

    const ok = await bcrypt.compare(
      normalizedPassword,
      admin.password_hash
    );

    if (!ok) {
      return res.status(401).json({
        error: "Invalid credentials.",
      });
    }

    const token = signAdminToken(admin);

    res.cookie(
      ADMIN_COOKIE,
      token,
      cookieOptions
    );

    return res.json({
      ok: true,
      admin: {
        id: admin.id,
        fullName: admin.full_name,
        email: admin.email,
      },
    });
  } catch (err) {
    console.error(
      "Admin login error:",
      err
    );

    return res.status(500).json({
      error: "Unable to login.",
    });
  }
});


// ============================================================
// CHECK CURRENT ADMIN SESSION
// ============================================================

router.get(
  "/me",
  requireAdmin,
  (req, res) => {
    return res.json({
      admin: {
        id: req.admin.id,
        fullName: req.admin.full_name,
        email: req.admin.email,
      },
    });
  }
);


// ============================================================
// ADMIN LOGOUT
// ============================================================

router.post(
  "/logout",
  (_req, res) => {
    res.clearCookie(
      ADMIN_COOKIE,
      cookieOptions
    );

    return res.json({
      ok: true,
    });
  }
);


// ============================================================
// ORDERS
// ============================================================

// GET /api/admin/orders

router.get(
  "/orders",
  requireAdmin,
  async (req, res) => {
    try {
      const {
        status,
        search,
      } = req.query;

      let sql = `
        SELECT
          orders.*,
          users.full_name AS customer_name,
          users.email AS customer_email,
          templates.name AS template_name
        FROM orders
        JOIN users
          ON users.id = orders.user_id
        JOIN templates
          ON templates.id = orders.template_id
        WHERE 1 = 1
      `;

      const params = [];

      if (status) {
        params.push(
          String(status).trim()
        );

        sql += `
          AND orders.status = $${params.length}
        `;
      }

      if (search) {
        params.push(
          `%${String(search)
            .trim()
            .toLowerCase()}%`
        );

        sql += `
          AND (
            LOWER(users.email)
              LIKE $${params.length}

            OR LOWER(users.full_name)
              LIKE $${params.length}

            OR LOWER(
              COALESCE(
                orders.recipient_name,
                ''
              )
            )
              LIKE $${params.length}

            OR LOWER(
              COALESCE(
                orders.memory_title,
                ''
              )
            )
              LIKE $${params.length}
          )
        `;
      }

      sql += `
        ORDER BY orders.created_at DESC
      `;

      const result =
        await db.query(
          sql,
          params
        );

      const rows = result.rows;

      for (const row of rows) {
        const mediaResult = await db.query(
          `
            SELECT
              id,
              filename,
              mime_type,
              size_bytes
            FROM media
            WHERE order_id = $1
            ORDER BY sort_order
          `,
          [row.id]
        );

        const timelineResult = await db.query(
          `
            SELECT
              id,
              entry_date,
              title,
              description,
              sort_order
            FROM memory_timeline
            WHERE order_id = $1
            ORDER BY sort_order
          `,
          [row.id]
        );

        row.media = mediaResult.rows.map((media) => ({
          id: media.id,
          filename: media.filename,
          mimeType: media.mime_type,
          sizeBytes: media.size_bytes,
        }));

        row.timeline = timelineResult.rows.map((entry) => ({
          id: entry.id,
          date: entry.entry_date,
          title: entry.title,
          description: entry.description,
          sortOrder: entry.sort_order,
        }));
      }

      const orders = rows.map((row) => ({
        id: row.id,
        userId: row.user_id,
        templateId: row.template_id,

        customerName: row.customer_name,
        customerEmail: row.customer_email,
        templateName: row.template_name,

        recipientName: row.recipient_name,
        memoryTitle: row.memory_title,
        memorySubtitle: row.memory_subtitle,
        importantDate: row.important_date,
        personalMessage: row.personal_message,

        memoryClosingMessage:
          row.memory_closing_message,

        memorySongTitle:
          row.memory_song_title,

        memorySongArtist:
          row.memory_song_artist,

        memorySlug: row.memory_slug,

        amount: row.amount,
        status: row.status,
        paymentStatus: row.payment_status,

        razorpayOrderId:
          row.razorpay_order_id,

        razorpayPaymentId:
          row.razorpay_payment_id,

        createdAt: row.created_at,
        updatedAt: row.updated_at,
        publishedAt: row.published_at,

        media: row.media,
        timeline: row.timeline,
      }));

      return res.json({
        orders,
      });
    } catch (err) {
      console.error(
        "Admin orders error:",
        err
      );

      return res.status(500).json({
        error:
          "Unable to load orders.",
      });
    }
  }
);


// ============================================================
// SINGLE ORDER
// ============================================================

router.get(
  "/orders/:id",
  requireAdmin,
  async (req, res) => {
    try {
      const result = await db.query(
        `
          SELECT
            orders.*,
            users.full_name AS customer_name,
            users.email AS customer_email,
            templates.name AS template_name
          FROM orders
          JOIN users
            ON users.id = orders.user_id
          JOIN templates
            ON templates.id = orders.template_id
          WHERE orders.id = $1
        `,
        [req.params.id]
      );

      const row = result.rows[0];

      if (!row) {
        return res.status(404).json({
          error: "Order not found.",
        });
      }

      const mediaResult = await db.query(
        `
          SELECT
            id,
            filename,
            mime_type,
            size_bytes
          FROM media
          WHERE order_id = $1
          ORDER BY sort_order
        `,
        [row.id]
      );

      const timelineResult = await db.query(
        `
          SELECT
            id,
            entry_date,
            title,
            description,
            sort_order
          FROM memory_timeline
          WHERE order_id = $1
          ORDER BY sort_order
        `,
        [row.id]
      );

      const media = mediaResult.rows.map((media) => ({
        id: media.id,
        filename: media.filename,
        mimeType: media.mime_type,
        sizeBytes: media.size_bytes,
      }));

      const timeline = timelineResult.rows.map((entry) => ({
        id: entry.id,
        date: entry.entry_date,
        title: entry.title,
        description: entry.description,
        sortOrder: entry.sort_order,
      }));

      const order = {
        id: row.id,
        userId: row.user_id,
        templateId: row.template_id,

        customerName: row.customer_name,
        customerEmail: row.customer_email,
        templateName: row.template_name,

        recipientName: row.recipient_name,
        memoryTitle: row.memory_title,
        memorySubtitle: row.memory_subtitle,
        importantDate: row.important_date,
        personalMessage: row.personal_message,

        memoryClosingMessage:
          row.memory_closing_message,

        memorySongTitle:
          row.memory_song_title,

        memorySongArtist:
          row.memory_song_artist,

        memorySlug: row.memory_slug,

        amount: row.amount,
        status: row.status,
        paymentStatus: row.payment_status,

        razorpayOrderId:
          row.razorpay_order_id,

        razorpayPaymentId:
          row.razorpay_payment_id,

        createdAt: row.created_at,
        updatedAt: row.updated_at,
        publishedAt: row.published_at,

        media,
        timeline,
      };

      return res.json({
        order,
      });
    } catch (err) {
      console.error(
        "Admin order error:",
        err
      );

      return res.status(500).json({
        error: "Unable to load order.",
      });
    }
  }
);


// ============================================================
// UPDATE ORDER STATUS
// ============================================================

// IMPORTANT:
// PAID must ONLY be produced by a verified payment flow.
// Admin cannot manually manufacture a PAID state.
//
// Allowed manual workflow:
//
// PENDING
//   ↓
// IN_PROGRESS
//   ↓
// READY
//   ↓
// PUBLISHED
//
// But IN_PROGRESS / READY / PUBLISHED require verified payment.
// ============================================================

router.patch(
  "/orders/:id/status",
  requireAdmin,
  async (req, res) => {
    const {
      status,
    } = req.body || {};

    const allowedManualStatuses = [
      "PENDING",
      "IN_PROGRESS",
      "READY",
      "PUBLISHED",
    ];

    if (
      !allowedManualStatuses.includes(status)
    ) {
      return res.status(400).json({
        error:
          "Invalid manual status.",
      });
    }

    let client;

    try {
      client =
        await db.pool.connect();

      await client.query("BEGIN");

      /*
       * Lock the order while validating and changing its workflow state.
       * This prevents concurrent admin changes from racing with payment
       * verification/webhook updates.
       */

      const result =
        await client.query(
          `
            SELECT *
            FROM orders
            WHERE id = $1
            FOR UPDATE
          `,
          [req.params.id]
        );

      const order =
        result.rows[0];

      if (!order) {
        await client.query(
          "ROLLBACK"
        );

        return res.status(404).json({
          error:
            "Order not found.",
        });
      }

      /*
       * A paid order must never be moved backwards to PENDING.
       */

      if (
        status === "PENDING" &&
        order.payment_status === "PAID"
      ) {
        await client.query(
          "ROLLBACK"
        );

        return res.status(409).json({
          error:
            "A paid order cannot be moved back to PENDING.",
        });
      }

      /*
       * Everything after payment requires a verified PAID state.
       *
       * Admin cannot simply choose PAID anymore.
       */

      if (
        [
          "IN_PROGRESS",
          "READY",
          "PUBLISHED",
        ].includes(status)
      ) {
        if (
          order.payment_status !== "PAID"
        ) {
          await client.query(
            "ROLLBACK"
          );

          return res.status(409).json({
            error:
              "Payment must be verified before moving this order forward.",
          });
        }
      }

      /*
       * An order that is already published should not be manually moved
       * backwards into an earlier workflow state.
       */

      if (
        order.status === "PUBLISHED" &&
        status !== "PUBLISHED"
      ) {
        await client.query(
          "ROLLBACK"
        );

        return res.status(409).json({
          error:
            "A published order cannot be moved backwards.",
        });
      }

      /*
       * READY and PUBLISHED require the order to have payment information.
       */

      if (
        [
          "READY",
          "PUBLISHED",
        ].includes(status)
      ) {
        if (
          !order.razorpay_order_id ||
          !order.razorpay_payment_id
        ) {
          await client.query(
            "ROLLBACK"
          );

          return res.status(409).json({
            error:
              "Verified payment information is missing.",
          });
        }
      }

      const updateResult =
        await client.query(
          `
            UPDATE orders
            SET
              status = $1,
              updated_at = CURRENT_TIMESTAMP
            WHERE id = $2
          `,
          [
            status,
            order.id,
          ]
        );

      if (
        updateResult.rowCount !== 1
      ) {
        throw new Error(
          "Order status update failed."
        );
      }

      await client.query(
        "COMMIT"
      );

      return res.json({
        ok: true,
        order: {
          id: order.id,
          status,
        },
      });
    } catch (err) {
      if (client) {
        try {
          await client.query(
            "ROLLBACK"
          );
        } catch {
          // Ignore rollback failure.
        }
      }

      console.error(
        "Admin status update error:",
        err
      );

      return res.status(500).json({
        error:
          "Unable to update order status.",
      });
    } finally {
      if (client) {
        client.release();
      }
    }
  }
);


// ============================================================
// SAVE MEMORY
// ============================================================

router.put(
  "/orders/:id/memory",
  requireAdmin,
  async (req, res) => {
    const {
      memoryTitle,
      memorySubtitle,
      memoryClosingMessage,
      memorySongTitle,
      memorySongArtist,
      timeline,
    } = req.body || {};

    let client;

    try {
      client =
        await db.pool.connect();

      await client.query("BEGIN");

      /*
       * Lock the order so the memory update cannot race with
       * another admin workflow operation.
       */

      const result =
        await client.query(
          `
            SELECT *
            FROM orders
            WHERE id = $1
            FOR UPDATE
          `,
          [req.params.id]
        );

      const order =
        result.rows[0];

      if (!order) {
        await client.query(
          "ROLLBACK"
        );

        return res.status(404).json({
          error:
            "Order not found.",
        });
      }

      /*
       * Update memory fields inside the same transaction
       * as the timeline replacement.
       */

      await client.query(
        `
          UPDATE orders
          SET
            memory_title = $1,
            memory_subtitle = $2,
            memory_closing_message = $3,
            memory_song_title = $4,
            memory_song_artist = $5,
            updated_at = CURRENT_TIMESTAMP
          WHERE id = $6
        `,
        [
          memoryTitle || null,
          memorySubtitle || null,
          memoryClosingMessage || null,
          memorySongTitle || null,
          memorySongArtist || null,
          order.id,
        ]
      );

      /*
       * Replace existing timeline entries.
       */

      await client.query(
        `
          DELETE FROM memory_timeline
          WHERE order_id = $1
        `,
        [order.id]
      );

      const entries =
        Array.isArray(timeline)
          ? timeline
          : [];

      for (
        let i = 0;
        i < entries.length;
        i++
      ) {
        const entry =
          entries[i] || {};

        await client.query(
          `
            INSERT INTO memory_timeline
            (
              id,
              order_id,
              entry_date,
              title,
              description,
              sort_order
            )
            VALUES (
              $1,
              $2,
              $3,
              $4,
              $5,
              $6
            )
          `,
          [
            crypto.randomUUID(),
            order.id,
            entry.entryDate || null,
            entry.title || null,
            entry.description || null,
            i,
          ]
        );
      }

      await client.query(
        "COMMIT"
      );

      return res.json({
        ok: true,
      });
    } catch (err) {
      if (client) {
        try {
          await client.query(
            "ROLLBACK"
          );
        } catch {
          // Ignore rollback failure.
        }
      }

      console.error(
        "Admin memory save error:",
        err
      );

      return res.status(500).json({
        error:
          "Unable to save memory.",
      });
    } finally {
      if (client) {
        client.release();
      }
    }
  }
);


// ============================================================
// PUBLISH MEMORY
// ============================================================

router.post(
  "/orders/:id/publish",
  requireAdmin,
  async (req, res) => {
    let client;

    try {
      client =
        await db.pool.connect();

      await client.query("BEGIN");

      /*
       * Lock the order during the publish transition so another admin
       * request cannot publish the same order simultaneously.
       */

      const result =
        await client.query(
          `
            SELECT
              orders.*,
              users.email AS customer_email
            FROM orders
            JOIN users
              ON users.id = orders.user_id
            WHERE orders.id = $1
            FOR UPDATE
          `,
          [req.params.id]
        );

      const order =
        result.rows[0];

      if (!order) {
        await client.query(
          "ROLLBACK"
        );

        return res.status(404).json({
          error:
            "Order not found.",
        });
      }

      /*
       * Publishing requires:
       * 1. READY state
       * 2. verified payment
       * 3. Razorpay order/payment IDs
       */

      if (
        order.status !== "READY"
      ) {
        await client.query(
          "ROLLBACK"
        );

        return res.status(409).json({
          error:
            "Order must be READY before publishing.",
        });
      }

      if (
        order.payment_status !== "PAID"
      ) {
        await client.query(
          "ROLLBACK"
        );

        return res.status(409).json({
          error:
            "Verified payment is required before publishing.",
        });
      }

      if (
        !order.razorpay_order_id ||
        !order.razorpay_payment_id
      ) {
        await client.query(
          "ROLLBACK"
        );

        return res.status(409).json({
          error:
            "Verified payment information is missing.",
        });
      }

      /*
       * Do not generate a second memory slug if a publish request is
       * repeated after the order has already been published.
       */

      if (
        order.memory_slug ||
        order.status === "PUBLISHED"
      ) {
        await client.query(
          "ROLLBACK"
        );

        return res.status(409).json({
          error:
            "This memory has already been published.",
        });
      }

      const memorySlug =
        await buildUniqueMemorySlug({
          recipientName:
            order.recipient_name,

          memoryTitle:
            order.memory_title,
        });

      const updateResult =
        await client.query(
          `
            UPDATE orders
            SET
              status = 'PUBLISHED',
              memory_slug = $1,
              published_at = CURRENT_TIMESTAMP,
              updated_at = CURRENT_TIMESTAMP
            WHERE id = $2
              AND status = 'READY'
              AND payment_status = 'PAID'
              AND memory_slug IS NULL
          `,
          [
            memorySlug,
            order.id,
          ]
        );

      if (
        updateResult.rowCount !== 1
      ) {
        throw new Error(
          "Publish update failed."
        );
      }

      await client.query(
        "COMMIT"
      );

      return res.json({
        ok: true,
        memorySlug,
      });
    } catch (err) {
      if (client) {
        try {
          await client.query(
            "ROLLBACK"
          );
        } catch {
          // Ignore rollback failure.
        }
      }

      console.error(
        "Admin publish error:",
        err
      );

      return res.status(500).json({
        error:
          "Unable to publish memory.",
      });
    } finally {
      if (client) {
        client.release();
      }
    }
  }
);


module.exports = router;