-- Review and apply separately before releasing the Memory Link changes.
-- Existing slugs and published links remain untouched. No backfill is needed.
ALTER TABLE orders ADD COLUMN IF NOT EXISTS memory_url TEXT;
