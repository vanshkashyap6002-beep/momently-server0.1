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

/*
|--------------------------------------------------------------------------
| CUSTOMER ROUTES
|--------------------------------------------------------------------------
*/

// GET /api/templates
// Customers can only see enabled templates.
router.get("/", async (req, res) => {
  try {
    const result = await db.query(`
      SELECT *
      FROM templates
      WHERE is_enabled = 1
      ORDER BY created_at DESC
    `);

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

/*
|--------------------------------------------------------------------------
| ADMIN ROUTES
|--------------------------------------------------------------------------
*/

// GET /api/templates/admin
// Returns ALL templates, including disabled ones.
router.get("/admin", async (req, res) => {
  try {
    const result = await db.query(`
      SELECT *
      FROM templates
      ORDER BY created_at DESC
    `);

    return res.json({
      templates: result.rows.map((row) => ({
        ...toPublicTemplate(row),
        isEnabled: row.is_enabled === 1,
      })),
    });
  } catch (err) {
    console.error("Admin get templates error:", err);

    return res.status(500).json({
      error: "Unable to load admin templates.",
    });
  }
});

// POST /api/templates/admin
// Add a new template.
router.post("/admin", async (req, res) => {
  try {
    const {
      slug,
      name,
      occasion,
      theme,
      style,
      mood,
      accent,
      price,
      previewSeed,
      creatorName,
      shortDescription,
      description,
    } = req.body;

    if (
      !slug ||
      !name ||
      !occasion ||
      !accent ||
      price === undefined ||
      !previewSeed
    ) {
      return res.status(400).json({
        error: "Please fill all required template fields.",
      });
    }

    const id = crypto.randomUUID();

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
        description
      )
      VALUES (
        $1, $2, $3, $4, $5, $6, $7,
        $8, $9, $10, $11, $12, $13
      )
      RETURNING *
      `,
      [
        id,
        slug,
        name,
        occasion,
        theme || null,
        style || null,
        mood || null,
        accent,
        Number(price),
        previewSeed,
        creatorName || "Momently",
        shortDescription || "",
        description || "",
      ]
    );

    return res.status(201).json({
      message: "Template created successfully.",
      template: toPublicTemplate(result.rows[0]),
    });
  } catch (err) {
    console.error("Create template error:", err);

    if (err.code === "23505") {
      return res.status(409).json({
        error: "A template with this slug already exists.",
      });
    }

    return res.status(500).json({
      error: "Unable to create template.",
    });
  }
});

// PUT /api/templates/admin/:id
// Edit an existing template.
router.put("/admin/:id", async (req, res) => {
  try {
    const {
      slug,
      name,
      occasion,
      theme,
      style,
      mood,
      accent,
      price,
      previewSeed,
      creatorName,
      shortDescription,
      description,
      isEnabled,
    } = req.body;

    const result = await db.query(
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
      RETURNING *
      `,
      [
        slug,
        name,
        occasion,
        theme || null,
        style || null,
        mood || null,
        accent,
        Number(price),
        previewSeed,
        creatorName || "Momently",
        shortDescription || "",
        description || "",
        isEnabled === false ? 0 : 1,
        req.params.id,
      ]
    );

    if (!result.rows[0]) {
      return res.status(404).json({
        error: "Template not found.",
      });
    }

    return res.json({
      message: "Template updated successfully.",
      template: toPublicTemplate(result.rows[0]),
    });
  } catch (err) {
    console.error("Update template error:", err);

    if (err.code === "23505") {
      return res.status(409).json({
        error: "A template with this slug already exists.",
      });
    }

    return res.status(500).json({
      error: "Unable to update template.",
    });
  }
});

// DELETE /api/templates/admin/:id
// We disable instead of permanently deleting.
router.delete("/admin/:id", async (req, res) => {
  try {
    const result = await db.query(
      `
      UPDATE templates
      SET is_enabled = 0
      WHERE id = $1
      RETURNING *
      `,
      [req.params.id]
    );

    if (!result.rows[0]) {
      return res.status(404).json({
        error: "Template not found.",
      });
    }

    return res.json({
      message: "Template disabled successfully.",
      template: {
        ...toPublicTemplate(result.rows[0]),
        isEnabled: false,
      },
    });
  } catch (err) {
    console.error("Disable template error:", err);

    return res.status(500).json({
      error: "Unable to disable template.",
    });
  }
});

module.exports = router;