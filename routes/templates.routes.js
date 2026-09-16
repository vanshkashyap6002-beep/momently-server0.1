const express = require("express");
const { randomUUID } = require("crypto");
const db = require("../lib/db");

const {
  requireAdmin,
} = require("../middleware/adminAuth");

const router = express.Router();

// --------------------------------------------------
// Helpers
// --------------------------------------------------

function toPublicTemplate(row) {
  return {
    id: row.id,
    slug: row.slug,
    name: row.name,
    occasion: row.occasion,
    theme: row.theme,
    style: row.style,
    mood: row.mood,
    accent: row.accent,
    price: row.price,
    previewSeed: row.preview_seed,

    shortDescription:
      row.shortDescription || "",

    description:
      row.description || "",

    previewImageUrl:
      `https://picsum.photos/seed/${encodeURIComponent(
        row.preview_seed
      )}/640/480`,

    creatorName:
      row.creator_name,

    isEnabled:
      Boolean(row.is_enabled),

    createdAt:
      row.created_at,
  };
}

function getTemplateValues(body = {}) {
  return {
    id:
      typeof body.id === "string"
        ? body.id.trim()
        : "",

    slug:
      typeof body.slug === "string"
        ? body.slug.trim()
        : "",

    name:
      typeof body.name === "string"
        ? body.name.trim()
        : "",

    occasion:
      typeof body.occasion === "string"
        ? body.occasion.trim()
        : "",

    theme:
      typeof body.theme === "string"
        ? body.theme.trim()
        : "",

    style:
      typeof body.style === "string"
        ? body.style.trim()
        : "",

    mood:
      typeof body.mood === "string"
        ? body.mood.trim()
        : "",

    accent:
      typeof body.accent === "string"
        ? body.accent.trim()
        : "",

    price:
      Number(body.price),

    previewSeed:
      typeof body.previewSeed === "string"
        ? body.previewSeed.trim()
        : "",

    creatorName:
      typeof body.creatorName === "string"
        ? body.creatorName.trim()
        : "Momently",

    shortDescription:
      typeof body.shortDescription === "string"
        ? body.shortDescription.trim()
        : "",

    description:
      typeof body.description === "string"
        ? body.description.trim()
        : "",

    isEnabled:
      typeof body.isEnabled === "boolean"
        ? body.isEnabled
        : true,
  };
}

// --------------------------------------------------
// PUBLIC ROUTES
// --------------------------------------------------

// Get all enabled templates
router.get("/", async (_req, res) => {
  try {
    const result = await db.query(
      `
      SELECT
        id,
        slug,
        name,
        occasion,
        theme,
        style,
        mood,
        accent,
        price,
        preview_seed,
        creator_name,
        "shortDescription",
        description,
        is_enabled,
        created_at
      FROM templates
      WHERE is_enabled = 1
      ORDER BY created_at DESC
      `
    );

    return res.json({
      templates:
        result.rows.map(toPublicTemplate),
    });
  } catch (err) {
    console.error(
      "Get public templates error:",
      err
    );

    return res.status(500).json({
      error:
        "Unable to load templates.",
    });
  }
});

// --------------------------------------------------
// ADMIN ROUTES
// IMPORTANT:
// These must stay BEFORE /:slug
// --------------------------------------------------

// Get all templates for admin
router.get(
  "/admin",
  requireAdmin,
  async (_req, res) => {
    try {
      const result = await db.query(
        `
        SELECT
          id,
          slug,
          name,
          occasion,
          theme,
          style,
          mood,
          accent,
          price,
          preview_seed,
          creator_name,
          "shortDescription",
          description,
          is_enabled,
          created_at
        FROM templates
        ORDER BY created_at DESC
        `
      );

      return res.json({
        templates:
          result.rows.map(
            toPublicTemplate
          ),
      });
    } catch (err) {
      console.error(
        "Get admin templates error:",
        err
      );

      return res.status(500).json({
        error:
          "Unable to load templates.",
      });
    }
  }
);

// Add template
router.post(
  "/admin",
  requireAdmin,
  async (req, res) => {
    try {
      const values =
        getTemplateValues(req.body);

      const templateId = randomUUID();

      if (!values.slug) {
        return res.status(400).json({
          error:
            "Template slug is required.",
        });
      }

      if (!values.name) {
        return res.status(400).json({
          error:
            "Template name is required.",
        });
      }

      if (!values.occasion) {
        return res.status(400).json({
          error:
            "Template occasion is required.",
        });
      }

      if (!values.accent) {
        return res.status(400).json({
          error:
            "Template accent is required.",
        });
      }

      if (!Number.isFinite(values.price)) {
        return res.status(400).json({
          error:
            "Template price must be a valid number.",
        });
      }

      if (!values.previewSeed) {
        return res.status(400).json({
          error:
            "Preview seed is required.",
        });
      }

      const result = await db.query(
        `
        INSERT INTO templates (
          id,
          slug,
          name,
          occasion,
          theme,
          style,
          mood,
          accent,
          price,
          preview_seed,
          creator_name,
          "shortDescription",
          description,
          is_enabled
        )
        VALUES (
          $1,
          $2,
          $3,
          $4,
          $5,
          $6,
          $7,
          $8,
          $9,
          $10,
          $11,
          $12,
          $13,
          $14
        )
        RETURNING
          id,
          slug,
          name,
          occasion,
          theme,
          style,
          mood,
          accent,
          price,
          preview_seed,
          creator_name,
          "shortDescription",
          description,
          is_enabled,
          created_at
        `,
        [
          templateId,
          values.slug,
          values.name,
          values.occasion,
          values.theme,
          values.style,
          values.mood,
          values.accent,
          values.price,
          values.previewSeed,
          values.creatorName,
          values.shortDescription,
          values.description,
          values.isEnabled ? 1 : 0,
        ]
      );

      return res.status(201).json({
        template:
          toPublicTemplate(
            result.rows[0]
          ),
      });
    } catch (err) {
      console.error(
        "Create template error:",
        err
      );

      if (
        err.code === "23505"
      ) {
        return res.status(409).json({
          error:
            "A template with this ID or slug already exists.",
        });
      }

      return res.status(500).json({
        error:
          "Unable to create template.",
      });
    }
  }
);

// Update template
router.put(
  "/admin/:id",
  requireAdmin,
  async (req, res) => {
    try {
      const templateId =
        String(req.params.id || "").trim();

      if (!templateId) {
        return res.status(400).json({
          error:
            "Template ID is required.",
        });
      }

      // ------------------------------------------
      // Status-only update
      // ------------------------------------------

      const bodyKeys =
        Object.keys(req.body || {});

      if (
        bodyKeys.length === 1 &&
        typeof req.body.isEnabled ===
          "boolean"
      ) {
        const result =
          await db.query(
            `
            UPDATE templates
            SET is_enabled = $1
            WHERE id = $2
            RETURNING
              id,
              slug,
              name,
              occasion,
              theme,
              style,
              mood,
              accent,
              price,
              preview_seed,
              creator_name,
              "shortDescription",
              description,
              is_enabled,
              created_at
            `,
            [
              req.body.isEnabled
                ? 1
                : 0,
              templateId,
            ]
          );

        if (
          result.rowCount === 0
        ) {
          return res.status(404).json({
            error:
              "Template not found.",
          });
        }

        return res.json({
          template:
            toPublicTemplate(
              result.rows[0]
            ),
        });
      }

      // ------------------------------------------
      // Full update
      // ------------------------------------------

      const values =
        getTemplateValues(req.body);

      if (!values.slug) {
        return res.status(400).json({
          error:
            "Template slug is required.",
        });
      }

      if (!values.name) {
        return res.status(400).json({
          error:
            "Template name is required.",
        });
      }

      if (!values.occasion) {
        return res.status(400).json({
          error:
            "Template occasion is required.",
        });
      }

      if (!values.accent) {
        return res.status(400).json({
          error:
            "Template accent is required.",
        });
      }

      if (!Number.isFinite(values.price)) {
        return res.status(400).json({
          error:
            "Template price must be a valid number.",
        });
      }

      if (!values.previewSeed) {
        return res.status(400).json({
          error:
            "Preview seed is required.",
        });
      }

      const result =
        await db.query(
          `
          UPDATE templates
          SET
            slug = $1,
            name = $2,
            occasion = $3,
            theme = $4,
            style = $5,
            mood = $6,
            accent = $7,
            price = $8,
            preview_seed = $9,
            creator_name = $10,
            "shortDescription" = $11,
            description = $12,
            is_enabled = $13
          WHERE id = $14
          RETURNING
            id,
            slug,
            name,
            occasion,
            theme,
            style,
            mood,
            accent,
            price,
            preview_seed,
            creator_name,
            "shortDescription",
            description,
            is_enabled,
            created_at
          `,
          [
            values.slug,
            values.name,
            values.occasion,
            values.theme,
            values.style,
            values.mood,
            values.accent,
            values.price,
            values.previewSeed,
            values.creatorName,
            values.shortDescription,
            values.description,
            values.isEnabled ? 1 : 0,
            templateId,
          ]
        );

      if (
        result.rowCount === 0
      ) {
        return res.status(404).json({
          error:
            "Template not found.",
        });
      }

      return res.json({
        template:
          toPublicTemplate(
            result.rows[0]
          ),
      });
    } catch (err) {
      console.error(
        "Update template error:",
        err
      );

      if (
        err.code === "23505"
      ) {
        return res.status(409).json({
          error:
            "A template with this slug already exists.",
        });
      }

      return res.status(500).json({
        error:
          "Unable to update template.",
      });
    }
  }
);

// Disable template
router.delete(
  "/admin/:id",
  requireAdmin,
  async (req, res) => {
    try {
      const templateId =
        String(req.params.id || "").trim();

      if (!templateId) {
        return res.status(400).json({
          error:
            "Template ID is required.",
        });
      }

      const result =
        await db.query(
          `
          UPDATE templates
          SET is_enabled = 0
          WHERE id = $1
          RETURNING
            id,
            slug,
            name,
            occasion,
            theme,
            style,
            mood,
            accent,
            price,
            preview_seed,
            creator_name,
            "shortDescription",
            description,
            is_enabled,
            created_at
          `,
          [templateId]
        );

      if (
        result.rowCount === 0
      ) {
        return res.status(404).json({
          error:
            "Template not found.",
        });
      }

      return res.json({
        template:
          toPublicTemplate(
            result.rows[0]
          ),
      });
    } catch (err) {
      console.error(
        "Disable template error:",
        err
      );

      return res.status(500).json({
        error:
          "Unable to disable template.",
      });
    }
  }
);

// --------------------------------------------------
// PUBLIC SINGLE TEMPLATE
// IMPORTANT:
// Keep this AFTER /admin routes
// --------------------------------------------------

router.get(
  "/:slug",
  async (req, res) => {
    try {
      const slug =
        String(req.params.slug || "").trim();

      if (!slug) {
        return res.status(400).json({
          error:
            "Template slug is required.",
        });
      }

      const result = await db.query(
        `
        SELECT
          id,
          slug,
          name,
          occasion,
          theme,
          style,
          mood,
          accent,
          price,
          preview_seed,
          creator_name,
          "shortDescription",
          description,
          is_enabled,
          created_at
        FROM templates
        WHERE slug = $1
          AND is_enabled = 1
        LIMIT 1
        `,
        [slug]
      );

      if (
        result.rowCount === 0
      ) {
        return res.status(404).json({
          error:
            "Template not found.",
        });
      }

      return res.json({
        template:
          toPublicTemplate(
            result.rows[0]
          ),
      });
    } catch (err) {
      console.error(
        "Get template error:",
        err
      );

      return res.status(500).json({
        error:
          "Unable to load template.",
      });
    }
  }
);

module.exports = router;