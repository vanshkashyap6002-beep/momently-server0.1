// Private media storage. Files never live under a web-served static
// directory — the only way to read one back is through
// GET /api/media/:id/file, which checks ownership.

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

/**
 * Detect the actual file type from its binary signature.
 *
 * This does NOT trust the browser-provided MIME type
 * or the original filename extension.
 */
function detectFileType(buffer) {
  if (!Buffer.isBuffer(buffer) || buffer.length < 12) {
    return null;
  }

  // JPEG
  if (
    buffer[0] === 0xff &&
    buffer[1] === 0xd8 &&
    buffer[2] === 0xff
  ) {
    return {
      mimeType: "image/jpeg",
      extension: ".jpg"
    };
  }

  // PNG
  if (
    buffer[0] === 0x89 &&
    buffer[1] === 0x50 &&
    buffer[2] === 0x4e &&
    buffer[3] === 0x47 &&
    buffer[4] === 0x0d &&
    buffer[5] === 0x0a &&
    buffer[6] === 0x1a &&
    buffer[7] === 0x0a
  ) {
    return {
      mimeType: "image/png",
      extension: ".png"
    };
  }

  // WebP: RIFF....WEBP
  if (
    buffer.toString("ascii", 0, 4) === "RIFF" &&
    buffer.toString("ascii", 8, 12) === "WEBP"
  ) {
    return {
      mimeType: "image/webp",
      extension: ".webp"
    };
  }

  // ISO Base Media / MP4 / QuickTime
  // "ftyp" normally appears at byte offset 4.
  if (buffer.toString("ascii", 4, 8) === "ftyp") {
    const majorBrand = buffer.toString("ascii", 8, 12);

    // QuickTime/MOV
    if (majorBrand === "qt  ") {
      return {
        mimeType: "video/quicktime",
        extension: ".mov"
      };
    }

    // Common MP4 brands.
    const mp4Brands = new Set([
      "isom",
      "iso2",
      "iso3",
      "iso4",
      "iso5",
      "iso6",
      "mp41",
      "mp42",
      "avc1",
      "dash",
      "M4V ",
      "MSNV"
    ]);

    if (mp4Brands.has(majorBrand)) {
      return {
        mimeType: "video/mp4",
        extension: ".mp4"
      };
    }

    return null;
  }

  // WebM / Matroska EBML signature
  if (
    buffer[0] === 0x1a &&
    buffer[1] === 0x45 &&
    buffer[2] === 0xdf &&
    buffer[3] === 0xa3
  ) {
    return {
      mimeType: "video/webm",
      extension: ".webm"
    };
  }

  return null;
}

/**
 * Saves a Multer file buffer for a given order.
 *
 * The detected file type is based on the actual file bytes.
 * The original filename extension is never trusted.
 */
function saveFile(orderId, multerFile, detectedType) {
  if (!detectedType) {
    throw new Error("Unsupported or invalid file type.");
  }

  const dir = orderDir(orderId);

  const safeName =
    `${crypto.randomUUID()}${detectedType.extension}`;

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

module.exports = {
  saveFile,
  absolutePath,
  deleteFile,
  detectFileType,
  UPLOAD_ROOT
};