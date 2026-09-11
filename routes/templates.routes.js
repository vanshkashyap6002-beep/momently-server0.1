const express = require("express");
const db = require("../lib/db");

const router = express.Router();

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
    shortDescription: row.shortDescription,
    description: row.description,
    previewImageUrl: `https://picsum.photos/seed/${encodeURIComponent(
      row.preview_seed
    )}/640/480`,
    creatorName: row.creator_name,
  };
}

// GET /api/templates
// Customers can only ever read this list, never write it.
router.get("/", async (req, res) => {
  try {
    const result = await db.query(
      `
      SELECT *
      FROM templates
      WHERE is_enabled = 1
      ORDER BY created_at DESC
      `
    );

    let templates = result.rows.map(toPublicTemplate);

    const {
      occasion,
      theme,
      style,
      mood,
      search,
      maxPrice,
    } = req.query;

    if (occasion) {
      templates = templates.filter(
        (t) => t.occasion === occasion
      );
    }

    if (theme) {
      templates = templates.filter(
        (t) => t.theme === theme
      );
    }

    if (style) {
      templates = templates.filter(
        (t) => t.style === style
      );
    }

    if (mood) {
      templates = templates.filter(
        (t) => t.mood === mood
      );
    }

    if (maxPrice !== undefined) {
      const price = Number(maxPrice);

      if (!Number.isNaN(price)) {
        templates = templates.filter(
          (t) => t.price <= price
        );
      }
    }

    if (search) {
      const q = String(search).toLowerCase();

      templates = templates.filter(
        (t) =>
          t.name.toLowerCase().includes(q) ||
          t.occasion.toLowerCase().includes(q)
      );
    }

    return res.json({ templates });
  } catch (err) {
    console.error("Get templates error:", err);

    return res.status(500).json({
      error: "Unable to load templates.",
    });
  }
});

// GET /api/templates/:slug
router.get("/:slug", async (req, res) => {
  try {
    const result = await db.query(
      `
      SELECT *
      FROM templates
      WHERE slug = $1
        AND is_enabled = 1
      `,
      [req.params.slug]
    );

    const row = result.rows[0];

    if (!row) {
      return res.status(404).json({
        error: "Template not found.",
      });
    }

    return res.json({
      template: toPublicTemplate(row),
    });
  } catch (err) {
    console.error("Get template error:", err);

    return res.status(500).json({
      error: "Unable to load template.",
    });
  }
});

module.exports = router;