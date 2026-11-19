import express from 'express'
import { registerReservations } from './reservations.mjs'
import { registerSaleLab } from './sale-lab.mjs'
import crypto from 'node:crypto'
import fs from 'node:fs/promises'
import fsSync from 'node:fs'
import { homedir } from 'node:os'
import path from 'node:path'
import { Readable } from 'node:stream'
import { fileURLToPath } from 'node:url'
import bcrypt from 'bcryptjs'
import { put, del, get, head } from '@vercel/blob'
import {contentVersion,overwriteCatalog} from './catalog-blob.mjs'
import { isArchived, archiveVehicle, restoreVehicle, removeArchivedVehicle } from './archive-vehicles.mjs'

const root = path.dirname(fileURLToPath(import.meta.url))
const app = express()
const isProd = Boolean(process.env.VERCEL || process.env.NODE_ENV === 'production')
const PORT = Number(process.env.PORT || 8787)
const OWNER_EMAIL = String(process.env.OWNER_EMAIL || 'ynr.location@gmail.com').trim().toLowerCase()
const OWNER_PASSWORD_HASH = String(process.env.OWNER_PASSWORD_HASH || '').trim()
const SESSION_SECRET = String(process.env.SESSION_SECRET || '').trim()
const DATA_FILE = process.env.NODE_ENV === 'test' && process.env.YNR_TEST_DATA_FILE ? process.env.YNR_TEST_DATA_FILE : path.join(root, 'data', 'store.json')
const STORE_PATH = 'data/store.json'
const BLOB_STORE_ID = String(process.env.BLOB_STORE_ID || '').trim()
const BLOB_STATIC_TOKEN = String(process.env.BLOB_READ_WRITE_TOKEN || process.env.VERCEL_BLOB_READ_WRITE_TOKEN || process.env.BLOB_TOKEN || process.env.VERCEL_BLOB_TOKEN || '').trim()
const BLOB_WEBHOOK_PUBLIC_KEY = String(process.env.BLOB_WEBHOOK_PUBLIC_KEY || '').trim()
const RESEND_API_KEY = String(process.env.RESEND_API_KEY || '').trim()
const RESERVATION_NOTIFY_EMAIL = String(process.env.RESERVATION_NOTIFY_EMAIL || OWNER_EMAIL).trim().toLowerCase()
const RESEND_FROM = String(process.env.RESEND_FROM || 'YNR Luxury <onboarding@resend.dev>').trim()
// A store ID alone is metadata, not a Blob runtime credential. Only enable
// Blob calls when the function can actually authenticate to the store; this
// keeps login and the admin readable when Vercel has not injected a token.
const blobEnabled = Boolean(BLOB_STATIC_TOKEN)
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

function loadBundledStore() {
  try {
    return normalizeStore(JSON.parse(fsSync.readFileSync(DATA_FILE, 'utf8')))
  } catch {
    return normalizeStore(seed)
  }
}

let memory = loadBundledStore()
const loginAttempts = new Map()
const storeVersions = new WeakMap()
let localWriteQueue = Promise.resolve()

function clean(v, max = 1000) { return typeof v === 'string' ? v.trim().slice(0, max) : '' }
function normalizeVisiblePrices(value) {
  const source = value && typeof value === 'object' && !Array.isArray(value) ? value : {}
  return Object.fromEntries(['weekday24h', 'weekend48h', 'weekend72h', 'week7d', 'month30d', 'deposit'].map(key => [key, source[key] !== false]))
}
function normalizeStore(value) {
  const source = value && typeof value === 'object' ? value : {}
  // A vehicle's gallery is the single source of truth for its main image.
  // Old records may still contain a deleted featuredPhoto which would appear
  // again on the detail page unless we discard that stale reference on read.
  const vehicles = Array.isArray(source.vehicles) ? source.vehicles.filter(Boolean).map(item => {
    const photos = Array.isArray(item.photos) ? [...new Set(item.photos.filter(photo => typeof photo === 'string' && photo.trim()))] : []
    return { ...item, photos, featuredPhoto: photos[0] || '' }
  }) : []
  return {
    settings: source.settings && typeof source.settings === 'object' && !Array.isArray(source.settings) ? { ...seed.settings, ...source.settings } : structuredClone(seed.settings),
    vehicles: vehicles.sort((a,b) => {
      const left = Number.isInteger(a.displayOrder) ? a.displayOrder : Infinity
      const right = Number.isInteger(b.displayOrder) ? b.displayOrder : Infinity
      if (left !== right) return left-right
      return (Date.parse(b.createdAt || b.updatedAt) || 0) - (Date.parse(a.createdAt || a.updatedAt) || 0)
    }),
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
  return options
}

function mediaUrl(pathname) { return `/api/media/${pathname.split('/').map(encodeURIComponent).join('/')}` }
function pathnameFromPhoto(value) {
  const raw = clean(value, 200000)
  if (!raw) return null
  try {
    const u = new URL(raw, 'https://ynr.local')
    if (u.pathname === '/api/media') {
      const pathname = u.searchParams.get('path')
      if (pathname?.startsWith('vehicles/') && !pathname.includes('..') && !pathname.includes('//')) return pathname
    }
    if (u.pathname.startsWith('/api/media/')) {
      const pathname = decodeURIComponent(u.pathname.slice('/api/media/'.length))
      if (pathname.startsWith('vehicles/') && !pathname.includes('..') && !pathname.includes('//')) return pathname
    }
    if (u.hostname.endsWith('.private.blob.vercel-storage.com')) {
      const pathname = decodeURIComponent(u.pathname.replace(/^\/+/, ''))
      if (pathname.startsWith('vehicles/') && !pathname.includes('..') && !pathname.includes('//')) return pathname
    }
  } catch {}
  if (raw.startsWith('vehicles/') && !raw.includes('..') && !raw.includes('//')) return raw
  return null
}
function publicPhotos(photos) {
  return (Array.isArray(photos) ? photos : []).map(photo => {
    const pathname = pathnameFromPhoto(photo)
    return pathname ? mediaUrl(pathname) : photo
  })
}
function publicVehicle(vehicle) {
  const photos = publicPhotos(vehicle.photos)
  return { ...vehicle, photos, featuredPhoto: photos[0] || '' }
}
function publicStore(store) {
  return { settings: store.settings, vehicles: store.vehicles.filter(v => v && v.active !== false && !isArchived(v)).map(publicVehicle) }
}
function isBlobNotFound(error) { return error?.name === 'BlobNotFoundError' || /not found/i.test(String(error?.message || '')) }

async function readStore() {
  if (blobEnabled) {
    try {
      const result = await get(STORE_PATH, blobOptions('private', { useCache: false }))
      if (result?.stream) {
        const raw = await new Response(result.stream).text()
        const parsed = JSON.parse(raw)
        const normalized = normalizeStore(parsed)
        storeVersions.set(normalized,contentVersion(raw))
        memory = structuredClone(normalized)
        return normalized
      }
      const existing = normalizeStore(memory)
      await put(STORE_PATH, JSON.stringify(existing, null, 2), blobOptions('private', {
        allowOverwrite: false, addRandomSuffix: false, contentType: 'application/json'
      }))
      storeVersions.set(existing,contentVersion(JSON.stringify(existing,null,2)))
      memory = structuredClone(existing)
      return existing
    } catch (error) {
      if (isBlobNotFound(error)) {
        const existing = normalizeStore(memory)
        await put(STORE_PATH, JSON.stringify(existing, null, 2), blobOptions('private', {
          allowOverwrite: false, addRandomSuffix: false, contentType: 'application/json'
        }))
        storeVersions.set(existing,contentVersion(JSON.stringify(existing,null,2)))
        memory = structuredClone(existing)
        return existing
      }
      console.error('[YNR] Blob read failed:', error?.message || error)
      throw new Error('Vercel Blob est configuré mais la lecture du stockage a échoué.')
    }
  }
  if (isProd) throw new Error('Le stockage Blob persistant n’est pas configuré.')
  try {
    const raw = await fs.readFile(DATA_FILE,'utf8')
    const normalized = normalizeStore(JSON.parse(raw))
    storeVersions.set(normalized,crypto.createHash('sha256').update(raw).digest('hex'))
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
  const version = storeVersions.get(store)
  const serialized = JSON.stringify(normalized, null, 2)
  if (blobEnabled) {
    try {
      await overwriteCatalog({path:STORE_PATH,previous:version,body:serialized,head,get,put,options:blobOptions('private')})
      memory = structuredClone(normalized)
      return
    } catch (error) {
      if (error.status === 412) throw error
      console.error('[YNR] Blob write failed:', error?.message || error)
      if (isProd) throw new Error('Le stockage Blob est inaccessible. La modification n’a pas été enregistrée.')
    }
  }
  const write = localWriteQueue.then(async () => {
    await fs.mkdir(path.dirname(DATA_FILE),{recursive:true})
    if (version) {
      const current = await fs.readFile(DATA_FILE)
      if (crypto.createHash('sha256').update(current).digest('hex') !== version)
        throw Object.assign(new Error('Le catalogue a changé. Réessayez.'),{status:412})
    }
    const tmp = DATA_FILE+'.'+crypto.randomUUID()+'.tmp'
    try {
      await fs.writeFile(tmp,serialized)
      await fs.rename(tmp,DATA_FILE)
    } finally { await fs.rm(tmp,{force:true}) }
    memory = structuredClone(normalized)
  })
  localWriteQueue = write.catch(()=>{})
  return write
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
app.use(express.json({ limit: '28mb', strict: true }))

// Dynamic sitemap: include the homepage and every active vehicle detail page.
app.get('/api/sitemap.xml', async (_, res) => {
  const base = 'https://www.ynr-location.com'
  const xmlEscape = value => String(value).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&apos;')
  const entries = [{ loc: base + '/', priority: '1.0', changefreq: 'weekly' }]
  try {
    const store = await readStore()
    for (const vehicle of store.vehicles) {
      if (!vehicle || vehicle.active === false || isArchived(vehicle) || vehicle.id == null || !String(vehicle.id).trim()) continue
      const entry = {
        loc: base + '/vehicle/' + encodeURIComponent(String(vehicle.id)),
        priority: '0.8',
        changefreq: 'weekly',
        lastmod: [vehicle.updatedAt, vehicle.createdAt].find(value => value && !Number.isNaN(Date.parse(value)))
      }
      entries.push(entry)
    }
  } catch (error) {
    console.error('[YNR] sitemap vehicle list unavailable:', error?.message || error)
  }
  const urls = entries.map(entry => `  <url>\n    <loc>${xmlEscape(entry.loc)}</loc>${entry.lastmod ? `\n    <lastmod>${new Date(entry.lastmod).toISOString()}</lastmod>` : ''}\n    <changefreq>${entry.changefreq}</changefreq>\n    <priority>${entry.priority}</priority>\n  </url>`).join('\n')
  res.setHeader('Content-Type', 'application/xml; charset=utf-8')
  res.setHeader('Cache-Control', 'public, max-age=0, s-maxage=3600, stale-while-revalidate=86400')
  res.status(200).send(`<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls}\n</urlset>\n`)
})
app.use(express.static(path.join(root, 'dist')) )

app.get('/api/health', async (_, res) => {
  if (!blobEnabled) {
    const payload = { ok: !isProd, storage: isProd ? 'unavailable' : 'local', blobConfigured: false, persistentStorageRequired: isProd }
    return res.status(isProd ? 503 : 200).json(payload)
  }
  try {
    await readStore()
    res.json({ ok: true, storage: 'blob', blobConfigured: true, credential: 'BLOB_READ_WRITE_TOKEN', persistent: true })
  } catch (error) {
    console.error('[YNR] health:', error?.message || error)
    res.status(503).json({ ok: false, storage: 'blob', blobConfigured: true, message: 'Vercel Blob est connecté mais inaccessible depuis la Function.' })
  }
})

app.get('/api/vehicles', async (_, res) => {
  try {
    const store = await readStore()
    res.json(publicStore(store))
  } catch (error) {
    console.error('[YNR] vehicles list:', error?.message || error)
    res.status(503).json({ message: 'Le catalogue persistant est temporairement indisponible.' })
  }
})

app.get('/api/vehicles/:id', async (req, res) => {
  try {
    const store = await readStore()
    const requestedId = String(req.params.id || '')
    const vehicle = store.vehicles.find(item => String(item.id) === requestedId && item.active !== false && !isArchived(item))
    if (!vehicle) return res.status(404).json({ message: 'Véhicule introuvable' })
    return res.json(publicVehicle(vehicle))
  } catch (error) {
    console.error('[YNR] product vehicle:', error?.message || error)
    return res.status(503).json({ message: 'Fiche véhicule temporairement indisponible.' })
  }
})

app.get('/api/public', async (req, res) => {
  res.setHeader('Cache-Control', 'no-store, max-age=0')
  let s
  try {
    s = await readStore()
  } catch (error) {
    console.error('[YNR] /api/public storage unavailable:', error?.message || error)
    return res.status(503).json({ message: 'Le catalogue est temporairement indisponible. Actualisez la page.' })
  }

  const sourceVehicles = Array.isArray(s.vehicles) ? s.vehicles : []
  let vehicles = sourceVehicles.filter(v => v && v.active !== false && !isArchived(v))
  const sort = String(req.query.sort || 'manual')
  const dir = String(req.query.dir || 'asc') === 'desc' ? -1 : 1
  if (sort === 'price') vehicles.sort((a, b) => (Number(a.price || 0) - Number(b.price || 0)) * dir)
  else if (sort === 'name') vehicles.sort((a, b) => String(a.name).localeCompare(String(b.name), 'fr', { sensitivity: 'base' }) * dir)
  else if (sort === 'recent') vehicles.sort((a, b) => (Boolean(b.featured) - Boolean(a.featured)) || (new Date(b.createdAt || b.updatedAt || 0) - new Date(a.createdAt || a.updatedAt || 0)))

  res.json({ settings: s.settings || seed.settings, vehicles: vehicles.map(publicVehicle), blocked: s.blocked || [] })
})

async function serveMedia(req, res) {
  const rawUrls = [req.originalUrl, req.url, req.headers?.['x-original-url']].filter((value) => typeof value === 'string')
  const requestPath = Array.isArray(req.query?.path) ? req.query.path[0] : req.query?.path
  const wildcardValue = req.params?.splat || req.params?.path || req.params?.[0]
  const wildcardPath = Array.isArray(wildcardValue) ? wildcardValue.join('/') : wildcardValue
  const candidates = [requestPath, wildcardPath]
  for (const rawUrl of rawUrls) {
    const queryIndex = rawUrl.indexOf('?')
    if (queryIndex >= 0) {
      const rawQuery = rawUrl.slice(queryIndex + 1)
      candidates.push(new URLSearchParams(rawQuery).get('path'))
      const match = rawQuery.match(/(?:^|&)path=([^&]*)/)
      if (match) candidates.push(match[1])
    }
  }
  let pathname = ''
  for (const candidate of candidates) {
    if (typeof candidate !== 'string' || !candidate.trim()) continue
    try {
      let decoded = candidate.trim()
      for (let pass = 0; pass < 3 && /%[0-9a-f]{2}/i.test(decoded); pass += 1) decoded = decodeURIComponent(decoded)
      decoded = decoded.replace(/^\/+/, '')
      if (decoded.startsWith('vehicles/') && !decoded.includes('..') && !decoded.includes('//')) {
        pathname = decoded
        break
      }
    } catch {
      continue
    }
  }
  if (!pathname || /[\u0000-\u001f]/.test(pathname)) return res.status(400).send('Invalid media path')
  try {
    const result = await get(pathname, blobOptions('private', { useCache: false }))
    if (!result?.stream) return res.sendStatus(404)
    res.setHeader('Cache-Control', 'public, max-age=300, s-maxage=3600')
    res.setHeader('Content-Type', result.blob?.contentType || 'application/octet-stream')
    Readable.fromWeb(result.stream).pipe(res)
  } catch (error) {
    if (isBlobNotFound(error)) return res.sendStatus(404)
    console.error('[YNR] media read failed:', error?.message || error)
    res.sendStatus(503)
  }
}

app.get('/api/media', serveMedia)
app.get('/api/media/*splat', serveMedia)

app.post('/api/auth/login', async (req, res) => {
  try {
    const hashLooksValid = /^(\$2[aby]\$\d{2}\$)[./A-Za-z0-9]{53}$/.test(OWNER_PASSWORD_HASH)
    if (!SESSION_SECRET || !OWNER_EMAIL || !hashLooksValid) {
      console.error('[YNR] Admin auth configuration invalid:', JSON.stringify({
        hasSessionSecret: Boolean(SESSION_SECRET),
        hasOwnerEmail: Boolean(OWNER_EMAIL),
        validPasswordHash: hashLooksValid
      }))
      return res.status(503).json({ message: 'Connexion indisponible : configuration administrateur incomplète. Contactez le propriétaire du site.' })
    }

    const email = clean(req.body?.email, 180).toLowerCase()
    const pw = String(req.body?.password || '')
    const ip = String(req.headers['x-forwarded-for'] || req.socket.remoteAddress || '').split(',')[0]
    const key = `${ip}:${email}`
    const a = loginAttempts.get(key) || { count: 0, at: Date.now() }
    if (Date.now() - a.at > 900000) { a.count = 0; a.at = Date.now() }
    if (a.count >= 8) return res.status(429).json({ message: 'Trop de tentatives. Réessayez plus tard.' })

    const ok = email === OWNER_EMAIL && pw.length > 0 && await bcrypt.compare(pw, OWNER_PASSWORD_HASH)
    if (!ok) { a.count++; loginAttempts.set(key, a); return res.status(401).json({ message: 'Identifiants invalides' }) }
    loginAttempts.delete(key)
    const secure = isProd || req.secure || req.headers['x-forwarded-proto'] === 'https' ? ' Secure;' : ''
    const sameSite = secure ? 'None' : 'Lax'
    res.setHeader('Set-Cookie', `ynr_session=${sign(Date.now() + 86400000)}; HttpOnly; SameSite=${sameSite};${secure} Path=/; Max-Age=86400`)
    return res.json({ ok: true })
  } catch (error) {
    console.error('[YNR] Admin login failed unexpectedly:', error?.message || error)
    if (!res.headersSent) return res.status(503).json({ message: 'Le service de connexion est temporairement indisponible. Réessayez dans un instant.' })
  }
})
app.post('/api/auth/logout', auth, (req, res) => {
  const secure = isProd || req.secure || req.headers['x-forwarded-proto'] === 'https' ? ' Secure;' : ''
  const sameSite = secure ? 'None' : 'Lax'
  res.setHeader('Set-Cookie', `ynr_session=; HttpOnly; SameSite=${sameSite};${secure} Path=/; Max-Age=0`)
  res.status(204).end()
})
app.get('/api/auth/session', auth, (_, res) => res.json({ ok: true }))
app.get('/api/request-document/:requestId/:type', auth, async (req, res) => {
  try {
    const store = await readStore(); const request = store.requests.find(item => item.id === req.params.requestId); const document = request?.documents?.[req.params.type]
    if (!document?.pathname || !['identity', 'license', 'address'].includes(req.params.type)) return res.sendStatus(404)
    const result = await get(document.pathname, blobOptions('private', { useCache: false })); if (!result?.stream) return res.sendStatus(404)
    res.setHeader('Content-Type', document.contentType || 'application/octet-stream'); res.setHeader('Content-Disposition', 'inline'); Readable.fromWeb(result.stream).pipe(res)
  } catch (error) { console.error('[YNR] request document:', error?.message || error); res.sendStatus(404) }
})
app.get('/api/admin', auth, async (_, res) => {
  res.setHeader('Cache-Control', 'no-store')
  try {
    return res.json(await readStore())
  } catch (error) {
    console.error('[YNR] /api/admin storage unavailable:', error?.message || error)
    return res.status(503).json({ message: 'Le stockage persistant est indisponible. Aucune donnée locale ne sera utilisée.' })
  }
})

app.post('/api/uploads', auth, async (req, res) => {
  const data = String(req.body?.data || '')
  const match = data.match(/^data:(image\/(?:jpeg|png|webp));base64,([A-Za-z0-9+/=]+)$/)
  if (!match) return res.status(400).json({ message: 'Image JPEG, PNG ou WEBP requise' })
  const raw = Buffer.from(match[2], 'base64')
  if (raw.length < 100) return res.status(400).json({ message: 'Image invalide' })
  if (raw.length > 8 * 1024 * 1024) return res.status(413).json({ message: 'Image trop volumineuse. Choisissez une image de moins de 8 Mo.' })
  if (!blobEnabled) {
    return res.status(503).json({ message: 'Le stockage Blob n’est pas configuré. La photo n’a pas été enregistrée.' })
  }
  try {
    const ext = match[1].split('/')[1].replace('jpeg', 'jpg')
    const pathname = `vehicles/${new Date().toISOString().slice(0, 10)}/${crypto.randomUUID()}.${ext}`
    const blob = await put(pathname, raw, blobOptions('private', { addRandomSuffix: false, contentType: match[1] }))
    res.status(201).json({ pathname: blob.pathname, url: mediaUrl(blob.pathname), size: raw.length, type: match[1], storage: 'blob' })
  } catch (error) {
    console.error('[YNR] Blob upload failed:', error?.message || error)
    const detail = error?.message ? ` (${String(error.message).slice(0, 160)})` : ''
    res.status(503).json({ message: `Le stockage Blob est inaccessible. La photo n’a pas été enregistrée.${detail}` })
  }
})

app.delete('/api/uploads', auth, async (req, res) => {
  const pathname = pathnameFromPhoto(clean(req.body?.url, 200000))
  if (!pathname) return res.status(400).json({ message: 'Photo YNR introuvable' })
  try {
    const store = await readStore()
    const used = store.vehicles.some(vehicle => [...(vehicle.photos || []), vehicle.featuredPhoto].some(photo => pathnameFromPhoto(photo) === pathname))
    if (used) return res.status(409).json({ message: 'Cette photo est encore utilisée par un véhicule, même archivé.' })
    if (blobEnabled) await del(pathname, blobOptions('private'))
    res.sendStatus(204)
  } catch (error) {
    console.error('[YNR] Blob delete failed:', error?.message || error)
    res.status(503).json({ message: 'Impossible de supprimer la photo' })
  }
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

registerReservations(app,{readStore,writeStore,notifyReservation,blobEnabled,put,del,blobOptions,isArchived,clean})

if (!process.env.VERCEL && ['development','test',undefined].includes(process.env.NODE_ENV)) {
  const labDirectory = process.env.NODE_ENV === 'test' ? path.dirname(DATA_FILE) : path.join(homedir(),'.ynr-location')
  registerSaleLab(app,{auth,readStore,file:path.join(labDirectory,'sale-lab.local.json')})
}

app.put('/api/fleet-order',auth,async (req,res) => {
  const ids = req.body?.ids
  if (!Array.isArray(ids) || ids.some(id=>typeof id!=='string') || new Set(ids).size!==ids.length)
    return res.status(400).json({message:'Classement invalide.'})
  try {
    for (let attempt=0; attempt<3; attempt++) {
      const store = await readStore()
      const active = store.vehicles.filter(v=>v.active!==false && !isArchived(v))
      const ranks = new Map(ids.map((id,i)=>[id,i]))
      if (active.length!==ids.length || active.some(v=>!ranks.has(v.id)))
        return res.status(409).json({message:'La flotte a changé. Actualisez le classement.'})
      for (const vehicle of store.vehicles) {
        if (ranks.has(vehicle.id)) vehicle.displayOrder = ranks.get(vehicle.id)
        else delete vehicle.displayOrder
      }
      try {
        await writeStore(store)
        break
      } catch (error) {
        if (error.status !== 412 || attempt === 2) throw error
      }
    }
    res.json({ids})
  } catch (error) {
    const conflict = error.status===412
    res.status(conflict?409:503).json({message:conflict?'La flotte a changé. Actualisez le classement.':'Impossible de sauvegarder le classement.'})
  }
})

function normalizePricing(value, basePrice = 0) {
  const source = value && typeof value === 'object' ? value : {}
  const price = Math.max(0, Number(basePrice) || 0)
  const discount = Math.min(100, Math.max(0, Number(source.discount) || 0))
  const finalPrice = amount => Math.round(Math.max(0, Number(amount) || 0) * (1 - discount / 100))
  return {
    weekday24h: Math.max(0, Number(source.weekday24h ?? price) || 0),
    weekend48h: Math.max(0, Number(source.weekend48h ?? price * 2) || 0),
    weekend72h: Math.max(0, Number(source.weekend72h ?? price * 3) || 0),
    week7d: Math.max(0, Number(source.week7d ?? price * 7) || 0),
    month30d: Math.max(0, Number(source.month30d ?? price * 30) || 0),
    discount,
    display: finalPrice(Number(source.weekday24h ?? price))
  }
}

app.post('/api/vehicles', auth, async (req, res) => {
  const b = req.body || {}
  const v = { id: clean(b.id, 100) || crypto.randomUUID(), name: clean(b.name, 120), category: clean(b.category, 100) || 'Véhicule premium', price: Number(b.price) || 0, deposit: Number(b.deposit) || 0, pricing: normalizePricing(b.pricing, Number(b.price) || 0), description: clean(b.description, 2000), photos: Array.isArray(b.photos) ? [...new Set(b.photos.map(x => clean(x, 100 * 1024 * 1024)).filter(Boolean))].slice(0, 8) : [], featuredPhoto: clean(b.featuredPhoto, 100 * 1024 * 1024), active: b.active !== false, featured: Boolean(b.featured), visiblePrices: normalizeVisiblePrices(b.visiblePrices), createdAt: b.createdAt || new Date().toISOString(), updatedAt: new Date().toISOString() }
  v.featuredPhoto = v.photos[0] || ''
  if (!v.name) return res.status(400).json({ message: 'Nom du véhicule requis.' })
  try {
    const s = await readStore()
    const i = s.vehicles.findIndex(x => x.id === v.id)
    if (i >= 0 && isArchived(s.vehicles[i])) return res.status(409).json({ message: 'Restaurez ce véhicule depuis les archives avant de le modifier.' })
    const previousPhotos = i >= 0 && Array.isArray(s.vehicles[i].photos) ? s.vehicles[i].photos : []
    const retainedPaths = new Set(v.photos.map(pathnameFromPhoto).filter(Boolean))
    const requestedRemovedPaths = Array.isArray(b.removedPhotos) ? b.removedPhotos.map(pathnameFromPhoto).filter(Boolean) : []
    const removedPaths = [...new Set([...previousPhotos.map(pathnameFromPhoto).filter(Boolean), ...requestedRemovedPaths])].filter(pathname => !retainedPaths.has(pathname))
    if (i >= 0) s.vehicles[i] = { ...s.vehicles[i], ...v }
    else s.vehicles.unshift(v)
    // Persist the new photo list before deleting anything from Blob. If saving fails,
    // every original image remains untouched and the vehicle still references it.
    await writeStore(s)
    const saved = (await readStore()).vehicles.find(item => item.id === v.id)
    if (!saved || JSON.stringify(saved.photos) !== JSON.stringify(v.photos)) {
      return res.status(503).json({ message: 'Photos non confirmées après enregistrement. Actualisez la page avant de réessayer.' })
    }
    let photoCleanupWarning = false
    const stillUsedPhotos = new Set(s.vehicles.flatMap(item => [...(item.photos || []), item.featuredPhoto].map(pathnameFromPhoto).filter(Boolean)))
    const unreferencedPhotos = removedPaths.filter(pathname => !stillUsedPhotos.has(pathname))
    if (blobEnabled && unreferencedPhotos.length) {
      const results = await Promise.allSettled(unreferencedPhotos.map(pathname => del(pathname, blobOptions('private'))))
      photoCleanupWarning = results.some(result => result.status === 'rejected')
      if (photoCleanupWarning) console.error('[YNR] Some removed vehicle photos could not be deleted from Blob.')
    }
    res.status(201).json({ ...publicVehicle(saved), photoCleanupWarning })
  } catch (error) { console.error('[YNR] vehicle save:', error?.message || error); res.status(503).json({ message: 'Impossible d’enregistrer le véhicule.' }) }
})
app.patch('/api/vehicles/:id', auth, async (req, res) => {
  try {
    const s = await readStore(), v = s.vehicles.find(x => x.id === req.params.id)
    if (!v) return res.status(404).json({ message: 'Véhicule introuvable' })
    if (isArchived(v)) return res.status(409).json({ message: 'Restaurez ce véhicule depuis les archives avant de le modifier.' })
    const oldPhotos = Array.isArray(v.photos) ? v.photos : []
    Object.assign(v, { name: clean(req.body.name, 120) || v.name, category: clean(req.body.category, 100) || v.category, price: Number(req.body.price ?? v.price) || 0, deposit: Number(req.body.deposit ?? v.deposit) || 0, pricing: normalizePricing(req.body.pricing ?? v.pricing, Number(req.body.price ?? v.price) || 0), description: clean(req.body.description, 2000), photos: Array.isArray(req.body.photos) ? req.body.photos.map(x => clean(x, 100 * 1024 * 1024)).filter(Boolean).slice(0, 8) : oldPhotos, featuredPhoto: clean(req.body.featuredPhoto, 100 * 1024 * 1024) || v.featuredPhoto || '', active: req.body.active !== undefined ? Boolean(req.body.active) : v.active, featured: req.body.featured !== undefined ? Boolean(req.body.featured) : Boolean(v.featured), visiblePrices: req.body.visiblePrices && typeof req.body.visiblePrices === 'object' ? normalizeVisiblePrices(req.body.visiblePrices) : normalizeVisiblePrices(v.visiblePrices), updatedAt: new Date().toISOString() })
    v.featuredPhoto = v.photos[0] || ''
    const retainedPaths = new Set(v.photos.map(pathnameFromPhoto).filter(Boolean))
    const removed = [...new Set(oldPhotos.map(pathnameFromPhoto).filter(Boolean))].filter(pathname => !retainedPaths.has(pathname))
    await writeStore(s)
    const saved = (await readStore()).vehicles.find(item => item.id === v.id)
    if (!saved || JSON.stringify(saved.photos) !== JSON.stringify(v.photos)) {
      return res.status(503).json({ message: 'Photos non confirmées après modification. Actualisez la page avant de réessayer.' })
    }
    let photoCleanupWarning = false
    const stillUsedPhotos = new Set(s.vehicles.flatMap(item => [...(item.photos || []), item.featuredPhoto].map(pathnameFromPhoto).filter(Boolean)))
    const unreferencedPhotos = removed.filter(pathname => !stillUsedPhotos.has(pathname))
    if (blobEnabled && unreferencedPhotos.length) {
      const results = await Promise.allSettled(unreferencedPhotos.map(pathname => del(pathname, blobOptions('private'))))
      photoCleanupWarning = results.some(result => result.status === 'rejected')
      if (photoCleanupWarning) console.error('[YNR] Some removed vehicle photos could not be deleted from Blob.')
    }
    res.json({ ...publicVehicle(saved), photoCleanupWarning })
  } catch (error) { console.error('[YNR] vehicle patch:', error?.message || error); res.status(503).json({ message: 'Impossible de modifier le véhicule.' }) }
})
app.patch('/api/vehicles/:id/featured', auth, async (req, res) => {
  try {
    const s = await readStore(), selected = s.vehicles.find(x => x.id === req.params.id)
    if (!selected) return res.status(404).json({ message: 'Véhicule introuvable' })
    if (isArchived(selected)) return res.status(409).json({ message: 'Un véhicule archivé ne peut pas être mis à l’affiche.' })
    s.vehicles = s.vehicles.map(vehicle => ({ ...vehicle, featured: vehicle.id === selected.id, updatedAt: new Date().toISOString() }))
    await writeStore(s)
    res.json(s.vehicles.map(publicVehicle))
  } catch (error) {
    console.error('[YNR] featured vehicle update:', error?.message || error)
    res.status(503).json({ message: 'Impossible de définir le véhicule principal.' })
  }
})
// DELETE archives without touching photos: the operation is reversible.
app.delete('/api/vehicles/:id', auth, async (req, res) => {
  const id = clean(req.params.id, 100)
  if (!id) return res.status(400).json({ message: 'Identifiant du véhicule invalide.' })
  try {
    const store = await readStore(), result = archiveVehicle(store, id)
    if (result.status === 'missing') return res.status(404).json({ message: 'Véhicule introuvable.' })
    if (result.status === 'already-archived') return res.status(409).json({ message: 'Véhicule déjà archivé.' })
    await writeStore(store)
    const persisted = await readStore()
    if (!persisted.vehicles.some(item => String(item.id) === id && isArchived(item))) return res.status(503).json({ message: 'Archivage non confirmé dans le stockage. Actualisez la page.' })
    return res.json({ ok: true, id, archived: true })
  } catch (error) {
    console.error('[YNR] vehicle archive:', error?.message || error)
    return res.status(503).json({ message: 'Impossible d’archiver le véhicule. Aucune photo n’a été supprimée.' })
  }
})

app.patch('/api/vehicles/:id/restore', auth, async (req, res) => {
  const id = clean(req.params.id, 100)
  if (!id) return res.status(400).json({ message: 'Identifiant du véhicule invalide.' })
  try {
    const store = await readStore(), result = restoreVehicle(store, id)
    if (result.status === 'missing') return res.status(404).json({ message: 'Véhicule introuvable.' })
    if (result.status === 'not-archived') return res.status(409).json({ message: 'Véhicule déjà dans la flotte.' })
    await writeStore(store)
    const persisted = await readStore()
    const restored = persisted.vehicles.find(item => String(item.id) === id && !isArchived(item) && item.active !== false)
    if (!restored) return res.status(503).json({ message: 'Restauration non confirmée dans le stockage. Actualisez la page.' })
    return res.json({ ok: true, id, restored: true, vehicle: publicVehicle(restored) })
  } catch (error) {
    console.error('[YNR] vehicle restore:', error?.message || error)
    return res.status(503).json({ message: 'Impossible de remettre en ligne ce véhicule.' })
  }
})

// Only an archived car can be permanently removed; deletion needs a separate
// explicit confirmation and saves data before cleaning any unshared media.
app.delete('/api/vehicles/:id/permanent', auth, async (req, res) => {
  const id = clean(req.params.id, 100)
  if (!id) return res.status(400).json({ message: 'Identifiant du véhicule invalide.' })
  if (req.body?.confirmation !== 'SUPPRIMER') return res.status(400).json({ message: 'Confirmation SUPPRIMER requise.' })
  try {
    const store = await readStore(), result = removeArchivedVehicle(store, id)
    if (result.status === 'missing') return res.status(404).json({ message: 'Véhicule introuvable.' })
    if (result.status === 'not-archived') return res.status(409).json({ message: 'Archivez le véhicule avant sa suppression définitive.' })
    await writeStore(store)
    const persisted = await readStore()
    if (persisted.vehicles.some(item => String(item.id) === id)) return res.status(503).json({ message: 'Suppression non confirmée dans le stockage. Actualisez la page.' })
    const paths = item => [...(Array.isArray(item.photos) ? item.photos : []), item.featuredPhoto].map(pathnameFromPhoto).filter(Boolean)
    const stillUsed = new Set(persisted.vehicles.flatMap(paths))
    const unused = [...new Set(paths(result.vehicle))].filter(pathname => !stillUsed.has(pathname))
    let photoCleanupWarning = false
    if (blobEnabled && unused.length) {
      try { await del(unused, blobOptions('private')) }
      catch (error) {
        photoCleanupWarning = true
        console.error('[YNR] Archived vehicle removed, photo cleanup failed:', error?.message || error)
      }
    }
    return res.json({ ok: true, id, permanentlyDeleted: true, photoCleanupWarning })
  } catch (error) {
    console.error('[YNR] archived vehicle permanent delete:', error?.message || error)
    return res.status(503).json({ message: 'Suppression définitive impossible. Vérifiez les archives.' })
  }
})
app.put('/api/calendar', auth, async (req, res) => { try { const s = await readStore(); s.blocked = Array.isArray(req.body) ? req.body.filter(x => x.vehicleId && x.start && x.end).slice(0, 500) : []; await writeStore(s); res.json(s.blocked) } catch { res.status(503).json({ message: 'Impossible d’enregistrer le calendrier.' }) } })
app.put('/api/settings', auth, async (req, res) => { try { const s = await readStore(); s.settings = { ...s.settings, ...Object.fromEntries(Object.entries(req.body || {}).map(([k, v]) => [k, clean(v, 500)])) }; await writeStore(s); res.json(s.settings) } catch { res.status(503).json({ message: 'Impossible d’enregistrer les réglages.' }) } })
app.patch('/api/requests/:id', auth, async (req, res) => { try { const s = await readStore(), r = s.requests.find(x => x.id === req.params.id); if (!r) return res.status(404).json({ message: 'Demande introuvable' }); r.status = clean(req.body?.status, 30); await writeStore(s); res.json(r) } catch { res.status(503).json({ message: 'Impossible de mettre à jour la demande.' }) } })
app.delete('/api/requests/:id', auth, async (req, res) => { try { const s = await readStore(); s.requests = s.requests.filter(x => x.id !== req.params.id); await writeStore(s); res.sendStatus(204) } catch { res.status(503).json({ message: 'Impossible de supprimer la demande.' }) } })

// Server-render SEO metadata for each vehicle URL so crawlers and social previews
// receive a unique title, description, canonical URL and structured data without JS.
app.get('/api/seo-vehicle/:id', async (req, res, next) => {
  try {
    const requestedId = String(req.params.id || '')
    if (!requestedId || requestedId.length > 200) return res.status(404).send('Véhicule introuvable')
    const store = await readStore()
    const vehicle = store.vehicles.find(item => String(item.id) === requestedId && item.active !== false && !isArchived(item))
    if (!vehicle) return res.status(404).send('Véhicule introuvable')
    const htmlEscape = value => String(value ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;')
    const plainText = value => String(value ?? '').replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim()
    const title = `${plainText(vehicle.name).slice(0, 90)} | YNR Location — YNR Luxury`
    const vehicleDetails = plainText(vehicle.description || 'Consultez les tarifs et demandez votre réservation directement auprès de notre équipe.')
    const description = `Location de ${plainText(vehicle.name)} avec YNR Location — YNR Luxury en Île-de-France. ${vehicleDetails}`.slice(0, 160)
    const canonical = 'https://www.ynr-location.com/vehicle/' + encodeURIComponent(requestedId)
    const rawImage = vehicle.photos[0] || '/ynr-luxury-new.jpg'
    const image = /^https?:\/\//i.test(rawImage) ? rawImage : 'https://www.ynr-location.com' + (rawImage.startsWith('/') ? rawImage : '/' + rawImage)
    const price = Number(vehicle.pricing?.weekday24h ?? vehicle.price)
    const jsonLd = {
      '@context': 'https://schema.org',
      '@type': 'Vehicle',
      name: plainText(vehicle.name),
      description,
      url: canonical,
      image,
      brand: { '@type': 'Brand', name: 'YNR Location' },
      category: plainText(vehicle.category || 'Véhicule premium'),
      ...(Number.isFinite(price) && price > 0 ? { offers: { '@type': 'Offer', url: canonical, price: String(price), priceCurrency: 'EUR', seller: { '@type': 'AutoRental', name: 'YNR Location — YNR Luxury', url: 'https://www.ynr-location.com/' } } } : {})
    }
    let document = await fs.readFile(path.join(root, 'dist', 'index.html'), 'utf8')
    document = document.replace(/<title>[^<]*<\/title>/i, `<title>${htmlEscape(title)}</title>`)
    document = document.replace(/<meta name="description" content="[^"]*"\s*\/>/i, `<meta name="description" content="${htmlEscape(description)}"/>`)
    document = document.replace(/<link rel="canonical" href="[^"]*"\s*\/>/i, `<link rel="canonical" href="${htmlEscape(canonical)}"/>`)
    document = document.replace(/<meta property="og:title" content="[^"]*"\s*\/>/i, `<meta property="og:title" content="${htmlEscape(title)}"/>`)
    document = document.replace(/<meta property="og:description" content="[^"]*"\s*\/>/i, `<meta property="og:description" content="${htmlEscape(description)}"/>`)
    document = document.replace(/<meta property="og:url" content="[^"]*"\s*\/>/i, `<meta property="og:url" content="${htmlEscape(canonical)}"/>`)
    document = document.replace(/<meta property="og:image" content="[^"]*"\s*\/>/i, `<meta property="og:image" content="${htmlEscape(image)}"/>`)
    document = document.replace(/<meta name="twitter:title" content="[^"]*"\s*\/>/i, `<meta name="twitter:title" content="${htmlEscape(title)}"/>`)
    document = document.replace(/<meta name="twitter:description" content="[^"]*"\s*\/>/i, `<meta name="twitter:description" content="${htmlEscape(description)}"/>`)
    document = document.replace(/<meta name="twitter:image" content="[^"]*"\s*\/>/i, `<meta name="twitter:image" content="${htmlEscape(image)}"/>`)
    document = document.replace('</head>', `<script type="application/ld+json">${JSON.stringify(jsonLd).replace(/</g, '\\u003c')}</script>\n</head>`)
    res.setHeader('Cache-Control', 'public, max-age=0, s-maxage=300, stale-while-revalidate=3600')
    res.type('html').status(200).send(document)
  } catch (error) {
    console.error('[YNR] vehicle SEO rendering failed:', error?.message || error)
    next(error)
  }
})

app.use((req, res, next) => { if (req.path.startsWith('/api/')) return next(); if (req.method === 'GET') return res.sendFile(path.join(root, 'dist', 'index.html')); next() })
if (isProd && !SESSION_SECRET) console.error('[YNR] SESSION_SECRET is missing in production.')
if (isProd && !OWNER_PASSWORD_HASH) console.error('[YNR] OWNER_PASSWORD_HASH is missing in production.')
if (isProd && !blobEnabled) console.error('[YNR] BLOB_READ_WRITE_TOKEN is missing in production.')
if (!process.env.VERCEL && process.env.NODE_ENV !== 'test') app.listen(PORT, () => console.log(`[YNR] http://localhost:${PORT}`))

export default app
