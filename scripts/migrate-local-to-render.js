require("../lib/env");

require("dotenv").config({
  path: require("path").join(__dirname, "..", ".env.render"),
});
const { Pool } = require("pg");

const renderUrl = process.env.RENDER_DATABASE_URL;

if (!renderUrl) {
  throw new Error("RENDER_DATABASE_URL is not configured.");
}

const localDb = require("../lib/db");

const renderDb = new Pool({
  connectionString: renderUrl,
  ssl: { rejectUnauthorized: false },
});

async function main() {
  console.log("Connecting to Render PostgreSQL...");

  await renderDb.query("SELECT 1");

  console.log("Render PostgreSQL connection OK.");

  await renderDb.query("BEGIN");

  try {
    // Users
    const users = await localDb.query("SELECT * FROM users");

    for (const user of users.rows) {
      await renderDb.query(
        `
        INSERT INTO users
        (id, full_name, email, password_hash, google_id, avatar_url,
         date_of_birth, gender, relationship_status, bio, created_at)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
        ON CONFLICT (id) DO UPDATE SET
          full_name = EXCLUDED.full_name,
          email = EXCLUDED.email,
          password_hash = EXCLUDED.password_hash,
          google_id = EXCLUDED.google_id,
          avatar_url = EXCLUDED.avatar_url,
          date_of_birth = EXCLUDED.date_of_birth,
          gender = EXCLUDED.gender,
          relationship_status = EXCLUDED.relationship_status,
          bio = EXCLUDED.bio
        `,
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

    console.log(`Users migrated: ${users.rows.length}`);

    // Admin users
    const admins = await localDb.query("SELECT * FROM admin_users");

    for (const admin of admins.rows) {
      await renderDb.query(
        `
        INSERT INTO admin_users
        (id, full_name, email, password_hash, created_at)
        VALUES ($1,$2,$3,$4,$5)
        ON CONFLICT (id) DO UPDATE SET
          full_name = EXCLUDED.full_name,
          email = EXCLUDED.email,
          password_hash = EXCLUDED.password_hash
        `,
        [
          admin.id,
          admin.full_name,
          admin.email,
          admin.password_hash,
          admin.created_at,
        ]
      );
    }

    console.log(`Admin users migrated: ${admins.rows.length}`);

    // Templates
    const templates = await localDb.query("SELECT * FROM templates");

    for (const template of templates.rows) {
      await renderDb.query(
        `
        INSERT INTO templates
        (id, slug, name, occasion, theme, style, mood, accent,
         price, preview_seed, creator_name, is_enabled, created_at)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)
        ON CONFLICT (slug) DO UPDATE SET
          name = EXCLUDED.name,
          occasion = EXCLUDED.occasion,
          theme = EXCLUDED.theme,
          style = EXCLUDED.style,
          mood = EXCLUDED.mood,
          accent = EXCLUDED.accent,
          price = EXCLUDED.price,
          preview_seed = EXCLUDED.preview_seed,
          creator_name = EXCLUDED.creator_name,
          is_enabled = EXCLUDED.is_enabled
        `,
        [
          template.id,
          template.slug,
          template.name,
          template.occasion,
          template.theme,
          template.style,
          template.mood,
          template.accent,
          template.price,
          template.preview_seed,
          template.creator_name,
          template.is_enabled,
          template.created_at,
        ]
      );
    }

    console.log(`Templates migrated: ${templates.rows.length}`);

    // Orders
    const orders = await localDb.query("SELECT * FROM orders");

    for (const order of orders.rows) {
      const template = await localDb.query(
        "SELECT slug FROM templates WHERE id = $1",
        [order.template_id]
      );

      if (template.rows.length === 0) {
        throw new Error(
          `Template not found for order ${order.id}`
        );
      }

      const renderTemplate = await renderDb.query(
        "SELECT id FROM templates WHERE slug = $1",
        [template.rows[0].slug]
      );

      if (renderTemplate.rows.length === 0) {
        throw new Error(
          `Render template not found: ${template.rows[0].slug}`
        );
      }

      await renderDb.query(
        `
        INSERT INTO orders
        (id, user_id, template_id, recipient_name, memory_title,
         important_date, personal_message, status, payment_status, amount,
         razorpay_order_id, razorpay_payment_id, memory_slug,
         memory_subtitle, memory_closing_message, memory_song_title,
         memory_song_artist, published_at, created_at, updated_at)
        VALUES
        ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,
         $11,$12,$13,$14,$15,$16,$17,$18,$19,$20)
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
          updated_at = EXCLUDED.updated_at
        `,
        [
          order.id,
          order.user_id,
          renderTemplate.rows[0].id,
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
    }

    console.log(`Orders migrated: ${orders.rows.length}`);

    // Media
    const media = await localDb.query("SELECT * FROM media");

    for (const item of media.rows) {
      await renderDb.query(
        `
        INSERT INTO media
        (id, order_id, filename, stored_path, mime_type,
         size_bytes, sort_order, created_at)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
        ON CONFLICT (id) DO UPDATE SET
          order_id = EXCLUDED.order_id,
          filename = EXCLUDED.filename,
          stored_path = EXCLUDED.stored_path,
          mime_type = EXCLUDED.mime_type,
          size_bytes = EXCLUDED.size_bytes,
          sort_order = EXCLUDED.sort_order
        `,
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

    console.log(`Media records migrated: ${media.rows.length}`);

    // Timeline
    const timeline = await localDb.query(
      "SELECT * FROM memory_timeline"
    );

    for (const item of timeline.rows) {
      await renderDb.query(
        `
        INSERT INTO memory_timeline
        (id, order_id, entry_date, title, description, sort_order)
        VALUES ($1,$2,$3,$4,$5,$6)
        ON CONFLICT (id) DO UPDATE SET
          order_id = EXCLUDED.order_id,
          entry_date = EXCLUDED.entry_date,
          title = EXCLUDED.title,
          description = EXCLUDED.description,
          sort_order = EXCLUDED.sort_order
        `,
        [
          item.id,
          item.order_id,
          item.entry_date,
          item.title,
          item.description,
          item.sort_order,
        ]
      );
    }

    console.log(
      `Timeline records migrated: ${timeline.rows.length}`
    );

    await renderDb.query("COMMIT");

    console.log("");
    console.log("======================================");
    console.log("Local PostgreSQL → Render PostgreSQL COMPLETE");
    console.log("======================================");
  } catch (error) {
    await renderDb.query("ROLLBACK");
    throw error;
  } finally {
    await renderDb.end();
    await localDb.close();
  }
}

main().catch((error) => {
  console.error("");
  console.error("Migration failed:");
  console.error(error);
  process.exit(1);
});