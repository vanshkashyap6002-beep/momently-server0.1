// Private media storage. Files never live under a web-served static
// directory — the only way to read one back is through
// GET /api/media/:id/file, which checks ownership (see routes/media.routes.js).
//
// This is intentionally a small, swappable module: local disk is the
// simplest thing that works with zero external accounts for Stage 1. To
// move to S3/Cloudinary/Supabase Storage later, keep the same three
// exports (`saveFile`, `readFile`, `deleteFile`) and change only the
// implementation inside them — nothing in routes/ needs to change, the
// same way the reference project's MediaStorage interface let it swap
// Cloudinary for Supabase without touching call sites.

const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

// Same reasoning as DATABASE_PATH in lib/db.js: resolve relative to the
// project root, not wherever `node` happened to be launched from.
const PROJECT_ROOT = path.join(__dirname, "..", "..");
const UPLOAD_ROOT = process.env.UPLOAD_DIR
  ? path.resolve(PROJECT_ROOT, process.env.UPLOAD_DIR)
  : path.join(__dirname, "..", "uploads");

function orderDir(orderId) {
  const dir = path.join(UPLOAD_ROOT, orderId);
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

/** Saves a Multer file buffer/tmp path for a given order and returns the
 * relative stored path (what gets saved in the `media.stored_path` column). */
function saveFile(orderId, multerFile) {
  const dir = orderDir(orderId);
  const ext = path.extname(multerFile.originalname).toLowerCase();
  const safeName = `${crypto.randomUUID()}${ext}`;
  const destPath = path.join(dir, safeName);
  fs.writeFileSync(destPath, multerFile.buffer);
  return path.relative(UPLOAD_ROOT, destPath);
}

function absolutePath(storedPath) {
  return path.join(UPLOAD_ROOT, storedPath);
}

function deleteFile(storedPath) {
  const full = absolutePath(storedPath);
  fs.rm(full, { force: true }, () => {});
}

module.exports = { saveFile, absolutePath, deleteFile, UPLOAD_ROOT };
