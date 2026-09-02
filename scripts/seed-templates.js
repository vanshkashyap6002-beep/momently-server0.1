// Seeds the master template catalog — the same 8 hand-authored templates
// from the reference project's lib/marketplace-data.ts (one per occasion),
// so Stage 1 launches with the identical catalog a customer would
// recognize. Idempotent: safe to run again after a schema change.
//
// Per the spec, Momently is the only one who creates/manages templates —
// there is no route anywhere that lets a customer insert into this table.

const crypto = require("crypto");
require("../lib/env");
const db = require("../lib/db");

const TEMPLATES = [
  { slug: "golden-hour-letter", name: "Golden Hour Letter", occasion: "Birthday", theme: "Playful", style: "Polaroid", mood: "Joyful", accent: "birthday", price: 0, previewSeed: "golden-hour-letter", creatorName: "Momently" },
  { slug: "paper-lantern-album", name: "Paper Lantern Album", occasion: "Anniversary", theme: "Romantic", style: "Cinematic", mood: "Warm", accent: "anniversary", price: 499, previewSeed: "paper-lantern-album", creatorName: "Momently" },
  { slug: "quiet-bloom-reel", name: "Quiet Bloom Reel", occasion: "Proposal", theme: "Romantic", style: "Cinematic", mood: "Dreamy", accent: "proposal", price: 799, previewSeed: "quiet-bloom-reel", creatorName: "Momently" },
  { slug: "late-night-note", name: "Late Night Note", occasion: "Wedding", theme: "Elegant", style: "Editorial", mood: "Sentimental", accent: "wedding", price: 1299, previewSeed: "late-night-note", creatorName: "Momently" },
  { slug: "first-light-scrapbook", name: "First Light Scrapbook", occasion: "Valentine", theme: "Nostalgic", style: "Storybook", mood: "Sentimental", accent: "anniversary", price: 0, previewSeed: "first-light-scrapbook", creatorName: "Momently" },
  { slug: "velvet-hour-timeline", name: "Velvet Hour Timeline", occasion: "Graduation", theme: "Bold", style: "Editorial", mood: "Dramatic", accent: "wedding", price: 599, previewSeed: "velvet-hour-timeline", creatorName: "Momently" },
  { slug: "soft-landing-postcard", name: "Soft Landing Postcard", occasion: "Baby Announcement", theme: "Minimal", style: "Handwritten", mood: "Warm", accent: "birthday", price: 0, previewSeed: "soft-landing-postcard", creatorName: "Momently" },
  { slug: "open-window-diary", name: "Open Window Diary", occasion: "Farewell", theme: "Nostalgic", style: "Handwritten", mood: "Sentimental", accent: "proposal", price: 399, previewSeed: "open-window-diary", creatorName: "Momently" },
];

const upsert = db.prepare(`
  INSERT INTO templates (id, slug, name, occasion, theme, style, mood, accent, price, preview_seed, creator_name)
  VALUES (@id, @slug, @name, @occasion, @theme, @style, @mood, @accent, @price, @previewSeed, @creatorName)
  ON CONFLICT(slug) DO UPDATE SET
    name = excluded.name, occasion = excluded.occasion, theme = excluded.theme,
    style = excluded.style, mood = excluded.mood, accent = excluded.accent,
    price = excluded.price, preview_seed = excluded.preview_seed, creator_name = excluded.creator_name
`);

const tx = db.transaction((templates) => {
  for (const t of templates) upsert.run({ id: crypto.randomUUID(), ...t });
});

tx(TEMPLATES);

console.log(`Seeded ${TEMPLATES.length} templates.`);
