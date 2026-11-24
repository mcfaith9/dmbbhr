/**
 * Shared Node.js Employee Photo Storage & JPG Conversion Helper
 *
 * Converts all supported uploaded employee photos to standard JPEG/JPG format
 * (flattening any transparency onto a solid white background) via `sharp`,
 * and stores them inside `<projectRoot>/public/employee-photos/{BioID}.jpg`.
 *
 * Used by both:
 * - server/biometric-agent/src/bridge/devSocketBridge.js (port 5174)
 * - vite.config.ts dev middleware fallback (port 3000)
 */

const fs = require('fs');
const path = require('path');
const sharp = require('sharp');

const MAX_PHOTO_BYTES = 5 * 1024 * 1024; // 5 MB raw upload limit
const MAX_REQUEST_BODY_BYTES = 8 * 1024 * 1024; // 8 MB JSON/base64 envelope limit
const MAX_INPUT_PIXELS = 25_000_000; // Guard against decompression-bomb images

const ALLOWED_MIME_TYPES = new Set([
  'image/jpeg',
  'image/jpg',
  'image/png',
  'image/webp',
  'image/gif',
  'image/avif',
  'image/heic',
  'image/heif',
  'image/tiff'
]);

const ALLOWED_EXTENSIONS = new Set([
  'jpg',
  'jpeg',
  'png',
  'webp',
  'gif',
  'avif',
  'heic',
  'heif',
  'tif',
  'tiff'
]);

const SHARP_RASTER_FORMATS = new Set([
  'jpeg',
  'png',
  'webp',
  'gif',
  'tiff',
  'heif'
]);

const LEGACY_CLEANUP_EXTENSIONS = [
  'jpeg',
  'png',
  'webp',
  'gif',
  'avif',
  'heic',
  'heif',
  'tif',
  'tiff'
];

class PhotoValidationError extends Error {
  constructor(message, statusCode = 400) {
    super(message);
    this.name = 'PhotoValidationError';
    this.statusCode = statusCode;
  }
}

/**
 * Resolves and verifies the confined employee-photos directory inside `<projectRoot>/public/employee-photos`.
 */
function getPhotosDirectory(projectRoot) {
  const root = path.resolve(projectRoot);
  const publicDir = path.resolve(root, 'public');
  const photosDir = path.resolve(publicDir, 'employee-photos');
  if (!photosDir.startsWith(publicDir + path.sep)) {
    throw new Error('Invalid employee photos directory configuration.');
  }
  return photosDir;
}

/**
 * Sanitizes an employee Bio ID strictly for safe single-segment filename usage.
 * Rejects path traversal tokens and unsupported characters.
 */
function sanitizeBioId(rawBioId) {
  if (typeof rawBioId !== 'string' && typeof rawBioId !== 'number') {
    throw new PhotoValidationError('Employee Bio ID is required.', 400);
  }
  const raw = String(rawBioId).trim();
  if (!raw) {
    throw new PhotoValidationError('Employee Bio ID is required.', 400);
  }
  if (raw.includes('..') || raw.includes('/') || raw.includes('\\') || raw.includes('\0')) {
    throw new PhotoValidationError('Invalid Employee Bio ID.', 400);
  }
  const cleaned = raw.replace(/^emp[-_]/i, '').trim();
  if (!/^[A-Za-z0-9_-]{1,64}$/.test(cleaned)) {
    throw new PhotoValidationError('Employee Bio ID may only contain letters, numbers, hyphens, and underscores.', 400);
  }
  return cleaned;
}

function validateDeclaredFormat(buffer, declaredMimeType = '', originalFileName = '') {
  if (!Buffer.isBuffer(buffer) || buffer.length === 0) {
    throw new PhotoValidationError('Uploaded image is empty.', 400);
  }
  if (buffer.length > MAX_PHOTO_BYTES) {
    throw new PhotoValidationError('Image file exceeds the 5 MB maximum size limit.', 413);
  }

  if (declaredMimeType) {
    const mime = String(declaredMimeType).trim().toLowerCase();
    if (!ALLOWED_MIME_TYPES.has(mime)) {
      throw new PhotoValidationError('Unsupported image type. Please upload a JPG, PNG, WebP, GIF, or AVIF image.', 415);
    }
  }

  if (originalFileName) {
    const ext = path.extname(String(originalFileName).trim()).toLowerCase().replace(/^\./, '');
    if (ext && !ALLOWED_EXTENSIONS.has(ext)) {
      throw new PhotoValidationError('Unsupported file extension. Allowed formats: JPG, JPEG, PNG, WebP, GIF, AVIF.', 415);
    }
  }
}

function isValidJpegBuffer(buffer) {
  return (
    Buffer.isBuffer(buffer) &&
    buffer.length >= 4 &&
    buffer[0] === 0xff &&
    buffer[1] === 0xd8 &&
    buffer[2] === 0xff
  );
}

/**
 * Validates raster image input using `sharp`, applies a solid white background
 * to any transparent regions, honors EXIF orientation, and converts to JPEG.
 */
async function convertImageToJpeg(buffer, declaredMimeType = '', originalFileName = '') {
  validateDeclaredFormat(buffer, declaredMimeType, originalFileName);

  let metadata;
  try {
    metadata = await sharp(buffer, {
      failOn: 'error',
      limitInputPixels: MAX_INPUT_PIXELS
    }).metadata();
  } catch {
    throw new PhotoValidationError('Invalid or corrupted image file. Only valid raster images (JPG, PNG, WebP, GIF, AVIF) are accepted.', 415);
  }

  if (!metadata || !metadata.format || !SHARP_RASTER_FORMATS.has(metadata.format)) {
    throw new PhotoValidationError('Unsupported image format. Please upload a valid JPG, PNG, WebP, GIF, or AVIF image.', 415);
  }

  let jpegBuffer;
  try {
    jpegBuffer = await sharp(buffer, {
      failOn: 'error',
      limitInputPixels: MAX_INPUT_PIXELS
    })
      .rotate()
      .flatten({ background: '#ffffff' })
      .jpeg({ quality: 90, mozjpeg: true })
      .toBuffer();
  } catch {
    throw new PhotoValidationError('Failed to process and convert the uploaded image to JPG format.', 415);
  }

  if (!isValidJpegBuffer(jpegBuffer)) {
    throw new Error('Converted output did not produce a valid JPEG image.');
  }

  return jpegBuffer;
}

/**
 * Decodes a raw base64 string or data URL into a Buffer.
 */
function decodeBase64Image(rawData) {
  if (typeof rawData !== 'string' || !rawData.trim()) {
    throw new PhotoValidationError('Image payload is missing.', 400);
  }
  let base64Part = rawData.trim();
  let embeddedMime = '';

  const dataUrlMatch = /^data:([a-zA-Z0-9/+.-]+);base64,(.+)$/i.exec(base64Part);
  if (dataUrlMatch) {
    embeddedMime = dataUrlMatch[1].toLowerCase();
    base64Part = dataUrlMatch[2];
  }

  const normalized = base64Part.replace(/\s+/g, '');
  if (!/^[A-Za-z0-9+/]+={0,2}$/.test(normalized)) {
    throw new PhotoValidationError('Invalid base64 image encoding.', 400);
  }

  const buffer = Buffer.from(normalized, 'base64');
  return { buffer, embeddedMime };
}

/**
 * Validates, converts to JPEG/JPG (with white background for transparency), and writes to
 * `<projectRoot>/public/employee-photos/<sanitizedBioId>.jpg`, auto-creating the folder
 * and removing any legacy non-.jpg extensions for the same Bio ID.
 * Returns only safe public web paths (no OS/filesystem paths).
 */
async function saveEmployeePhoto({ projectRoot, bioId, buffer, mimeType = '', fileName = '' }) {
  const sanitizedBioId = sanitizeBioId(bioId);
  const jpegBuffer = await convertImageToJpeg(buffer, mimeType, fileName);

  const photosDir = getPhotosDirectory(projectRoot);
  fs.mkdirSync(photosDir, { recursive: true });

  const targetFilename = `${sanitizedBioId}.jpg`;
  const targetPath = path.resolve(photosDir, targetFilename);
  if (!targetPath.startsWith(photosDir + path.sep)) {
    throw new PhotoValidationError('Invalid target photo location.', 400);
  }

  // Remove any legacy non-.jpg files for this Bio ID so {BioID}.jpg remains the single file
  for (const legacyExt of LEGACY_CLEANUP_EXTENSIONS) {
    const candidatePath = path.resolve(photosDir, `${sanitizedBioId}.${legacyExt}`);
    if (!candidatePath.startsWith(photosDir + path.sep)) continue;
    if (candidatePath !== targetPath && fs.existsSync(candidatePath)) {
      try {
        fs.unlinkSync(candidatePath);
      } catch {
        // Best-effort cleanup of legacy extensions
      }
    }
  }

  // Overwrite {BioID}.jpg directly
  fs.writeFileSync(targetPath, jpegBuffer);

  return {
    status: 'ok',
    bioId: sanitizedBioId,
    filename: targetFilename,
    photoPath: `/employee-photos/${targetFilename}`,
    mimeType: 'image/jpeg',
    size: jpegBuffer.length
  };
}

function sendJson(res, statusCode, payload) {
  if (res.headersSent || res.writableEnded) return;
  res.writeHead(statusCode, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(payload));
}

/**
 * HTTP handler for POST /api/employee-photos
 */
function handleEmployeePhotoUploadRequest(req, res, projectRoot) {
  if (req.method !== 'POST') {
    sendJson(res, 405, { status: 'error', message: 'Method not allowed.' });
    return;
  }

  const contentLength = parseInt(req.headers['content-length'] || '0', 10);
  if (contentLength > MAX_REQUEST_BODY_BYTES) {
    sendJson(res, 413, { status: 'error', message: 'Image payload exceeds maximum upload size (5 MB).' });
    return;
  }

  const chunks = [];
  let totalBytes = 0;
  let aborted = false;

  req.on('data', (chunk) => {
    if (aborted) return;
    totalBytes += chunk.length;
    if (totalBytes > MAX_REQUEST_BODY_BYTES) {
      aborted = true;
      sendJson(res, 413, { status: 'error', message: 'Image payload exceeds maximum upload size (5 MB).' });
      try { req.destroy(); } catch {}
      return;
    }
    chunks.push(chunk);
  });

  req.on('error', () => {
    if (!aborted) {
      aborted = true;
      sendJson(res, 400, { status: 'error', message: 'Upload stream interrupted.' });
    }
  });

  req.on('end', async () => {
    if (aborted) return;
    try {
      const rawBody = Buffer.concat(chunks).toString('utf8');
      const parsed = JSON.parse(rawBody || '{}');
      const { bioId, dataBase64, mimeType, fileName } = parsed || {};

      const { buffer, embeddedMime } = decodeBase64Image(dataBase64);
      const effectiveMime = mimeType || embeddedMime;

      const result = await saveEmployeePhoto({
        projectRoot,
        bioId,
        buffer,
        mimeType: effectiveMime,
        fileName
      });

      sendJson(res, 200, result);
    } catch (err) {
      if (err instanceof PhotoValidationError) {
        sendJson(res, err.statusCode, { status: 'error', message: err.message });
        return;
      }
      if (err instanceof SyntaxError) {
        sendJson(res, 400, { status: 'error', message: 'Invalid upload request payload.' });
        return;
      }
      sendJson(res, 500, { status: 'error', message: 'Failed to save employee photo.' });
    }
  });
}

module.exports = {
  MAX_PHOTO_BYTES,
  MAX_REQUEST_BODY_BYTES,
  ALLOWED_EXTENSIONS,
  ALLOWED_MIME_TYPES,
  PhotoValidationError,
  getPhotosDirectory,
  sanitizeBioId,
  validateDeclaredFormat,
  isValidJpegBuffer,
  convertImageToJpeg,
  decodeBase64Image,
  saveEmployeePhoto,
  handleEmployeePhotoUploadRequest
};
