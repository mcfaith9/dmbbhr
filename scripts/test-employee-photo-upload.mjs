/**
 * DMBBHR Employee Profile Photo Upload & Storage Verification Suite
 *
 * Verifies:
 * 1. server/photoStorage.cjs auto-creates `<root>/public/employee-photos/`
 * 2. Sanitizes Bio IDs and blocks path traversal tokens (`..`, `/`, `\`, null bytes)
 * 3. Validates JPG, JPEG, PNG, WebP magic bytes + MIME/extension allowlists and 5 MB limit
 * 4. Overwrites existing photo & cleans up stale extensions for the same Bio ID (zero duplicates)
 * 5. Never exposes OS/filesystem paths in HTTP responses
 * 6. HTTP upload route works via Node.js HTTP server (`handleEmployeePhotoUploadRequest`)
 * 7. `employeeService.updateEmployee` persists `photo` cleanly without affecting existing data
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
const photoStorage = require('../server/photoStorage.cjs')

const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'dmbbhr-photo-test-'))

// Minimal valid magic-byte image buffers
const VALID_JPG = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00, 0x01])
const VALID_PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d])
const VALID_WEBP = Buffer.concat([
  Buffer.from('RIFF', 'ascii'),
  Buffer.from([0x24, 0x00, 0x00, 0x00]),
  Buffer.from('WEBP', 'ascii'),
  Buffer.from('VP8 ', 'ascii')
])
const FAKE_HTML_DISGUISED = Buffer.from('<html><script>alert(1)</script></html>', 'utf8')

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
  // 1. Directory auto-creation + JPG save using Bio ID filename
  const photosDir = path.join(tempRoot, 'public', 'employee-photos')
  assert.strictEqual(fs.existsSync(photosDir), false, 'employee-photos dir should not exist before first upload')

  const resJpg = photoStorage.saveEmployeePhoto({
    projectRoot: tempRoot,
    bioId: '25065',
    buffer: VALID_JPG,
    mimeType: 'image/jpeg',
    fileName: 'reynald_headshot.jpeg'
  })
  assert.strictEqual(fs.existsSync(photosDir), true, 'employee-photos dir must be created automatically')
  assert.strictEqual(resJpg.filename, '25065.jpg')
  assert.strictEqual(resJpg.photoPath, '/employee-photos/25065.jpg')
  assert.strictEqual(fs.existsSync(path.join(photosDir, '25065.jpg')), true)
  ok('Test 1: Auto-created public/employee-photos/ and saved 25065.jpg')

  // 2. Replace existing JPG with PNG -> overwrites cleanly with zero duplicate files for 25065
  const resPng = photoStorage.saveEmployeePhoto({
    projectRoot: tempRoot,
    bioId: '25065',
    buffer: VALID_PNG,
    mimeType: 'image/png',
    fileName: 'portrait.png'
  })
  assert.strictEqual(resPng.filename, '25065.png')
  assert.strictEqual(resPng.photoPath, '/employee-photos/25065.png')
  assert.strictEqual(fs.existsSync(path.join(photosDir, '25065.png')), true)
  assert.strictEqual(fs.existsSync(path.join(photosDir, '25065.jpg')), false, 'Old 25065.jpg must be removed on replacement')
  ok('Test 2: Replacing 25065.jpg with 25065.png removed previous extension without duplicates')

  // 3. Replace with WebP
  const resWebp = photoStorage.saveEmployeePhoto({
    projectRoot: tempRoot,
    bioId: '25065',
    buffer: VALID_WEBP,
    mimeType: 'image/webp',
    fileName: 'avatar.webp'
  })
  assert.strictEqual(resWebp.filename, '25065.webp')
  assert.strictEqual(resWebp.photoPath, '/employee-photos/25065.webp')
  assert.strictEqual(fs.existsSync(path.join(photosDir, '25065.png')), false, 'Old 25065.png must be removed when replaced by WebP')
  assert.strictEqual(fs.existsSync(path.join(photosDir, '25065.webp')), true)
  ok('Test 3: WebP upload verified and older extension cleaned up')

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

  // 5. File type & size validations
  assert.throws(
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
  assert.throws(
    () =>
      photoStorage.saveEmployeePhoto({
        projectRoot: tempRoot,
        bioId: '25065',
        buffer: VALID_JPG,
        mimeType: 'image/svg+xml',
        fileName: 'bad.svg'
      }),
    (err) => err instanceof photoStorage.PhotoValidationError && err.statusCode === 415
  )
  const oversized = Buffer.alloc(photoStorage.MAX_PHOTO_BYTES + 1, 0xff)
  oversized[0] = 0xff
  oversized[1] = 0xd8
  oversized[2] = 0xff
  assert.throws(
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
  ok('Test 5: Magic-byte verification, extension/MIME checks, and 5 MB limit enforced')

  // 6. Node.js HTTP server route test (ensures no filesystem paths leaked in JSON)
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
    fileName: '50305.jpg',
    mimeType: 'image/jpeg',
    dataBase64: `data:image/jpeg;base64,${VALID_JPG.toString('base64')}`
  })
  assert.strictEqual(httpOk.status, 200)
  assert.strictEqual(httpOk.json.photoPath, '/employee-photos/50305.jpg')
  assert.strictEqual(httpOk.json.filename, '50305.jpg')
  assert.strictEqual(JSON.stringify(httpOk.json).includes(tempRoot), false, 'Response must never expose OS filesystem paths')
  assert.strictEqual(fs.existsSync(path.join(photosDir, '50305.jpg')), true)

  const httpBadType = await runHttpUpload(baseUrl, {
    bioId: '50305',
    fileName: 'payload.jpg',
    mimeType: 'image/jpeg',
    dataBase64: FAKE_HTML_DISGUISED.toString('base64')
  })
  assert.strictEqual(httpBadType.status, 415)
  ok('Test 6: HTTP POST /api/employee-photos uploads cleanly and never exposes filesystem paths')

  // 7. Verify employeeService.updateEmployee persists photo without altering unrelated employee fields
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
    photo: '/employee-photos/25065.png'
  })
  assert.strictEqual(afterPhotoUpdate.photo, '/employee-photos/25065.png')
  assert.strictEqual(afterPhotoUpdate.biometric_user_id, '25065')
  assert.deepStrictEqual(afterPhotoUpdate.linked_bio_ids, ['25065', '50305'], 'Linked Bio IDs must remain untouched')

  // Updating another profile field without passing photo preserves existing photo
  const afterNameUpdate = await employeeService.updateEmployee('25065', {
    preferred_name: 'Marc'
  })
  assert.strictEqual(afterNameUpdate.photo, '/employee-photos/25065.png', 'Existing photo must be preserved on unrelated updates')

  const candidates = buildEmployeePhotoCandidates(afterNameUpdate)
  assert.strictEqual(candidates[0], '/employee-photos/25065.png')
  assert.ok(candidates.includes('/employee-photos/25065.jpg'))
  assert.ok(candidates.includes('/employee-photos/25065.webp'))
  ok('Test 7: employeeService.updateEmployee persists & preserves photo path without altering Bio IDs or profile fields')

  console.log('\n======================================================================')
  console.log(`ALL ${passed} EMPLOYEE PHOTO UPLOAD TESTS PASSED SUCCESSFULLY!`)
  console.log('======================================================================')
} finally {
  if (viteServer) await viteServer.close()
  if (httpServer) await new Promise((resolve) => httpServer.close(resolve))
  fs.rmSync(tempRoot, { recursive: true, force: true })
}
