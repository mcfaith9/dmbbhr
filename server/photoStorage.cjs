/**
 * Shared Node.js Employee Photo Storage & Validation Helper
 *
 * Stores employee profile photos inside `<projectRoot>/public/employee-photos/`
 * using the employee's sanitized Bio ID as the filename (e.g. `25065.jpg`).
 *
 * Used by both:
 * - server/biometric-agent/src/bridge/devSocketBridge.js (port 5174)
 * - vite.config.ts dev middleware fallback (port 3000)
 */

const fs = require('fs');
const path = require('path');

const MAX_PHOTO_BYTES = 5 * 1024 * 1024; // 5 MB raw image limit
const MAX_REQUEST_BODY_BYTES = 8 * 1024 * 1024; // 8 MB JSON/base64 envelope limit

const ALLOWED_MIME_TYPES = new Set([
  'image/jpeg',
  'image/jpg',
  'image/png',
  'image/webp'
]);

const ALLOWED_EXTENSIONS = new Set(['jpg', 'jpeg', 'png', 'webp']);

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

class PhotoValidationError extends Error {
  constructor(message, statusCode = 400) {
    super(message);
    this.name = 'PhotoValidationError';
    this.statusCode = statusCode;
  }
}

/**
 * Inspects buffer magic bytes + optional declared MIME/extension to guarantee the file
 * is a genuine JPG, JPEG, PNG, or WebP image.
 */
function detectAndValidateImageFormat(buffer, declaredMimeType = '', originalFileName = '') {
  if (!Buffer.isBuffer(buffer) || buffer.length === 0) {
    throw new PhotoValidationError('Uploaded image is empty.', 400);
  }
  if (buffer.length > MAX_PHOTO_BYTES) {
    throw new PhotoValidationError('Image file exceeds the 5 MB maximum size limit.', 413);
  }

  if (declaredMimeType) {
    const mime = String(declaredMimeType).trim().toLowerCase();
    if (!ALLOWED_MIME_TYPES.has(mime)) {
      throw new PhotoValidationError('Unsupported image type. Please upload a JPG, JPEG, PNG, or WebP image.', 415);
    }
  }

  if (originalFileName) {
    const ext = path.extname(String(originalFileName).trim()).toLowerCase().replace(/^\./, '');
    if (ext && !ALLOWED_EXTENSIONS.has(ext)) {
      throw new PhotoValidationError('Unsupported file extension. Allowed formats: JPG, JPEG, PNG, WebP.', 415);
    }
  }

  // JPEG magic bytes: FF D8 FF
  if (buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) {
    return { ext: 'jpg', mimeType: 'image/jpeg' };
  }

  // PNG magic bytes: 89 50 4E 47 0D 0A 1A 0A
  if (
    buffer.length >= 8 &&
    buffer[0] === 0x89 &&
    buffer[1] === 0x50 &&
    buffer[2] === 0x4e &&
    buffer[3] === 0x47 &&
    buffer[4] === 0x0d &&
    buffer[5] === 0x0a &&
    buffer[6] === 0x1a &&
    buffer[7] === 0x0a
  ) {
    return { ext: 'png', mimeType: 'image/png' };
  }

  // WebP magic bytes: RIFF....WEBP
  if (
    buffer.length >= 12 &&
    buffer.subarray(0, 4).toString('ascii') === 'RIFF' &&
    buffer.subarray(8, 12).toString('ascii') === 'WEBP'
  ) {
    return { ext: 'webp', mimeType: 'image/webp' };
  }

  throw new PhotoValidationError('Invalid image file content. Only valid JPG, JPEG, PNG, or WebP images are accepted.', 415);
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
 * Validates and saves an employee photo into `<projectRoot>/public/employee-photos/<sanitizedBioId>.<ext>`,
 * creating the directory automatically and removing older format duplicates for the same Bio ID.
 * Returns only safe public web paths (no OS/filesystem paths).
 */
function saveEmployeePhoto({ projectRoot, bioId, buffer, mimeType = '', fileName = '' }) {
  const sanitizedBioId = sanitizeBioId(bioId);
  const { ext, mimeType: canonicalMime } = detectAndValidateImageFormat(buffer, mimeType, fileName);

  const photosDir = getPhotosDirectory(projectRoot);
  fs.mkdirSync(photosDir, { recursive: true });

  const targetFilename = `${sanitizedBioId}.${ext}`;
  const targetPath = path.resolve(photosDir, targetFilename);
  if (!targetPath.startsWith(photosDir + path.sep)) {
    throw new PhotoValidationError('Invalid target photo location.', 400);
  }

  // Overwrite / remove any existing photo files for this Bio ID across other extensions to prevent duplicates
  for (const existingExt of ALLOWED_EXTENSIONS) {
    const candidateName = `${sanitizedBioId}.${existingExt}`;
    const candidatePath = path.resolve(photosDir, candidateName);
    if (!candidatePath.startsWith(photosDir + path.sep)) continue;
    if (candidatePath !== targetPath && fs.existsSync(candidatePath)) {
      try {
        fs.unlinkSync(candidatePath);
      } catch {
        // Best-effort cleanup of previous extension before writing replacement
      }
    }
  }

  fs.writeFileSync(targetPath, buffer);

  return {
    status: 'ok',
    bioId: sanitizedBioId,
    filename: targetFilename,
    photoPath: `/employee-photos/${targetFilename}`,
    mimeType: canonicalMime,
    size: buffer.length
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

  req.on('end', () => {
    if (aborted) return;
    try {
      const rawBody = Buffer.concat(chunks).toString('utf8');
      const parsed = JSON.parse(rawBody || '{}');
      const { bioId, dataBase64, mimeType, fileName } = parsed || {};

      const { buffer, embeddedMime } = decodeBase64Image(dataBase64);
      const effectiveMime = mimeType || embeddedMime;

      const result = saveEmployeePhoto({
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
  detectAndValidateImageFormat,
  decodeBase64Image,
  saveEmployeePhoto,
  handleEmployeePhotoUploadRequest
};
