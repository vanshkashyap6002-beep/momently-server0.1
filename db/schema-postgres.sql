CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY,
    full_name TEXT NOT NULL,
    email TEXT NOT NULL UNIQUE,
    password_hash TEXT,
    google_id TEXT UNIQUE,
    avatar_url TEXT,
    date_of_birth TEXT,
    gender TEXT,
    relationship_status TEXT,
    bio TEXT,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);

CREATE TABLE IF NOT EXISTS admin_users (
    id TEXT PRIMARY KEY,
    full_name TEXT NOT NULL,
    email TEXT NOT NULL UNIQUE,
    password_hash TEXT NOT NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS templates (
    id TEXT PRIMARY KEY,
    slug TEXT NOT NULL UNIQUE,
    name TEXT NOT NULL,
    occasion TEXT NOT NULL,
    theme TEXT,
    style TEXT,
    mood TEXT,
    accent TEXT NOT NULL CHECK (
        accent IN ('birthday','anniversary','proposal','wedding')
    ),
    price INTEGER NOT NULL DEFAULT 0,
    preview_seed TEXT NOT NULL,
    creator_name TEXT NOT NULL DEFAULT 'Momently',
    is_enabled INTEGER NOT NULL DEFAULT 1,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_templates_occasion
ON templates(occasion);

CREATE INDEX IF NOT EXISTS idx_templates_enabled
ON templates(is_enabled);

CREATE TABLE IF NOT EXISTS orders (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    template_id TEXT NOT NULL REFERENCES templates(id) ON DELETE RESTRICT,
    recipient_name TEXT,
    memory_title TEXT,
    important_date TEXT,
    personal_message TEXT,
    status TEXT NOT NULL DEFAULT 'PENDING'
        CHECK (status IN (
            'PENDING',
            'PAID',
            'IN_PROGRESS',
            'READY',
            'PUBLISHED'
        )),
    payment_status TEXT NOT NULL DEFAULT 'UNPAID'
        CHECK (payment_status IN (
            'UNPAID',
            'PAID',
            'FAILED'
        )),
    amount INTEGER NOT NULL DEFAULT 0,
    razorpay_order_id TEXT UNIQUE,
    razorpay_payment_id TEXT UNIQUE,
    memory_slug TEXT UNIQUE,
    memory_subtitle TEXT,
    memory_closing_message TEXT,
    memory_song_title TEXT,
    memory_song_artist TEXT,
    published_at TIMESTAMP,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_orders_user
ON orders(user_id);

CREATE INDEX IF NOT EXISTS idx_orders_status
ON orders(status);

CREATE INDEX IF NOT EXISTS idx_orders_slug
ON orders(memory_slug);

CREATE TABLE IF NOT EXISTS media (
    id TEXT PRIMARY KEY,
    order_id TEXT NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
    filename TEXT NOT NULL,
    stored_path TEXT NOT NULL,
    mime_type TEXT,
    size_bytes INTEGER,
    sort_order INTEGER NOT NULL DEFAULT 0,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_media_order
ON media(order_id, sort_order);

CREATE TABLE IF NOT EXISTS memory_timeline (
    id TEXT PRIMARY KEY,
    order_id TEXT NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
    entry_date TEXT,
    title TEXT,
    description TEXT,
    sort_order INTEGER NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_timeline_order
ON memory_timeline(order_id, sort_order);