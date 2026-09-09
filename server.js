import express from 'express'
import crypto from 'node:crypto'
import fs from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import bcrypt from 'bcryptjs'
import { put, del, get } from '@vercel/blob'

const root = path.dirname(fileURLToPath(import.meta.url))
const app = express()
const isProd = Boolean(process.env.VERCEL || process.env.NODE_ENV === 'production')
const PORT = Number(process.env.PORT || 8787)
const OWNER_EMAIL = String(process.env.OWNER_EMAIL || 'ynr.location@gmail.com').trim().toLowerCase()
const OWNER_PASSWORD_HASH = String(process.env.OWNER_PASSWORD_HASH || '').trim()
const SESSION_SECRET = String(process.env.SESSION_SECRET || '').trim()
const DATA_FILE = path.join(root, 'data', 'store.json')
const STORE_PATH = 'data/store.json'
const BLOB_STORE_ID = String(process.env.BLOB_STORE_ID || '').trim()
const BLOB_OIDC_TOKEN = String(process.env.VERCEL_OIDC_TOKEN || '').trim()
const BLOB_STATIC_TOKEN = String(process.env.BLOB_READ_WRITE_TOKEN || '').trim()
const RESEND_API_KEY = String(process.env.RESEND_API_KEY || '').trim()
const RESERVATION_NOTIFY_EMAIL = String(process.env.RESERVATION_NOTIFY_EMAIL || OWNER_EMAIL).trim().toLowerCase()
const RESEND_FROM = String(process.env.RESEND_FROM || 'YNR Luxury <onboarding@resend.dev>').trim()
const blobEnabled = Boolean(BLOB_STATIC_TOKEN || BLOB_STORE_ID)
const PHONE = '07 46 38 99 31'
const WHATSAPP = 'https://wa.me/33746389931'
const COMMUNITY = 'https://chat.whatsapp.com/DDUWaSzXm4DBuA8co2I0bE'

const seed = {
  settings: {
    brand: 'YNR Luxury', tagline: 'Location de véhicules premium.', phone: PHONE,
    email: 'ynr.location@gmail.com', whatsapp: WHATSAPP,
    whatsappChannel: COMMUNITY, instagram: 'https://instagram.com/ynr_location'
  },
  vehicles: [{
    id: 'demo-bmw-m3', name: 'BMW M3 Competition', category: 'Berline sportive', price: 490,
    deposit: 3000, description: 'Une sportive précise et spectaculaire, pensée pour les déplacements professionnels comme les escapades.',
    photos: ['https://images.unsplash.com/photo-1555215695-3004980ad54e?auto=format&fit=crop&w=1800&q=85'],
    active: true, createdAt: new Date().toISOString()
  }],
  requests: [], blocked: []
}

let memory = structuredClone(seed)
const loginAttempts = new Map()
const requestAttempts = new Map()

function clean(v, max = 1000) { return typeof v === 'string' ? v.trim().slice(0, max) : '' }
function normalizeStore(value) {
  const source = value && typeof value === 'object' ? value : {}
  return {
    settings: source.settings && typeof source.settings === 'object' && !Array.isArray(source.settings) ? { ...seed.settings, ...source.settings } : structuredClone(seed.settings),
    vehicles: Array.isArray(source.vehicles) ? source.vehicles.filter(Boolean) : [],
    requests: Array.isArray(source.requests) ? source.requests.filter(Boolean) : [],
    blocked: Array.isArray(source.blocked) ? source.blocked.filter(Boolean) : []
  }
}
function sign(exp) { return `${exp}.${crypto.createHmac('sha256', SESSION_SECRET).update(String(exp)).digest('hex')}` }
function validSession(t) {
  if (!SESSION_SECRET) return false
  const [exp, sig] = String(t || '').split('.')
  if (!exp || !sig || Number(exp) <= Date.now()) return false
  const expected = crypto.createHmac('sha256', SESSION_SECRET).update(exp).digest('hex')
  return sig.length === expected.length && crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected))
}
function getCookie(req) { return req.headers.cookie?.match(/(?:^|;\s*)ynr_session=([^;]+)/)?.[1] || '' }
function auth(req, res, next) {
  if (!validSession(getCookie(req))) return res.status(401).json({ message: 'Authentification requise' })
  next()
}
function blobOptions(access = 'private', extra = {}) {
  const options = { access, ...extra }
  if (BLOB_STATIC_TOKEN) options.token = BLOB_STATIC_TOKEN
  else if (BLOB_STORE_ID) options.storeId = BLOB_STORE_ID
  if (BLOB_OIDC_TOKEN) options.oidcToken = BLOB_OIDC_TOKEN
  return options
}
function mediaUrl(pathname) { return `/api/media?path=${encodeURIComponent(pathname)}` }
function pathnameFromPhoto(value) {
  const raw = clean(value, 200000)
  if (!raw) return null
  try {
    if (raw.startsWith('/api/media?')) return new URL(`https://ynr.local${raw}`).searchParams.get('path')
    if (raw.startsWith('https://') || raw.startsWith('http://')) {
      const u = new URL(raw)
      if (u.hostname.endsWith('.private.blob.vercel-storage.com')) return decodeURIComponent(u.pathname.replace(/^\//, ''))
    }
  } catch {}
  if (raw.startsWith('vehicles/')) return raw
  return null
}
function publicPhotos(photos) {
  return (Array.isArray(photos) ? photos : []).map(photo => {
    const pathname = pathnameFromPhoto(photo)
    return pathname ? mediaUrl(pathname) : photo
  })
}
function publicStore(store) {
  return { ...store, vehicles: store.vehicles.map(v => ({ ...v, photos: publicPhotos(v.photos) })) }
}
function isBlobNotFound(error) { return error?.name === 'BlobNotFoundError' || /not found/i.test(String(error?.message || '')) }

async function readStore() {
  if (blobEnabled) {
    try {
      const result = await get(STORE_PATH, blobOptions('private', { useCache: false }))
      if (result?.stream) {
        const parsed = JSON.parse(await new Response(result.stream).text())
        const normalized = normalizeStore(parsed)
        memory = structuredClone(normalized)
        return normalized
      }
      throw new Error('Blob returned no stream')
    } catch (error) {
      if (isBlobNotFound(error)) {
        const seeded = structuredClone(seed)
        await put(STORE_PATH, JSON.stringify(seeded, null, 2), blobOptions('private', {
          allowOverwrite: false, addRandomSuffix: false, contentType: 'application/json'
        }))
        memory = structuredClone(seeded)
        return seeded
      }
      console.error('[YNR] Blob read failed:', error?.message || error)
      throw new Error('Vercel Blob est configuré mais la lecture du stockage a échoué.')
    }
  }
  try {
    const normalized = normalizeStore(JSON.parse(await fs.readFile(DATA_FILE, 'utf8')))
    memory = structuredClone(normalized)
    return normalized
  } catch {
    const normalized = normalizeStore(memory)
    memory = structuredClone(normalized)
    return normalized
  }
}

async function writeStore(store) {
  const normalized = normalizeStore(store)
  memory = structuredClone(normalized)
  const serialized = JSON.stringify(normalized, null, 2)
  if (blobEnabled) {
    try {
      await put(STORE_PATH, serialized, blobOptions('private', {
        allowOverwrite: true, addRandomSuffix: false, contentType: 'application/json'
      }))
      return
    } catch (error) {
      console.error('[YNR] Blob write failed:', error?.message || error)
      throw new Error('Impossible d’enregistrer les données dans Vercel Blob.')
    }
  }
  if (!isProd) {
    await fs.mkdir(path.dirname(DATA_FILE), { recursive: true })
    await fs.writeFile(DATA_FILE, serialized)
  }
}

app.disable('x-powered-by')
app.use((_, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff')
  res.setHeader('X-Frame-Options', 'DENY')
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin')
  res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()')
  res.setHeader('Cross-Origin-Opener-Policy', 'same-origin')
  if (isProd) res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains')
  next()
})
app.use(express.json({ limit: '12mb', strict: true }))
app.use(express.static(path.join(root, 'dist')))

app.get('/api/health', async (_, res) => {
  if (!blobEnabled) return res.json({ ok: true, storage: isProd ? 'local-fallback' : 'local', blobConfigured: false })
  try {
    await readStore()
    res.json({ ok: true, storage: 'blob', blobConfigured: true, oidc: Boolean(BLOB_STORE_ID && !BLOB_STATIC_TOKEN) })
  } catch (error) {
    console.error('[YNR] health:', error?.message || error)
    res.status(503).json({ ok: false, storage: 'blob', blobConfigured: true, message: 'Vercel Blob est connecté mais inaccessible depuis la Function.' })
  }
})

app.get('/api/public', async (req, res) => {
  try {
    res.setHeader('Cache-Control', 'no-store, max-age=0')
    const s = await readStore()
    let vehicles = s.vehicles.filter(v => v.active)
    const sort = String(req.query.sort || 'recent')
    const dir = String(req.query.dir || 'asc') === 'desc' ? -1 : 1
    if (sort === 'price') vehicles.sort((a, b) => (Number(a.price || 0) - Number(b.price || 0)) * dir)
    else if (sort === 'name') vehicles.sort((a, b) => String(a.name).localeCompare(String(b.name), 'fr', { sensitivity: 'base' }) * dir)
    else vehicles.sort((a, b) => new Date(b.createdAt || b.updatedAt || 0) - new Date(a.createdAt || a.updatedAt || 0))
    res.json({ settings: s.settings, vehicles: vehicles.map(v => ({ ...v, photos: publicPhotos(v.photos) })), blocked: s.blocked })
  } catch (error) {
    console.error('[YNR] /api/public:', error?.message || error)
    res.status(503).json({ message: 'Le catalogue est temporairement indisponible.' })
  }
})

app.get('/api/media', async (req, res) => {
  const pathname = clean(req.query.path, 500)
  if (!pathname || !pathname.startsWith('vehicles/') || pathname.includes('..') || pathname.includes('//')) return res.status(400).send('Invalid media path')
  try {
    const result = await get(pathname, blobOptions('private', { useCache: false }))
    if (!result?.stream) return res.sendStatus(404)
    res.setHeader('Cache-Control', 'public, max-age=300, s-maxage=3600')
    res.setHeader('Content-Type', result.blob?.contentType || 'application/octet-stream')
    result.stream.pipe(res)
  } catch (error) {
    if (isBlobNotFound(error)) return res.sendStatus(404)
    console.error('[YNR] media read failed:', error?.message || error)
    res.sendStatus(503)
  }
})

app.post('/api/auth/login', async (req, res) => {
  if (!SESSION_SECRET || !OWNER_PASSWORD_HASH) return res.status(503).json({ message: 'Authentification administrateur non configurée' })
  const email = clean(req.body?.email, 180).toLowerCase(), pw = String(req.body?.password || '')
  const ip = String(req.headers['x-forwarded-for'] || req.socket.remoteAddress || '').split(',')[0]
  const key = `${ip}:${email}`
  const a = loginAttempts.get(key) || { count: 0, at: Date.now() }
  if (Date.now() - a.at > 900000) { a.count = 0; a.at = Date.now() }
  if (a.count >= 8) return res.status(429).json({ message: 'Trop de tentatives. Réessayez plus tard.' })
  const ok = email === OWNER_EMAIL && await bcrypt.compare(pw, OWNER_PASSWORD_HASH)
  if (!ok) { a.count++; loginAttempts.set(key, a); return res.status(401).json({ message: 'Identifiants invalides' }) }
  loginAttempts.delete(key)
  const secure = isProd ? ' Secure;' : ''
  res.setHeader('Set-Cookie', `ynr_session=${sign(Date.now() + 86400000)}; HttpOnly; SameSite=Strict;${secure} Path=/; Max-Age=86400`)
  res.json({ ok: true })
})
app.post('/api/auth/logout', auth, (_, res) => {
  const secure = isProd ? ' Secure;' : ''
  res.setHeader('Set-Cookie', `ynr_session=; HttpOnly; SameSite=Strict;${secure} Path=/; Max-Age=0`)
  res.status(204).end()
})
app.get('/api/auth/session', auth, (_, res) => res.json({ ok: true }))
app.get('/api/admin', auth, async (_, res) => { try { res.setHeader('Cache-Control', 'no-store'); res.json(await readStore()) } catch (e) { console.error('[YNR] /api/admin:', e?.message || e); res.status(503).json({ message: 'Administration temporairement indisponible.' }) } })

app.post('/api/uploads', auth, async (req, res) => {
  const data = String(req.body?.data || '')
  const match = data.match(/^data:(image\/(?:jpeg|png|webp));base64,([A-Za-z0-9+/=]+)$/)
  if (!match) return res.status(400).json({ message: 'Image JPEG, PNG ou WEBP requise' })
  const raw = Buffer.from(match[2], 'base64')
  if (raw.length < 100 || raw.length > 8 * 1024 * 1024) return res.status(413).json({ message: 'Image invalide ou trop volumineuse (8 Mo maximum)' })
  if (!blobEnabled) return res.status(503).json({ message: 'Vercel Blob n’est pas configuré.' })
  try {
    const ext = match[1].split('/')[1].replace('jpeg', 'jpg')
    const pathname = `vehicles/${new Date().toISOString().slice(0, 10)}/${crypto.randomUUID()}.${ext}`
    const blob = await put(pathname, raw, blobOptions('private', { addRandomSuffix: false, contentType: match[1] }))
    res.status(201).json({ pathname: blob.pathname, url: mediaUrl(blob.pathname), size: raw.length, type: match[1] })
  } catch (error) {
    console.error('[YNR] Blob upload failed:', error?.message || error)
    res.status(503).json({ message: 'Le stockage des photos est indisponible.' })
  }
})

app.delete('/api/uploads', auth, async (req, res) => {
  const pathname = pathnameFromPhoto(clean(req.body?.url, 200000))
  if (!pathname) return res.status(400).json({ message: 'Photo YNR introuvable' })
  try { if (blobEnabled) await del(pathname, blobOptions('private')); res.sendStatus(204) }
  catch (error) { console.error('[YNR] Blob delete failed:', error?.message || error); res.status(503).json({ message: 'Impossible de supprimer la photo' }) }
})

async function notifyReservation(request) {
  if (!RESEND_API_KEY || !RESERVATION_NOTIFY_EMAIL) return { sent: false, reason: 'email-not-configured' }
  const escapeHtml = value => String(value ?? '').replace(/[&<>\"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '\"': '&quot;', "'": '&#39;' }[char]))
  const subject = `Nouvelle demande de réservation — ${request.vehicle}`
  const html = `<h2>Nouvelle demande de réservation</h2><p><strong>Véhicule :</strong> ${escapeHtml(request.vehicle)}</p><p><strong>Client :</strong> ${escapeHtml(request.name)}<br><strong>Email :</strong> ${escapeHtml(request.email)}<br><strong>Téléphone :</strong> ${escapeHtml(request.phone)}</p><p><strong>Période :</strong> ${escapeHtml(request.start)} → ${escapeHtml(request.end)}</p><p><strong>Message :</strong><br>${escapeHtml(request.message || 'Aucun message')}</p>`
  try {
    const response = await fetch('https://api.resend.com/emails', { method: 'POST', headers: { Authorization: `Bearer ${RESEND_API_KEY}`, 'Content-Type': 'application/json', 'Idempotency-Key': `reservation/${request.id}` }, body: JSON.stringify({ from: RESEND_FROM, to: [RESERVATION_NOTIFY_EMAIL], subject, html }) })
    if (!response.ok) throw new Error(`Resend ${response.status}`)
    return { sent: true }
  } catch (error) {
    console.error('[YNR] reservation email failed:', error?.message || error)
    return { sent: false, reason: 'email-failed' }
  }
}

app.post('/api/requests', async (req, res) => {
  const ip = String(req.headers['x-forwarded-for'] || req.socket.remoteAddress || '').split(',')[0].slice(0, 100)
  const now = Date.now(), recent = (requestAttempts.get(ip) || []).filter(x => now - x < 900000)
  if (recent.length >= 8) return res.status(429).json({ message: 'Trop de demandes. Réessayez plus tard.' })
  recent.push(now); requestAttempts.set(ip, recent)
  const b = req.body || {}
  if (clean(b.website, 50)) return res.status(400).json({ message: 'Demande invalide' })
  const name = clean(b.name, 100), email = clean(b.email, 254).toLowerCase(), phone = clean(b.phone, 40), vehicleId = clean(b.vehicleId, 100), vehicle = clean(b.vehicle, 150), start = clean(b.start, 20), end = clean(b.end, 20), message = clean(b.message, 2000)
  if (!name || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || !/^[+0-9 ()\-.]{7,40}$/.test(phone) || !vehicle || !start || !end || Number.isNaN(Date.parse(start)) || Number.isNaN(Date.parse(end)) || Date.parse(end) < Date.parse(start)) return res.status(400).json({ message: 'Vérifiez les informations saisies.' })
  try {
    const s = await readStore()
    const reservation = { id: crypto.randomUUID(), name, email, phone, vehicleId, vehicle, start, end, message, status: 'nouvelle', createdAt: new Date().toISOString() }
    s.requests.unshift(reservation)
    await writeStore(s)
    const notification = await notifyReservation(reservation)
    res.json({ ok: true, notification: notification.sent ? 'sent' : 'not-configured' })
  } catch (error) { console.error('[YNR] request:', error?.message || error); res.status(503).json({ message: 'Impossible d’enregistrer la demande.' }) }
})

app.post('/api/vehicles', auth, async (req, res) => {
  const b = req.body || {}
  const v = { id: clean(b.id, 100) || crypto.randomUUID(), name: clean(b.name, 120), category: clean(b.category, 100) || 'Véhicule premium', price: Number(b.price) || 0, deposit: Number(b.deposit) || 0, description: clean(b.description, 2000), photos: Array.isArray(b.photos) ? [...new Set(b.photos.map(x => clean(x, 200000)).filter(Boolean))].slice(0, 8) : [], active: b.active !== false, createdAt: b.createdAt || new Date().toISOString(), updatedAt: new Date().toISOString() }
  if (!v.name) return res.status(400).json({ message: 'Nom du véhicule requis.' })
  try {
    const s = await readStore(); const i = s.vehicles.findIndex(x => x.id === v.id)
    if (i >= 0) s.vehicles[i] = { ...s.vehicles[i], ...v }
    else s.vehicles.unshift(v)
    await writeStore(s)
    res.status(201).json({ ...v, photos: publicPhotos(v.photos) })
  } catch (error) { console.error('[YNR] vehicle save:', error?.message || error); res.status(503).json({ message: 'Impossible d’enregistrer le véhicule.' }) }
})
app.patch('/api/vehicles/:id', auth, async (req, res) => {
  try {
    const s = await readStore(), v = s.vehicles.find(x => x.id === req.params.id)
    if (!v) return res.status(404).json({ message: 'Véhicule introuvable' })
    const oldPhotos = Array.isArray(v.photos) ? v.photos : []
    Object.assign(v, { name: clean(req.body.name, 120) || v.name, category: clean(req.body.category, 100) || v.category, price: Number(req.body.price ?? v.price) || 0, deposit: Number(req.body.deposit ?? v.deposit) || 0, description: clean(req.body.description, 2000), photos: Array.isArray(req.body.photos) ? req.body.photos.map(x => clean(x, 200000)).filter(Boolean).slice(0, 8) : oldPhotos, active: req.body.active !== undefined ? Boolean(req.body.active) : v.active, updatedAt: new Date().toISOString() })
    const removed = oldPhotos.map(pathnameFromPhoto).filter(Boolean).filter(p => !v.photos.map(pathnameFromPhoto).includes(p))
    if (blobEnabled) await Promise.all(removed.map(p => del(p, blobOptions('private')).catch(() => null)))
    await writeStore(s)
    res.json({ ...v, photos: publicPhotos(v.photos) })
  } catch (error) { console.error('[YNR] vehicle patch:', error?.message || error); res.status(503).json({ message: 'Impossible de modifier le véhicule.' }) }
})
app.delete('/api/vehicles/:id', auth, async (req, res) => {
  try {
    const s = await readStore(), vehicle = s.vehicles.find(x => x.id === req.params.id)
    if (!vehicle) return res.sendStatus(404)
    if (blobEnabled) await Promise.all((vehicle.photos || []).map(pathnameFromPhoto).filter(Boolean).map(p => del(p, blobOptions('private')).catch(() => null)))
    s.vehicles = s.vehicles.filter(x => x.id !== req.params.id)
    await writeStore(s); res.sendStatus(204)
  } catch (error) { console.error('[YNR] vehicle delete:', error?.message || error); res.status(503).json({ message: 'Impossible de supprimer le véhicule.' }) }
})
app.put('/api/calendar', auth, async (req, res) => { try { const s = await readStore(); s.blocked = Array.isArray(req.body) ? req.body.filter(x => x.vehicleId && x.start && x.end).slice(0, 500) : []; await writeStore(s); res.json(s.blocked) } catch { res.status(503).json({ message: 'Impossible d’enregistrer le calendrier.' }) } })
app.put('/api/settings', auth, async (req, res) => { try { const s = await readStore(); s.settings = { ...s.settings, ...Object.fromEntries(Object.entries(req.body || {}).map(([k, v]) => [k, clean(v, 500)])) }; await writeStore(s); res.json(s.settings) } catch { res.status(503).json({ message: 'Impossible d’enregistrer les réglages.' }) } })
app.patch('/api/requests/:id', auth, async (req, res) => { try { const s = await readStore(), r = s.requests.find(x => x.id === req.params.id); if (!r) return res.status(404).json({ message: 'Demande introuvable' }); r.status = clean(req.body?.status, 30); await writeStore(s); res.json(r) } catch { res.status(503).json({ message: 'Impossible de mettre à jour la demande.' }) } })
app.delete('/api/requests/:id', auth, async (req, res) => { try { const s = await readStore(); s.requests = s.requests.filter(x => x.id !== req.params.id); await writeStore(s); res.sendStatus(204) } catch { res.status(503).json({ message: 'Impossible de supprimer la demande.' }) } })

app.use((req, res, next) => { if (req.path.startsWith('/api/')) return next(); if (req.method === 'GET') return res.sendFile(path.join(root, 'dist', 'index.html')); next() })
if (isProd && !SESSION_SECRET) console.error('[YNR] SESSION_SECRET is missing in production.')
if (isProd && !OWNER_PASSWORD_HASH) console.error('[YNR] OWNER_PASSWORD_HASH is missing in production.')
if (isProd && !blobEnabled) console.error('[YNR] BLOB_STORE_ID is missing in production.')
if (!process.env.VERCEL) app.listen(PORT, () => console.log(`[YNR] http://localhost:${PORT}`))
export default app
