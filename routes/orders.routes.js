const express = require("express");
const crypto = require("crypto");
const multer = require("multer");
const db = require("../lib/db");
const { requireCustomer } = require("../middleware/customerAuth");
const storage = require("../lib/storage");

const router = express.Router();

const ALLOWED_MIME = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "video/mp4",
  "video/quicktime",
  "video/webm",
]);

const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 100 * 1024 * 1024,
    files: 10,
    fields: 5,
    parts: 15,
    fieldSize: 64 * 1024,
    headerPairs: 2000,
  },
  fileFilter(_req, file, cb) {
    if (!ALLOWED_MIME.has(file.mimetype)) {
      return cb(new Error("Unsupported file type."));
    }

    cb(null, true);
  },
});
function handleMediaUpload(req, res, next) {
  upload.array("files", 10)(
    req,
    res,
    (err) => {
      if (!err) {
        return next();
      }

      if (err instanceof multer.MulterError) {
        if (err.code === "LIMIT_FILE_SIZE") {
          return res.status(413).json({
            error:
              "A file is too large. Each file must be 100 MB or smaller.",
          });
        }

        if (err.code === "LIMIT_FILE_COUNT") {
          return res.status(413).json({
            error:
              "Too many files. You can upload a maximum of 10 files at once.",
          });
        }

        if (err.code === "LIMIT_PART_COUNT") {
          return res.status(413).json({
            error:
              "Too much multipart data was sent.",
          });
        }

        if (err.code === "LIMIT_FIELD_COUNT") {
          return res.status(413).json({
            error:
              "Too many form fields were sent.",
          });
        }

        if (err.code === "LIMIT_FIELD_SIZE") {
          return res.status(413).json({
            error:
              "A form field is too large.",
          });
        }

        if (err.code === "LIMIT_UNEXPECTED_FILE") {
          return res.status(400).json({
            error:
              "Unexpected upload field.",
          });
        }

        return res.status(400).json({
          error:
            "Invalid upload request.",
        });
      }

      if (
        err &&
        err.message === "Unsupported file type."
      ) {
        return res.status(400).json({
          error:
            "Unsupported file type.",
        });
      }

      console.error(
        "Upload middleware error:",
        err
      );

      return res.status(400).json({
        error:
          "Invalid upload request.",
      });
    }
  );
}
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

/**
 * Loads the order and checks that it belongs to the logged-in customer.
 */
async function loadOwnedOrder(req, res) {
  const result = await db.query(
    "SELECT * FROM orders WHERE id = $1",
    [req.params.id]
  );

  const order = result.rows[0];

  if (!order || order.user_id !== req.user.id) {
    res.status(404).json({
      error: "Order not found.",
    });

    return null;
  }

  return order;
}

// POST /api/orders
// { templateSlug } — starts or reuses a draft order.
router.post("/", requireCustomer, async (req, res) => {
  try {
    const { templateSlug } = req.body || {};

    const templateResult = await db.query(
      `
      SELECT *
      FROM templates
      WHERE slug = $1
        AND is_enabled = 1
      `,
      [templateSlug]
    );

    const template = templateResult.rows[0];

    if (!template) {
      return res.status(404).json({
        error: "That template isn't available.",
      });
    }

    // Reuse an existing PENDING draft for this user + template.
    const existingResult = await db.query(
      `
      SELECT *
      FROM orders
      WHERE user_id = $1
        AND template_id = $2
        AND status = 'PENDING'
      ORDER BY created_at DESC
      LIMIT 1
      `,
      [
        req.user.id,
        template.id,
      ]
    );

    const existing = existingResult.rows[0];

    if (existing) {
      return res.status(200).json({
        order: toPublicOrder(existing),
      });
    }

    const id = crypto.randomUUID();

    await db.query(
      `
      INSERT INTO orders (
        id,
        user_id,
        template_id,
        amount
      )
      VALUES ($1, $2, $3, $4)
      `,
      [
        id,
        req.user.id,
        template.id,
        template.price,
      ]
    );

    const orderResult = await db.query(
      "SELECT * FROM orders WHERE id = $1",
      [id]
    );

    const order = orderResult.rows[0];

    return res.status(201).json({
      order: toPublicOrder(order),
    });
  } catch (err) {
  if (err && err.code === "23505") {
    const existingResult = await db.query(
      `
        SELECT *
        FROM orders
        WHERE user_id = $1
          AND template_id = $2
          AND status = 'PENDING'
        ORDER BY created_at DESC
        LIMIT 1
      `,
      [req.user.id, template.id]
    );

    const existing = existingResult.rows[0];

    if (existing) {
      return res.status(200).json({
        order: toPublicOrder(existing),
      });
    }
  }

  console.error("Create order error:", err);

  return res.status(500).json({
    error: "Unable to create order.",
  });

  }
});

// GET /api/orders/:id
router.get("/:id", requireCustomer, async (req, res) => {
  try {
    const order = await loadOwnedOrder(req, res);

    if (!order) return;

    return res.json({
      order: toPublicOrder(order),
    });
  } catch (err) {
    console.error("Get order error:", err);

    return res.status(500).json({
      error: "Unable to load order.",
    });
  }
});

// PATCH /api/orders/:id
// Customer information step.
router.patch("/:id", requireCustomer, async (req, res) => {
  try {
    const order = await loadOwnedOrder(req, res);

    if (!order) return;

    if (order.status !== "PENDING") {
      return res.status(409).json({
        error: "This order can no longer be edited.",
      });
    }

    const {
      recipientName,
      memoryTitle,
      importantDate,
      personalMessage,
    } = req.body || {};

    if (!recipientName || !memoryTitle) {
      return res.status(400).json({
        error:
          "Recipient name and memory title are required.",
      });
    }

    await db.query(
      `
      UPDATE orders
      SET
        recipient_name = $1,
        memory_title = $2,
        important_date = $3,
        personal_message = $4,
        updated_at = CURRENT_TIMESTAMP
      WHERE id = $5
      `,
      [
        recipientName,
        memoryTitle,
        importantDate || null,
        personalMessage || null,
        order.id,
      ]
    );

    const updatedResult = await db.query(
      "SELECT * FROM orders WHERE id = $1",
      [order.id]
    );

    return res.json({
      order: toPublicOrder(updatedResult.rows[0]),
    });
  } catch (err) {
    console.error("Update order error:", err);

    return res.status(500).json({
      error: "Unable to update order.",
    });
  }
});

// GET /api/orders
// Current customer's own orders, most recent first.
router.get("/", requireCustomer, async (req, res) => {
  try {
    const result = await db.query(
      `
      SELECT
        orders.*,
        templates.name AS template_name,
        templates.slug AS template_slug,
        templates.accent AS accent
      FROM orders
      JOIN templates
        ON templates.id = orders.template_id
      WHERE orders.user_id = $1
      ORDER BY orders.created_at DESC
      `,
      [req.user.id]
    );

    return res.json({
      orders: result.rows.map((row) => ({
        ...toPublicOrder(row),
        templateName: row.template_name,
        templateSlug: row.template_slug,
        accent: row.accent,
      })),
    });
  } catch (err) {
    console.error("Get orders error:", err);

    return res.status(500).json({
      error: "Unable to load orders.",
    });
  }
});

// POST /api/orders/:id/media
// Multipart upload, up to 10 files at once.
router.post(
  "/:id/media",
  requireCustomer,
  handleMediaUpload,
  async (req, res) => {
    try {
      const order = await loadOwnedOrder(req, res);

      if (!order) return;

      if (order.status !== "PENDING") {
        return res.status(409).json({
          error:
            "This order can no longer accept uploads.",
        });
      }

      if (!req.files || req.files.length === 0) {
        return res.status(400).json({
          error: "No files received.",
        });
      }

      const maxResult = await db.query(
        `
        SELECT COALESCE(MAX(sort_order), -1) AS max_order
        FROM media
        WHERE order_id = $1
        `,
        [order.id]
      );

      const maxOrder =
        Number(maxResult.rows[0].max_order);

      const created = [];
      const savedFiles = [];

      try {
        for (let i = 0; i < req.files.length; i++) {
          const file = req.files[i];

          /*
           * Step 2 security:
           *
           * Do not trust the MIME type or file extension supplied
           * by the browser. Inspect the actual file bytes.
           */
          const detectedType =
            storage.detectFileType(file.buffer);

          if (!detectedType) {
  throw new Error(
    `Invalid or unsupported file: ${file.originalname}`
  );
}

          /*
           * The detected type must also match the MIME type supplied
           * by the client. This gives us two independent checks.
           */
          if (detectedType.mimeType !== file.mimetype) {
  throw new Error(
    `File type does not match its declared MIME type: ${file.originalname}`
  );
}

          /*
           * Storage generates the extension from the detected type.
           * The user's original filename extension is never trusted.
           */
          const storedPath =
            storage.saveFile(
              order.id,
              file,
              detectedType
            );

          savedFiles.push(storedPath);

          const id = crypto.randomUUID();

          const sortOrder =
            maxOrder + 1 + i;

          await db.query(
            `
              INSERT INTO media (
                id,
                order_id,
                filename,
                stored_path,
                mime_type,
                size_bytes,
                sort_order
              )
              VALUES ($1, $2, $3, $4, $5, $6, $7)
            `,
            [
              id,
              order.id,
              file.originalname,
              storedPath,
              detectedType.mimeType,
              file.size,
              sortOrder,
            ]
          );

          created.push({
            id,
            filename: file.originalname,
            mimeType: detectedType.mimeType,
            sizeBytes: file.size,
          });
        }
      } catch (uploadError) {
        for (const storedPath of savedFiles) {
          try {
            storage.deleteFile(storedPath);
          } catch (cleanupError) {
            console.error(
              "Failed to clean up uploaded file:",
              storedPath,
              cleanupError
            );
          }
        }

        throw uploadError;
      }

      return res.status(201).json({
        media: created,
      });
    } catch (err) {
      console.error("Upload media error:", err);

      return res.status(500).json({
        error: "Unable to upload files.",
      });
    }
  }
);

// GET /api/orders/:id/media
// Metadata only; bytes come from /api/media/:id/file.
router.get(
  "/:id/media",
  requireCustomer,
  async (req, res) => {
    try {
      const order = await loadOwnedOrder(req, res);

      if (!order) return;

      const result = await db.query(
        `
        SELECT
          id,
          filename,
          mime_type,
          size_bytes,
          sort_order
        FROM media
        WHERE order_id = $1
        ORDER BY sort_order
        `,
        [order.id]
      );

      return res.json({
        media: result.rows.map((r) => ({
          id: r.id,
          filename: r.filename,
          mimeType: r.mime_type,
          sizeBytes: r.size_bytes,
        })),
      });
    } catch (err) {
      console.error("Get media error:", err);

      return res.status(500).json({
        error: "Unable to load media.",
      });
    }
  }
);

// DELETE /api/orders/:id/media/:mediaId
router.delete(
  "/:id/media/:mediaId",
  requireCustomer,
  async (req, res) => {
    try {
      const order = await loadOwnedOrder(req, res);

      if (!order) return;

      /*
       * Security:
       * Media can only be deleted while the order is still
       * an unpaid PENDING draft.
       *
       * This prevents a customer from deleting media after
       * payment or after the order has moved forward in the
       * workflow.
       */
      if (
        order.status !== "PENDING" ||
        order.payment_status === "PAID"
      ) {
        return res.status(409).json({
          error: "This order's media can no longer be deleted.",
        });
      }

      const mediaResult = await db.query(
        `
        SELECT *
        FROM media
        WHERE id = $1
          AND order_id = $2
        `,
        [
          req.params.mediaId,
          order.id,
        ]
      );

      const media = mediaResult.rows[0];

      if (!media) {
        return res.status(404).json({
          error: "File not found.",
        });
      }

      storage.deleteFile(media.stored_path);

      await db.query(
        "DELETE FROM media WHERE id = $1",
        [media.id]
      );

      return res.json({
        ok: true,
      });
    } catch (err) {
      console.error("Delete media error:", err);

      return res.status(500).json({
        error: "Unable to delete file.",
      });
    }
  }
);

module.exports = router;