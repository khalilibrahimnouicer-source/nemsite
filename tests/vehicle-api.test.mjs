import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import bcrypt from 'bcryptjs'

test('API: login, archive, hidden listing, restore, guarded permanent deletion and persistence', async t => {
  // Never connect tests to the real Vercel Blob store or bundled production data.
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'ynr-archives-test-'))
  const file = path.join(dir, 'store.json')
  const initial = {
    settings: { brand: 'YNR API TEST' },
    vehicles: [
      { id: 'test-a', name: 'Véhicule test A', active: true, featured: true, price: 240, pricing: { weekday24h: 240 }, description: 'Description à conserver', photos: ['https://example.test/photo-a.jpg'], featuredPhoto: 'https://example.test/photo-a.jpg', createdAt: '2026-01-01T00:00:00.000Z' },
      { id: 'test-b', name: 'Véhicule test B', active: true, featured: false, price: 390, photos: ['https://example.test/photo-b.jpg'] }
    ],
    requests: [{ id: 'fake-request', name: 'Private test record' }],
    blocked: []
  }
  await fs.writeFile(file, JSON.stringify(initial))
  process.env.NODE_ENV = 'test'
  process.env.YNR_TEST_DATA_FILE = file
  process.env.OWNER_EMAIL = 'admin@test.invalid'
  process.env.OWNER_PASSWORD_HASH = bcrypt.hashSync('temporary-local-test-password', 4)
  process.env.SESSION_SECRET = 'test-only-session-secret-never-used-in-production'
  for (const name of ['VERCEL', 'BLOB_READ_WRITE_TOKEN', 'VERCEL_BLOB_READ_WRITE_TOKEN', 'BLOB_TOKEN', 'VERCEL_BLOB_TOKEN']) process.env[name] = ''

  const { default: app } = await import('../server.mjs')
  const server = app.listen(0, '127.0.0.1')
  await new Promise(resolve => server.once('listening', resolve))
  t.after(async () => {
    await new Promise((resolve, reject) => server.close(error => error ? reject(error) : resolve()))
    await fs.rm(dir, { recursive: true, force: true })
  })
  const base = 'http://127.0.0.1:' + server.address().port
  let cookie = ''
  async function req(endpoint, options = {}) {
    const response = await fetch(base + endpoint, { ...options, headers: { ...(cookie ? { Cookie: cookie } : {}), 'Content-Type': 'application/json', ...(options.headers || {}) } })
    const raw = await response.text()
    let body
    try { body = raw ? JSON.parse(raw) : null } catch { body = raw }
    return { status: response.status, body, headers: response.headers }
  }

  // All admin mutations require a valid administrator session.
  let response = await req('/api/admin')
  assert.equal(response.status, 401)
  response = await req('/api/vehicles/test-a', { method: 'DELETE' })
  assert.equal(response.status, 401)

  response = await req('/api/auth/login', { method: 'POST', body: JSON.stringify({ email: 'admin@test.invalid', password: 'temporary-local-test-password' }) })
  assert.equal(response.status, 200)
  cookie = response.headers.get('set-cookie')?.split(';')[0] || ''
  assert.match(cookie, /^ynr_session=/)

  response = await req('/api/vehicles/test-a', { method: 'DELETE' })
  assert.equal(response.status, 200)
  assert.equal(response.body.archived, true)
  response = await req('/api/public')
  assert.deepEqual(response.body.vehicles.map(v => v.id), ['test-b'])
  response = await req('/api/vehicles/test-a')
  assert.equal(response.status, 404)
  response = await req('/api/vehicles')
  assert.equal(response.status, 200)
  assert.equal(Object.hasOwn(response.body, 'requests'), false)
  assert.deepEqual(response.body.vehicles.map(v => v.id), ['test-b'])

  response = await req('/api/admin')
  assert.equal(response.status, 200)
  const archived = response.body.vehicles.find(v => v.id === 'test-a')
  assert.ok(archived.archivedAt)
  assert.equal(archived.active, false)
  assert.equal(archived.price, 240)
  assert.equal(archived.description, 'Description à conserver')
  assert.deepEqual(archived.photos, ['https://example.test/photo-a.jpg'])
  assert.equal(response.body.vehicles.find(v => v.id === 'test-b').active, true)

  response = await req('/api/vehicles/test-a', { method: 'DELETE' })
  assert.equal(response.status, 409)
  response = await req('/api/vehicles', { method: 'POST', body: JSON.stringify({ id: 'test-a', name: 'Should not overwrite archived data' }) })
  assert.equal(response.status, 409)

  response = await req('/api/vehicles/test-a/restore', { method: 'PATCH' })
  assert.equal(response.status, 200)
  assert.equal(response.body.restored, true)
  response = await req('/api/public')
  assert.deepEqual(new Set(response.body.vehicles.map(v => v.id)), new Set(['test-a', 'test-b']))
  response = await req('/api/admin')
  assert.equal(response.body.vehicles.find(v => v.id === 'test-a').archivedAt, undefined)
  assert.deepEqual(response.body.vehicles.find(v => v.id === 'test-a').photos, ['https://example.test/photo-a.jpg'])

  response = await req('/api/vehicles/test-a/permanent', { method: 'DELETE', body: JSON.stringify({ confirmation: 'SUPPRIMER' }) })
  assert.equal(response.status, 409)
  response = await req('/api/vehicles/test-a', { method: 'DELETE' })
  assert.equal(response.status, 200)
  response = await req('/api/vehicles/test-a/permanent', { method: 'DELETE', body: JSON.stringify({ confirmation: 'no' }) })
  assert.equal(response.status, 400)
  response = await req('/api/vehicles/test-a/permanent', { method: 'DELETE', body: JSON.stringify({ confirmation: 'SUPPRIMER' }) })
  assert.equal(response.status, 200)
  assert.equal(response.body.permanentlyDeleted, true)
  response = await req('/api/admin')
  assert.deepEqual(response.body.vehicles.map(v => v.id), ['test-b'])
  const disk = JSON.parse(await fs.readFile(file, 'utf8'))
  assert.deepEqual(disk.vehicles.map(v => v.id), ['test-b'])
  assert.equal(disk.vehicles[0].photos[0], 'https://example.test/photo-b.jpg')
})
