import { createHash, randomUUID } from 'node:crypto'

const documentTypes = ['identity', 'license', 'address']
const extensions = { 'application/pdf': 'pdf', 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' }
const rateWindow = 15 * 60 * 1000

class RequestError extends Error {
  constructor(status, message) { super(message); this.status = status }
}

function validDay(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false
  const day = new Date(value + 'T00:00:00Z')
  return Number.isFinite(day.valueOf()) && day.toISOString().slice(0,10) === value
}

function readDocuments(documents) {
  return documentTypes.map(type => {
    const match = /^data:(image\/(?:jpeg|png|webp)|application\/pdf);base64,([A-Za-z0-9+/]+={0,2})$/.exec(documents?.[type]?.data || '')
    if (!match) throw new RequestError(400, 'Ajoutez les trois justificatifs demandés.')
    const raw = Buffer.from(match[2], 'base64')
    if (raw.length < 100 || raw.length > 8 * 1024 * 1024) throw new RequestError(400, 'Chaque justificatif doit faire entre 100 octets et 8 Mo.')
    const mime = match[1]
    const header = raw.toString('latin1', 0, 12)
    const valid = mime === 'application/pdf' ? header.startsWith('%PDF-') :
      mime === 'image/jpeg' ? raw.readUIntBE(0,3) === 0xffd8ff :
      mime === 'image/png' ? raw.subarray(0,8).equals(Buffer.from('89504e470d0a1a0a','hex')) :
      header.startsWith('RIFF') && header.slice(8) === 'WEBP'
    if (!valid) throw new RequestError(400, 'Un justificatif ne correspond pas au format de fichier annoncé.')
    return { type, mime, raw }
  })
}

function getSelection(store, ids, start, end, isArchived) {
  const records = new Map(store.vehicles.map(vehicle => [String(vehicle.id), vehicle]))
  return ids.map(id => {
    const vehicle = records.get(id)
    if (!vehicle || vehicle.active === false || isArchived(vehicle)) {
      throw new RequestError(409, 'Un véhicule de la sélection a été retiré. Mettez votre panier à jour.')
    }
    if ((store.blocked || []).some(block => String(block.vehicleId) === id &&
      String(block.start).slice(0,10) <= end && String(block.end).slice(0,10) >= start)) {
      throw new RequestError(409, vehicle.name + ' est indisponible sur les dates choisies.')
    }
    return { id, name: vehicle.name }
  })
}

function replay(store, key, fingerprint) {
  const record = store.requests.find(item => item.requestKey === key)
  if (!record) return false
  if (record.requestFingerprint !== fingerprint) {
    throw new RequestError(409, 'Cette référence a déjà été utilisée pour une autre demande.')
  }
  return true
}

function conflictingWrite(error) {
  return [409, 412].includes(error?.status || error?.statusCode) || error?.name === 'BlobPreconditionFailedError'
}

export function registerReservations(app, {readStore, writeStore, notifyReservation, blobEnabled, put, del, blobOptions, isArchived, clean}) {
  const attempts = new Map()
  let nextSweep = 0
  let writes = Promise.resolve()
  app.post('/api/requests', async (req, res) => {
    const ownedPaths = []
    let keepUploads = false
    try {
      const now = Date.now()
      if (now >= nextSweep) {
        for (const [ip, times] of attempts) if (times.at(-1) <= now - rateWindow) attempts.delete(ip)
        nextSweep = now + rateWindow
      }
      const ip = String(req.headers['x-forwarded-for'] || req.socket?.remoteAddress || '').split(',')[0].slice(0,100)
      const recent = (attempts.get(ip) || []).filter(time => time > now - rateWindow)
      if (recent.length >= 8) throw new RequestError(429, 'Trop de demandes. Réessayez plus tard.')
      attempts.set(ip, [...recent, now])
      const body = req.body || {}
      if (clean(body.website, 50)) throw new RequestError(400, 'Demande invalide.')
      const name = clean(body.name,100), email = clean(body.email,254).toLowerCase(), phone = clean(body.phone,40)
      const start = clean(body.start,20), end = clean(body.end,20), message = clean(body.message,2000)
      if (!name || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || !/^[+0-9 ()\-.]{7,40}$/.test(phone) ||
        !validDay(start) || !validDay(end) || end < start) throw new RequestError(400, 'Vérifiez vos coordonnées et vos dates.')
      const selection = body.vehicleIds === undefined ? [body.vehicleId] : body.vehicleIds
      if (!Array.isArray(selection) || !selection.length || selection.some(id => typeof id !== 'string' || !id.trim() || id.length > 100)) {
        throw new RequestError(400, 'Sélectionnez au moins un véhicule valide.')
      }
      const ids = [...new Set(selection.map(id => id.trim()))]
      const key = body.requestKey === undefined ? randomUUID() : body.requestKey
      if (typeof key !== 'string' || !/^[\da-f]{8}-(?:[\da-f]{4}-){3}[\da-f]{12}$/i.test(key)) throw new RequestError(400, 'Référence de demande invalide.')
      const files = readDocuments(body.documents)
      const digest = createHash('sha256').update(JSON.stringify({ids:[...ids].sort(), name,email,phone,start,end,message}))
      for (const file of files) digest.update(createHash('sha256').update(file.raw).digest())
      const fingerprint = digest.digest('hex')
      const initial = await readStore()
      if (replay(initial, key, fingerprint)) return res.json({ok:true})
      getSelection(initial, ids, start, end, isArchived)
      if (!blobEnabled) throw new RequestError(503, 'Le stockage sécurisé est temporairement indisponible.')
      const documents = {}
      const createdAt = new Date(now).toISOString()
      for (const {type, mime, raw} of files) {
        const pathname = 'reservations/' + createdAt.slice(0,10) + '/' + randomUUID() + '.' + extensions[mime]
        ownedPaths.push(pathname)
        await put(pathname, raw, blobOptions('private', { addRandomSuffix:false, contentType:mime }))
        documents[type] = {pathname, label:type, contentType:mime, uploadedAt:createdAt}
      }
      const id = randomUUID()
      async function commit() {
        for (let attempt = 0; attempt < 3; attempt++) {
          const store = await readStore()
          if (replay(store, key, fingerprint)) return null
          const vehicles = getSelection(store, ids, start, end, isArchived)
          const record = {id, requestKey:key, requestFingerprint:fingerprint, name,email,phone,start,end,message,
            vehicleIds:ids, vehicles, vehicle:vehicles.map(item => item.name).join(' · '),
            vehicleId:ids.length === 1 ? ids[0] : '', documents, status:'nouvelle', createdAt}
          store.requests.unshift(record)
          try {
            await writeStore(store)
            keepUploads = true
            return record
          } catch (error) {
            if (conflictingWrite(error)) {
              if (attempt < 2) continue
              throw new RequestError(503, 'La flotte vient de changer. Réessayez votre demande.')
            }
            // A remote write can succeed before its response is lost. Preserve files until the outcome is known.
            keepUploads = true
            const saved = (await readStore()).requests.find(item => item.id === id)
            if (saved) return saved
            throw error
          }
        }
      }
      const pending = writes.then(commit)
      writes = pending.catch(() => {})
      const reservation = await pending
      if (!reservation) return res.json({ok:true})
      const notification = await notifyReservation(reservation)
      return res.json({ok:true, notification:notification?.sent ? 'sent' : 'not-configured'})
    } catch (error) {
      if (!(error instanceof RequestError)) console.error('[YNR] grouped reservation:', error?.name)
      return res.status(error instanceof RequestError ? error.status : 503).json({
        message:error instanceof RequestError ? error.message : 'Impossible d’enregistrer la demande. Réessayez.'
      })
    } finally {
      if (!keepUploads && ownedPaths.length) {
        try { await del(ownedPaths, blobOptions('private')) }
        catch (error) { console.error('[YNR] reservation file cleanup:', error?.name) }
      }
    }
  })
}
