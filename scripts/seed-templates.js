// Seeds the master template catalog.
// PostgreSQL version.
// Safe to run multiple times because templates are upserted by slug.

const crypto = require("crypto");
require("../lib/env");
const db = require("../lib/db");

const TEMPLATES = [
  {
    slug: "golden-hour-letter",
    name: "Golden Hour Letter",
    occasion: "Birthday",
    theme: "Playful",
    style: "Polaroid",
    mood: "Joyful",
    accent: "birthday",
    price: 0,
    previewSeed: "golden-hour-letter",
    creatorName: "Momently",
  },
  {
    slug: "paper-lantern-album",
    name: "Paper Lantern Album",
    occasion: "Anniversary",
    theme: "Romantic",
    style: "Cinematic",
    mood: "Warm",
    accent: "anniversary",
    price: 499,
    previewSeed: "paper-lantern-album",
    creatorName: "Momently",
  },
  {
    slug: "quiet-bloom-reel",
    name: "Quiet Bloom Reel",
    occasion: "Proposal",
    theme: "Romantic",
    style: "Cinematic",
    mood: "Dreamy",
    accent: "proposal",
    price: 799,
    previewSeed: "quiet-bloom-reel",
    creatorName: "Momently",
  },
  {
    slug: "late-night-note",
    name: "Late Night Note",
    occasion: "Wedding",
    theme: "Elegant",
    style: "Editorial",
    mood: "Sentimental",
    accent: "wedding",
    price: 1299,
    previewSeed: "late-night-note",
    creatorName: "Momently",
  },
  {
    slug: "first-light-scrapbook",
    name: "First Light Scrapbook",
    occasion: "Valentine",
    theme: "Nostalgic",
    style: "Storybook",
    mood: "Sentimental",
    accent: "anniversary",
    price: 0,
    previewSeed: "first-light-scrapbook",
    creatorName: "Momently",
  },
  {
    slug: "velvet-hour-timeline",
    name: "Velvet Hour Timeline",
    occasion: "Graduation",
    theme: "Bold",
    style: "Editorial",
    mood: "Dramatic",
    accent: "wedding",
    price: 599,
    previewSeed: "velvet-hour-timeline",
    creatorName: "Momently",
  },
  {
    slug: "soft-landing-postcard",
    name: "Soft Landing Postcard",
    occasion: "Baby Announcement",
    theme: "Minimal",
    style: "Handwritten",
    mood: "Warm",
    accent: "birthday",
    price: 0,
    previewSeed: "soft-landing-postcard",
    creatorName: "Momently",
  },
  {
    slug: "open-window-diary",
    name: "Open Window Diary",
    occasion: "Farewell",
    theme: "Nostalgic",
    style: "Handwritten",
    mood: "Sentimental",
    accent: "proposal",
    price: 399,
    previewSeed: "open-window-diary",
    creatorName: "Momently",
  },
];

async function seedTemplates() {
  try {
    for (const template of TEMPLATES) {
      await db.query(
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
          creator_name
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
          $11
        )
        ON CONFLICT (slug)
        DO UPDATE SET
          name = EXCLUDED.name,
          occasion = EXCLUDED.occasion,
          theme = EXCLUDED.theme,
          style = EXCLUDED.style,
          mood = EXCLUDED.mood,
          accent = EXCLUDED.accent,
          price = EXCLUDED.price,
          preview_seed = EXCLUDED.preview_seed,
          creator_name = EXCLUDED.creator_name
        `,
        [
          crypto.randomUUID(),
          template.slug,
          template.name,
          template.occasion,
          template.theme,
          template.style,
          template.mood,
          template.accent,
          template.price,
          template.previewSeed,
          template.creatorName,
        ]
      );
    }

    console.log(`Seeded ${TEMPLATES.length} templates.`);
  } catch (err) {
    console.error("Template seeding failed:", err);
    throw err;
  }
}

seedTemplates();