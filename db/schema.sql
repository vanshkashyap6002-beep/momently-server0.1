-- ============================================================================
-- Momently Stage 1 — Database Schema (SQLite)
-- ----------------------------------------------------------------------------
-- Deliberately simple, matching the Stage 1 spec: customers submit info +
-- photos, Momently (admin) hand-builds and publishes the memory page. This
-- is NOT the full multi-feature schema of the Next.js reference project
-- (no community template submissions, reports, profiles, analytics) —
-- Stage 1 explicitly scopes those out.
--
-- customers (users) and admins are separate tables on purpose: an admin
-- account can never be created through the public signup form, and a
-- customer session can never satisfy an admin-only route. See
-- server/middleware/customerAuth.js and adminAuth.js.
-- ============================================================================

PRAGMA foreign_keys = ON;

-- ----------------------------------------------------------------------------
-- users — customer accounts only
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS users (
  id            TEXT PRIMARY KEY,
  full_name     TEXT NOT NULL,
  email         TEXT NOT NULL UNIQUE,
  password_hash TEXT,              -- NULL for Google-only accounts
  google_id     TEXT UNIQUE,
  avatar_url    TEXT,
  created_at    TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);

-- ----------------------------------------------------------------------------
-- admin_users — completely separate account space. No public route ever
-- inserts into this table; only server/scripts/create-admin.js does.
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS admin_users (
  id            TEXT PRIMARY KEY,
  full_name     TEXT NOT NULL,
  email         TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  created_at    TEXT NOT NULL DEFAULT (datetime('now'))
);

-- ----------------------------------------------------------------------------
-- templates — master templates, created once by Momently (seeded), reused
-- by many orders. Customers can only read this table, never write it.
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS templates (
  id           TEXT PRIMARY KEY,
  slug         TEXT NOT NULL UNIQUE,
  name         TEXT NOT NULL,
  occasion     TEXT NOT NULL,
  theme        TEXT,
  style        TEXT,
  mood         TEXT,
  accent       TEXT NOT NULL CHECK (accent IN ('birthday','anniversary','proposal','wedding')),
  price        INTEGER NOT NULL DEFAULT 0,   -- INR, whole rupees
  preview_seed TEXT NOT NULL,
  creator_name TEXT NOT NULL DEFAULT 'Momently',
  is_enabled   INTEGER NOT NULL DEFAULT 1,
  created_at   TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_templates_occasion ON templates(occasion);
CREATE INDEX IF NOT EXISTS idx_templates_enabled ON templates(is_enabled);

-- ----------------------------------------------------------------------------
-- orders — the central Stage 1 entity: one customer's request for one
-- template, from PENDING through PUBLISHED.
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS orders (
  id                      TEXT PRIMARY KEY,
  user_id                 TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  template_id             TEXT NOT NULL REFERENCES templates(id) ON DELETE RESTRICT,

  -- Customer Information (spec: name/email come from the user account itself)
  recipient_name          TEXT,
  memory_title            TEXT,
  important_date          TEXT,
  personal_message        TEXT,

  -- Order + payment status. Kept as two fields on purpose: a PAID order can
  -- still be IN_PROGRESS from a fulfillment point of view.
  status                  TEXT NOT NULL DEFAULT 'PENDING'
                           CHECK (status IN ('PENDING','PAID','IN_PROGRESS','READY','PUBLISHED')),
  payment_status          TEXT NOT NULL DEFAULT 'UNPAID'
                           CHECK (payment_status IN ('UNPAID','PAID','FAILED')),
  amount                  INTEGER NOT NULL DEFAULT 0,
  razorpay_order_id       TEXT UNIQUE,
  razorpay_payment_id     TEXT UNIQUE,

  -- Admin-authored publish content — filled in by Momently, not the customer.
  memory_slug              TEXT UNIQUE,
  memory_subtitle          TEXT,
  memory_closing_message   TEXT,
  memory_song_title        TEXT,
  memory_song_artist       TEXT,

  published_at            TEXT,
  created_at               TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at               TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_orders_user ON orders(user_id);
CREATE INDEX IF NOT EXISTS idx_orders_status ON orders(status);
CREATE INDEX IF NOT EXISTS idx_orders_slug ON orders(memory_slug);

-- ----------------------------------------------------------------------------
-- media — uploaded photos/video for an order. Private by default; only
-- becomes fetchable without auth once its parent order is PUBLISHED.
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS media (
  id           TEXT PRIMARY KEY,
  order_id     TEXT NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  filename     TEXT NOT NULL,
  stored_path  TEXT NOT NULL,     -- path on disk, under server/uploads — never web-served directly
  mime_type    TEXT,
  size_bytes   INTEGER,
  sort_order   INTEGER NOT NULL DEFAULT 0,
  created_at   TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_media_order ON media(order_id, sort_order);

-- ----------------------------------------------------------------------------
-- memory_timeline — the "Our Story" entries on the published memory page.
-- Admin-authored when Momently builds the memory (see PublicMemoryView in
-- the reference project — same section, same shape: date/title/description).
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS memory_timeline (
  id           TEXT PRIMARY KEY,
  order_id     TEXT NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  entry_date   TEXT,
  title        TEXT,
  description  TEXT,
  sort_order   INTEGER NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_timeline_order ON memory_timeline(order_id, sort_order);

-- Existing users table
CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  full_name TEXT NOT NULL,
  email TEXT UNIQUE NOT NULL,
  password_hash TEXT,
  google_id TEXT UNIQUE,
  avatar_url TEXT,
  date_of_birth TEXT,
  gender TEXT,
  relationship_status TEXT,
  bio TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);