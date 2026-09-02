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
    previewImageUrl: `https://picsum.photos/seed/${encodeURIComponent(row.preview_seed)}/640/480`,
    creatorName: row.creator_name,
  };
}

// GET /api/templates — customers can only ever read this list, never write it.
router.get("/", (req, res) => {
  const rows = db.prepare("SELECT * FROM templates WHERE is_enabled = 1 ORDER BY created_at DESC").all();
  let templates = rows.map(toPublicTemplate);

  const { occasion, theme, style, mood, search, maxPrice } = req.query;
  if (occasion) templates = templates.filter((t) => t.occasion === occasion);
  if (theme) templates = templates.filter((t) => t.theme === theme);
  if (style) templates = templates.filter((t) => t.style === style);
  if (mood) templates = templates.filter((t) => t.mood === mood);
  if (maxPrice !== undefined) templates = templates.filter((t) => t.price <= Number(maxPrice));
  if (search) {
    const q = String(search).toLowerCase();
    templates = templates.filter((t) => t.name.toLowerCase().includes(q) || t.occasion.toLowerCase().includes(q));
  }

  res.json({ templates });
});

// GET /api/templates/:slug
router.get("/:slug", (req, res) => {
  const row = db.prepare("SELECT * FROM templates WHERE slug = ? AND is_enabled = 1").get(req.params.slug);
  if (!row) return res.status(404).json({ error: "Template not found." });
  res.json({ template: toPublicTemplate(row) });
});

module.exports = router;
