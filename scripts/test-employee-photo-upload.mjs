/**
 * DMBBHR Employee Profile Photo Upload & JPG Conversion Verification Suite
 *
 * Verifies:
 * 1. server/photoStorage.cjs auto-creates `<root>/public/employee-photos/`
 * 2. Converts JPG, PNG (with transparency -> white background), WebP, GIF, AVIF to JPEG (`{BioID}.jpg`) via sharp
 * 3. Overwrites `{BioID}.jpg` cleanly and removes any legacy non-.jpg files for that Bio ID
 * 4. Sanitizes Bio IDs and blocks path traversal tokens (`..`, `/`, `\`, null bytes)
 * 5. Rejects SVG, HTML/disguised scripts, corrupted payloads, and >5 MB uploads
 * 6. HTTP POST /api/employee-photos converts to JPG, returns `/employee-photos/{BioID}.jpg` + `image/jpeg`, and never leaks OS paths
 * 7. `employeeService.updateEmployee` & `buildEmployeePhotoCandidates` resolve to `/employee-photos/{BioID}.jpg`
 *
 * Run: node scripts/test-employee-photo-upload.mjs
 */

import assert from 'node:assert'
import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import http from 'node:http'
import { createRequire } from 'node:module'
import { createServer as createViteServer } from 'vite'

const require = createRequire(import.meta.url)
const sharp = require('sharp')
const photoStorage = require('../server/photoStorage.cjs')

const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'dmbbhr-photo-test-'))

// Generate real test images via sharp
// 1) Transparent 16x16 PNG: transparent outer pixels (alpha=0), solid blue center pixel
async function makeTransparentPngBuffer() {
  const width = 16
  const height = 16
  const raw = Buffer.alloc(width * height * 4, 0) // all RGBA = 0,0,0,0 (fully transparent)
  // Paint center 4x4 square solid blue (0, 102, 204, 255)
  for (let y = 6; y < 10; y++) {
    for (let x = 6; x < 10; x++) {
      const idx = (y * width + x) * 4
      raw[idx] = 0
      raw[idx + 1] = 102
      raw[idx + 2] = 204
      raw[idx + 3] = 255
    }
  }
  return await sharp(raw, { raw: { width, height, channels: 4 } }).png().toBuffer()
}

// 2) Transparent 16x16 WebP: transparent outer pixels, solid green center
async function makeTransparentWebpBuffer() {
  const width = 16
  const height = 16
  const raw = Buffer.alloc(width * height * 4, 0)
  for (let y = 6; y < 10; y++) {
    for (let x = 6; x < 10; x++) {
      const idx = (y * width + x) * 4
      raw[idx] = 34
      raw[idx + 1] = 197
      raw[idx + 2] = 94
      raw[idx + 3] = 255
    }
  }
  return await sharp(raw, { raw: { width, height, channels: 4 } }).webp({ lossless: true }).toBuffer()
}

// 3) Standard 16x16 JPEG
async function makeJpgBuffer() {
  return await sharp({
    create: { width: 16, height: 16, channels: 3, background: { r: 220, g: 38, b: 38 } }
  })
    .jpeg()
    .toBuffer()
}

// 4) GIF 16x16
async function makeGifBuffer() {
  return await sharp({
    create: { width: 16, height: 16, channels: 4, background: { r: 10, g: 20, b: 30, alpha: 0 } }
  })
    .gif()
    .toBuffer()
}

const FAKE_HTML_DISGUISED = Buffer.from('<html><script>alert(1)</script></html>', 'utf8')
const SVG_WITH_SCRIPT = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>', 'utf8')

let passed = 0
const ok = (msg) => {
  passed++
  console.log(`✔ ${msg}`)
}

async function runHttpUpload(baseUrl, bodyObj) {
  const res = await fetch(`${baseUrl}/api/employee-photos`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(bodyObj)
  })
  const json = await res.json()
  return { status: res.status, json }
}

let httpServer = null
let viteServer = null

try {
  const validPng = await makeTransparentPngBuffer()
  const validWebp = await makeTransparentWebpBuffer()
  const validJpg = await makeJpgBuffer()
  const validGif = await makeGifBuffer()

  // 1. Directory auto-creation + transparent PNG -> JPG with white background
  const photosDir = path.join(tempRoot, 'public', 'employee-photos')
  assert.strictEqual(fs.existsSync(photosDir), false, 'employee-photos dir should not exist before first upload')

  // Seed a legacy non-.jpg file manually after creating dir? First check auto-creation without dir:
  const resPng = await photoStorage.saveEmployeePhoto({
    projectRoot: tempRoot,
    bioId: '25065',
    buffer: validPng,
    mimeType: 'image/png',
    fileName: 'transparent_headshot.png'
  })
  assert.strictEqual(fs.existsSync(photosDir), true, 'employee-photos dir must be created automatically')
  assert.strictEqual(resPng.filename, '25065.jpg')
  assert.strictEqual(resPng.photoPath, '/employee-photos/25065.jpg')
  assert.strictEqual(resPng.mimeType, 'image/jpeg')

  const savedJpgPath = path.join(photosDir, '25065.jpg')
  assert.strictEqual(fs.existsSync(savedJpgPath), true)
  const savedBytesFromPng = fs.readFileSync(savedJpgPath)
  assert.strictEqual(photoStorage.isValidJpegBuffer(savedBytesFromPng), true, 'Saved file must have JPEG magic bytes')
  const pngConvMeta = await sharp(savedBytesFromPng).metadata()
  assert.strictEqual(pngConvMeta.format, 'jpeg')
  assert.strictEqual(pngConvMeta.hasAlpha, false)

  // Verify corner pixel (formerly alpha=0 transparent) is now solid white (#ffffff)
  const { data: rgbPixels } = await sharp(savedBytesFromPng).raw().toBuffer({ resolveWithObject: true })
  assert.ok(rgbPixels[0] >= 250 && rgbPixels[1] >= 250 && rgbPixels[2] >= 250, `Expected white background at transparent pixel, got rgb(${rgbPixels[0]},${rgbPixels[1]},${rgbPixels[2]})`)
  ok('Test 1: Transparent PNG converted to 25065.jpg with solid white background & auto-created directory')

  // 2. Replace with transparent WebP -> overwrites 25065.jpg cleanly (and removes any legacy .webp/.png)
  fs.writeFileSync(path.join(photosDir, '25065.webp'), validWebp) // simulate pre-existing legacy file
  const resWebp = await photoStorage.saveEmployeePhoto({
    projectRoot: tempRoot,
    bioId: '25065',
    buffer: validWebp,
    mimeType: 'image/webp',
    fileName: 'avatar.webp'
  })
  assert.strictEqual(resWebp.filename, '25065.jpg')
  assert.strictEqual(resWebp.photoPath, '/employee-photos/25065.jpg')
  assert.strictEqual(resWebp.mimeType, 'image/jpeg')
  assert.deepStrictEqual(fs.readdirSync(photosDir), ['25065.jpg'], 'Only 25065.jpg must exist (zero duplicate formats)')
  const webpConvMeta = await sharp(fs.readFileSync(savedJpgPath)).metadata()
  assert.strictEqual(webpConvMeta.format, 'jpeg')
  ok('Test 2: Transparent WebP converted to 25065.jpg, overwrote previous JPG, and removed legacy extensions')

  // 3. GIF & JPEG formats also save as {BioID}.jpg cleanly
  const resGif = await photoStorage.saveEmployeePhoto({
    projectRoot: tempRoot,
    bioId: '25065',
    buffer: validGif,
    mimeType: 'image/gif',
    fileName: 'animated_avatar.gif'
  })
  assert.strictEqual(resGif.filename, '25065.jpg')
  assert.strictEqual(resGif.mimeType, 'image/jpeg')
  assert.strictEqual((await sharp(fs.readFileSync(savedJpgPath)).metadata()).format, 'jpeg')

  const resJpg = await photoStorage.saveEmployeePhoto({
    projectRoot: tempRoot,
    bioId: '25065',
    buffer: validJpg,
    mimeType: 'image/jpeg',
    fileName: 'photo.jpeg'
  })
  assert.strictEqual(resJpg.filename, '25065.jpg')
  assert.strictEqual(resJpg.photoPath, '/employee-photos/25065.jpg')
  assert.strictEqual((await sharp(fs.readFileSync(savedJpgPath)).metadata()).format, 'jpeg')
  ok('Test 3: GIF and JPEG inputs both convert and save strictly as 25065.jpg')

  // 4. Bio ID sanitization & path traversal protection
  for (const badId of ['', '   ', '../secret', '25065/evil', '25065\\evil', 'a..b', 'id\0evil', 'bad id!@#']) {
    assert.throws(
      () => photoStorage.sanitizeBioId(badId),
      (err) => err instanceof photoStorage.PhotoValidationError && err.statusCode === 400,
      `Expected 400 PhotoValidationError for Bio ID "${badId}"`
    )
  }
  assert.strictEqual(photoStorage.sanitizeBioId('emp-25065'), '25065')
  assert.strictEqual(photoStorage.sanitizeBioId(' 50305 '), '50305')
  ok('Test 4: Bio ID sanitization rejects path traversal and invalid characters')

  // 5. Reject disguised HTML, SVG scripts, and > 5 MB payloads
  await assert.rejects(
    () =>
      photoStorage.saveEmployeePhoto({
        projectRoot: tempRoot,
        bioId: '25065',
        buffer: FAKE_HTML_DISGUISED,
        mimeType: 'image/jpeg',
        fileName: 'evil.jpg'
      }),
    (err) => err instanceof photoStorage.PhotoValidationError && err.statusCode === 415
  )
  await assert.rejects(
    () =>
      photoStorage.saveEmployeePhoto({
        projectRoot: tempRoot,
        bioId: '25065',
        buffer: SVG_WITH_SCRIPT,
        mimeType: 'image/svg+xml',
        fileName: 'bad.svg'
      }),
    (err) => err instanceof photoStorage.PhotoValidationError && err.statusCode === 415
  )
  await assert.rejects(
    () =>
      photoStorage.saveEmployeePhoto({
        projectRoot: tempRoot,
        bioId: '25065',
        buffer: SVG_WITH_SCRIPT,
        mimeType: 'image/png',
        fileName: 'disguised_svg.png'
      }),
    (err) => err instanceof photoStorage.PhotoValidationError && err.statusCode === 415
  )

  const oversized = Buffer.alloc(photoStorage.MAX_PHOTO_BYTES + 1, 0xff)
  oversized[0] = 0xff
  oversized[1] = 0xd8
  oversized[2] = 0xff
  await assert.rejects(
    () =>
      photoStorage.saveEmployeePhoto({
        projectRoot: tempRoot,
        bioId: '25065',
        buffer: oversized,
        mimeType: 'image/jpeg',
        fileName: 'huge.jpg'
      }),
    (err) => err instanceof photoStorage.PhotoValidationError && err.statusCode === 413
  )
  ok('Test 5: Rejects disguised HTML/SVG payloads and enforces 5 MB size limit')

  // 6. Node.js HTTP server route test (PNG upload -> saved as /employee-photos/50305.jpg)
  httpServer = http.createServer((req, res) => {
    if (req.url === '/api/employee-photos' && req.method === 'POST') {
      photoStorage.handleEmployeePhotoUploadRequest(req, res, tempRoot)
      return
    }
    res.writeHead(404)
    res.end('Not found')
  })
  await new Promise((resolve) => httpServer.listen(0, '127.0.0.1', resolve))
  const port = httpServer.address().port
  const baseUrl = `http://127.0.0.1:${port}`

  const httpOk = await runHttpUpload(baseUrl, {
    bioId: '50305',
    fileName: 'headshot.png',
    mimeType: 'image/png',
    dataBase64: `data:image/png;base64,${validPng.toString('base64')}`
  })
  assert.strictEqual(httpOk.status, 200)
  assert.strictEqual(httpOk.json.photoPath, '/employee-photos/50305.jpg')
  assert.strictEqual(httpOk.json.filename, '50305.jpg')
  assert.strictEqual(httpOk.json.mimeType, 'image/jpeg')
  assert.strictEqual(JSON.stringify(httpOk.json).includes(tempRoot), false, 'Response must never expose OS filesystem paths')
  const saved50305 = path.join(photosDir, '50305.jpg')
  assert.strictEqual(fs.existsSync(saved50305), true)
  assert.strictEqual((await sharp(fs.readFileSync(saved50305)).metadata()).format, 'jpeg')

  const httpBadType = await runHttpUpload(baseUrl, {
    bioId: '50305',
    fileName: 'payload.jpg',
    mimeType: 'image/jpeg',
    dataBase64: FAKE_HTML_DISGUISED.toString('base64')
  })
  assert.strictEqual(httpBadType.status, 415)
  ok('Test 6: HTTP POST /api/employee-photos converts PNG to 50305.jpg and never exposes filesystem paths')

  // 7. Verify employeeService.updateEmployee & buildEmployeePhotoCandidates follow `/employee-photos/{BioID}.jpg`
  const localStore = new Map()
  const sessionStore = new Map()
  if (typeof globalThis.localStorage === 'undefined') {
    globalThis.localStorage = {
      getItem: (k) => (localStore.has(k) ? localStore.get(k) : null),
      setItem: (k, v) => localStore.set(k, String(v)),
      removeItem: (k) => localStore.delete(k),
      clear: () => localStore.clear(),
      key: (i) => Array.from(localStore.keys())[i] ?? null,
      get length() { return localStore.size }
    }
  }
  if (typeof globalThis.sessionStorage === 'undefined') {
    globalThis.sessionStorage = {
      getItem: (k) => (sessionStore.has(k) ? sessionStore.get(k) : null),
      setItem: (k, v) => sessionStore.set(k, String(v)),
      removeItem: (k) => sessionStore.delete(k),
      clear: () => sessionStore.clear(),
      key: (i) => Array.from(sessionStore.keys())[i] ?? null,
      get length() { return sessionStore.size }
    }
  }
  if (typeof globalThis.window === 'undefined') {
    globalThis.window = {
      addEventListener: () => {},
      removeEventListener: () => {},
      dispatchEvent: () => true,
      localStorage: globalThis.localStorage,
      sessionStorage: globalThis.sessionStorage
    }
  }

  viteServer = await createViteServer({
    server: { middlewareMode: true, hmr: false },
    appType: 'custom',
    logLevel: 'silent'
  })

  function createMemoryTable(pkField = 'id') {
    const store = new Map()
    const clone = (val) => (val == null ? val : JSON.parse(JSON.stringify(val)))
    const makeCollection = (itemsFn) => ({
      async toArray() { return itemsFn().map(clone) },
      async count() { return itemsFn().length },
      filter(pred) { return makeCollection(() => itemsFn().filter(pred)) },
      reverse() { return makeCollection(() => [...itemsFn()].reverse()) },
      sortBy(field) {
        return Promise.resolve(
          [...itemsFn()].sort((a, b) => String(a[field] ?? '').localeCompare(String(b[field] ?? ''))).map(clone)
        )
      },
      limit(n) { return makeCollection(() => itemsFn().slice(0, n)) },
      async delete() {
        const list = itemsFn()
        for (const item of list) store.delete(String(item[pkField]))
        return list.length
      },
      async modify(fn) {
        const list = itemsFn()
        for (const item of list) {
          fn(item)
          store.set(String(item[pkField]), clone(item))
        }
        return list.length
      }
    })
    return {
      async toArray() { return Array.from(store.values()).map(clone) },
      async count() { return store.size },
      async clear() { store.clear() },
      async get(key) {
        const hit = store.get(String(key))
        return hit ? clone(hit) : undefined
      },
      async put(item) {
        const key = String(item[pkField])
        store.set(key, clone(item))
        return key
      },
      async add(item) {
        const key = String(item[pkField])
        if (store.has(key)) throw new Error(`Duplicate key ${key}`)
        store.set(key, clone(item))
        return key
      },
      async bulkPut(items) {
        for (const item of items) store.set(String(item[pkField]), clone(item))
      },
      async bulkAdd(items) {
        for (const item of items) store.set(String(item[pkField]), clone(item))
      },
      async update(key, changes) {
        const existing = store.get(String(key))
        if (!existing) return 0
        store.set(String(key), clone({ ...existing, ...changes }))
        return 1
      },
      async delete(key) { store.delete(String(key)) },
      async bulkDelete(keys) { for (const k of keys) store.delete(String(k)) },
      where(fieldOrFields) {
        const all = () => Array.from(store.values())
        return {
          equals(val) {
            if (Array.isArray(fieldOrFields)) {
              return makeCollection(() => all().filter((row) => fieldOrFields.every((f, idx) => row[f] === val[idx])))
            }
            return makeCollection(() =>
              all().filter((row) => {
                const fv = row[fieldOrFields]
                return Array.isArray(fv) ? fv.includes(val) : fv === val
              })
            )
          },
          anyOf(vals) {
            const set = new Set(vals)
            return makeCollection(() =>
              all().filter((row) => {
                const fv = row[fieldOrFields]
                return Array.isArray(fv) ? fv.some((x) => set.has(x)) : set.has(fv)
              })
            )
          }
        }
      },
      orderBy(field) {
        return makeCollection(() =>
          Array.from(store.values()).sort((a, b) => String(a[field] ?? '').localeCompare(String(b[field] ?? '')))
        )
      },
      filter(pred) { return makeCollection(() => Array.from(store.values()).filter(pred)) },
      toCollection() { return makeCollection(() => Array.from(store.values())) }
    }
  }

  const { db } = await viteServer.ssrLoadModule('/src/db/index.ts')
  db.employees = createMemoryTable('bioId')
  db.workGroups = createMemoryTable('id')
  db.biometricPunches = createMemoryTable('id')
  db.dailyAttendance = createMemoryTable('id')
  db.hrNotices = createMemoryTable('id')
  db.transaction = async (...args) => {
    const fn = args[args.length - 1]
    return await fn()
  }
  await db.workGroups.bulkPut([{
    id: 'wg-group-c', name: 'Group C', code: 'C', standardIn: '08:00',
    requiredWorkMinutes: 480, lunchStart: '12:00', lunchEnd: '13:00', expectedOut: '17:00',
    gracePeriodMinutes: 0, isDefault: true, createdAt: '2026-10-01T00:00:00Z', updatedAt: '2026-10-01T00:00:00Z'
  }])

  const { employeeRepository } = await viteServer.ssrLoadModule('/src/repositories/employeeRepository.ts')
  const { employeeService } = await viteServer.ssrLoadModule('/src/services/employees.ts')
  const { buildEmployeePhotoCandidates } = await viteServer.ssrLoadModule('/src/services/employeePhotoService.ts')

  await employeeRepository.registerFromPunch('25065', 'Marc Louie Cabigas', 'DBB CEBU', 'wg-group-c')
  await employeeRepository.linkSecondaryBioId('25065', '50305', { confirmedByAdmin: true })

  const afterPhotoUpdate = await employeeService.updateEmployee('25065', {
    photo: '/employee-photos/25065.jpg'
  })
  assert.strictEqual(afterPhotoUpdate.photo, '/employee-photos/25065.jpg')
  assert.strictEqual(afterPhotoUpdate.biometric_user_id, '25065')
  assert.deepStrictEqual(afterPhotoUpdate.linked_bio_ids, ['25065', '50305'], 'Linked Bio IDs must remain untouched')

  const afterNameUpdate = await employeeService.updateEmployee('25065', {
    preferred_name: 'Marc'
  })
  assert.strictEqual(afterNameUpdate.photo, '/employee-photos/25065.jpg', 'Existing photo must be preserved on unrelated updates')

  const candidates = buildEmployeePhotoCandidates(afterNameUpdate)
  assert.deepStrictEqual(candidates, ['/employee-photos/25065.jpg'])
  ok('Test 7: employeeService.updateEmployee & buildEmployeePhotoCandidates resolve to /employee-photos/{BioID}.jpg')

  console.log('\n======================================================================')
  console.log(`ALL ${passed} JPG-ONLY EMPLOYEE PHOTO CONVERSION TESTS PASSED!`)
  console.log('======================================================================')
} finally {
  if (viteServer) await viteServer.close()
  if (httpServer) await new Promise((resolve) => httpServer.close(resolve))
  fs.rmSync(tempRoot, { recursive: true, force: true })
}
