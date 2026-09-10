const path = require("path");
const Database = require("better-sqlite3");

require("../lib/env");

const db = require("../lib/db");

const sqlitePath = path.join(__dirname, "..", "data", "momently.db");

async function migrate() {
  const sqlite = new Database(sqlitePath, { readonly: true });

  const client = await db.pool.connect();

  try {
    console.log("Reading SQLite database...");
    console.log(`SQLite source: ${sqlitePath}`);

    await client.query("BEGIN");

    // ---------------------------------------------------------
    // 1. USERS
    // ---------------------------------------------------------

    const users = sqlite.prepare("SELECT * FROM users").all();

    for (const user of users) {
      await client.query(
        `INSERT INTO users
         (
           id,
           full_name,
           email,
           password_hash,
           google_id,
           avatar_url,
           date_of_birth,
           gender,
           relationship_status,
           bio,
           created_at
         )
         VALUES
         (
           $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11
         )
         ON CONFLICT (id) DO UPDATE SET
           full_name = EXCLUDED.full_name,
           email = EXCLUDED.email,
           password_hash = EXCLUDED.password_hash,
           google_id = EXCLUDED.google_id,
           avatar_url = EXCLUDED.avatar_url,
           date_of_birth = EXCLUDED.date_of_birth,
           gender = EXCLUDED.gender,
           relationship_status = EXCLUDED.relationship_status,
           bio = EXCLUDED.bio,
           created_at = EXCLUDED.created_at`,
        [
          user.id,
          user.full_name,
          user.email,
          user.password_hash,
          user.google_id,
          user.avatar_url,
          user.date_of_birth,
          user.gender,
          user.relationship_status,
          user.bio,
          user.created_at,
        ]
      );
    }

    console.log(`Users migrated: ${users.length}`);

    // ---------------------------------------------------------
    // 2. ADMIN USERS
    // ---------------------------------------------------------

    const admins = sqlite.prepare("SELECT * FROM admin_users").all();

    for (const admin of admins) {
      await client.query(
        `INSERT INTO admin_users
         (
           id,
           full_name,
           email,
           password_hash,
           created_at
         )
         VALUES ($1,$2,$3,$4,$5)
         ON CONFLICT (id) DO UPDATE SET
           full_name = EXCLUDED.full_name,
           email = EXCLUDED.email,
           password_hash = EXCLUDED.password_hash,
           created_at = EXCLUDED.created_at`,
        [
          admin.id,
          admin.full_name,
          admin.email,
          admin.password_hash,
          admin.created_at,
        ]
      );
    }

    console.log(`Admin users migrated: ${admins.length}`);

    // ---------------------------------------------------------
    // 3. ORDERS
    // ---------------------------------------------------------
    //
    // IMPORTANT:
    // SQLite and PostgreSQL have different template IDs because
    // the templates were seeded separately.
    //
    // We therefore:
    // SQLite template ID
    //       ↓
    // SQLite template slug
    //       ↓
    // PostgreSQL template slug
    //       ↓
    // PostgreSQL template ID
    //
    // ---------------------------------------------------------

    const sqliteTemplates = sqlite
      .prepare("SELECT id, slug FROM templates")
      .all();

    const templateSlugByOldId = new Map(
      sqliteTemplates.map((template) => [
        template.id,
        template.slug,
      ])
    );

    const orders = sqlite.prepare("SELECT * FROM orders").all();

    for (const order of orders) {
      const templateSlug = templateSlugByOldId.get(order.template_id);

      if (!templateSlug) {
        throw new Error(
          `Could not find SQLite template for order ${order.id}. Old template ID: ${order.template_id}`
        );
      }

      const pgTemplateResult = await client.query(
        "SELECT id FROM templates WHERE slug = $1",
        [templateSlug]
      );

      const pgTemplate = pgTemplateResult.rows[0];

      if (!pgTemplate) {
        throw new Error(
          `PostgreSQL template not found for slug: ${templateSlug}`
        );
      }

      await client.query(
        `INSERT INTO orders
         (
           id,
           user_id,
           template_id,
           recipient_name,
           memory_title,
           important_date,
           personal_message,
           status,
           payment_status,
           amount,
           razorpay_order_id,
           razorpay_payment_id,
           memory_slug,
           memory_subtitle,
           memory_closing_message,
           memory_song_title,
           memory_song_artist,
           published_at,
           created_at,
           updated_at
         )
         VALUES
         (
           $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,
           $11,$12,$13,$14,$15,$16,$17,$18,$19,$20
         )
         ON CONFLICT (id) DO UPDATE SET
           user_id = EXCLUDED.user_id,
           template_id = EXCLUDED.template_id,
           recipient_name = EXCLUDED.recipient_name,
           memory_title = EXCLUDED.memory_title,
           important_date = EXCLUDED.important_date,
           personal_message = EXCLUDED.personal_message,
           status = EXCLUDED.status,
           payment_status = EXCLUDED.payment_status,
           amount = EXCLUDED.amount,
           razorpay_order_id = EXCLUDED.razorpay_order_id,
           razorpay_payment_id = EXCLUDED.razorpay_payment_id,
           memory_slug = EXCLUDED.memory_slug,
           memory_subtitle = EXCLUDED.memory_subtitle,
           memory_closing_message = EXCLUDED.memory_closing_message,
           memory_song_title = EXCLUDED.memory_song_title,
           memory_song_artist = EXCLUDED.memory_song_artist,
           published_at = EXCLUDED.published_at,
           created_at = EXCLUDED.created_at,
           updated_at = EXCLUDED.updated_at`,
        [
          order.id,
          order.user_id,
          pgTemplate.id,
          order.recipient_name,
          order.memory_title,
          order.important_date,
          order.personal_message,
          order.status,
          order.payment_status,
          order.amount,
          order.razorpay_order_id,
          order.razorpay_payment_id,
          order.memory_slug,
          order.memory_subtitle,
          order.memory_closing_message,
          order.memory_song_title,
          order.memory_song_artist,
          order.published_at,
          order.created_at,
          order.updated_at,
        ]
      );

      console.log(
        `Order migrated: ${order.id} → template ${templateSlug}`
      );
    }

    console.log(`Orders migrated: ${orders.length}`);

    // ---------------------------------------------------------
    // 4. MEDIA
    // ---------------------------------------------------------

    const media = sqlite.prepare("SELECT * FROM media").all();

    for (const item of media) {
      await client.query(
        `INSERT INTO media
         (
           id,
           order_id,
           filename,
           stored_path,
           mime_type,
           size_bytes,
           sort_order,
           created_at
         )
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
         ON CONFLICT (id) DO UPDATE SET
           order_id = EXCLUDED.order_id,
           filename = EXCLUDED.filename,
           stored_path = EXCLUDED.stored_path,
           mime_type = EXCLUDED.mime_type,
           size_bytes = EXCLUDED.size_bytes,
           sort_order = EXCLUDED.sort_order,
           created_at = EXCLUDED.created_at`,
        [
          item.id,
          item.order_id,
          item.filename,
          item.stored_path,
          item.mime_type,
          item.size_bytes,
          item.sort_order,
          item.created_at,
        ]
      );
    }

    console.log(`Media records migrated: ${media.length}`);

    // ---------------------------------------------------------
    // 5. MEMORY TIMELINE
    // ---------------------------------------------------------

    const timeline = sqlite
      .prepare("SELECT * FROM memory_timeline")
      .all();

    for (const entry of timeline) {
      await client.query(
        `INSERT INTO memory_timeline
         (
           id,
           order_id,
           entry_date,
           title,
           description,
           sort_order
         )
         VALUES ($1,$2,$3,$4,$5,$6)
         ON CONFLICT (id) DO UPDATE SET
           order_id = EXCLUDED.order_id,
           entry_date = EXCLUDED.entry_date,
           title = EXCLUDED.title,
           description = EXCLUDED.description,
           sort_order = EXCLUDED.sort_order`,
        [
          entry.id,
          entry.order_id,
          entry.entry_date,
          entry.title,
          entry.description,
          entry.sort_order,
        ]
      );
    }

    console.log(`Timeline records migrated: ${timeline.length}`);

    await client.query("COMMIT");

    console.log("");
    console.log("======================================");
    console.log("SQLite → PostgreSQL migration COMPLETE");
    console.log("======================================");
  } catch (err) {
    await client.query("ROLLBACK");

    console.error("");
    console.error("Migration FAILED.");
    console.error("PostgreSQL transaction rolled back.");
    console.error("");
    console.error(err);

    throw err;
  } finally {
    sqlite.close();
    client.release();
  }
}

migrate()
  .then(async () => {
    await db.close();
    process.exit(0);
  })
  .catch(async () => {
    await db.close().catch(() => {});
    process.exit(1);
  });