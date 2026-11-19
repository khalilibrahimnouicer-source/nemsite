// Local development only. Drafts and simulated orders live in a separate file.
import fs from 'node:fs/promises'
import path from 'node:path'
import crypto from 'node:crypto'

export function registerSaleLab(app,{auth, readStore, file}) {
  let queue = Promise.resolve()
  async function read() {
    try { return JSON.parse(await fs.readFile(file,'utf8')) }
    catch (err) { if (err.code === 'ENOENT') return {offers:[],orders:[]}; throw err }
  }
  function change(fn) {
    const result = queue.then(async () => {
      const lab = await read()
      await fn(lab)
      await fs.mkdir(path.dirname(file),{recursive:true})
      const tmp = file+'.'+crypto.randomUUID()+'.tmp'
      try {
        await fs.writeFile(tmp,JSON.stringify(lab),{mode:0o600})
        await fs.rename(tmp,file)
      } finally { await fs.rm(tmp,{force:true}) }
      return lab
    })
    queue = result.catch(()=>{})
    return result
  }
  function fail(status,message) {throw Object.assign(new Error(message),{status})}
  function route(handler) {
    return async (req,res) => {
      res.set('Cache-Control','private, no-store')
      try { res.json(await handler(req)) }
      catch(e) { res.status(e.status || 503).json({message:e.status ? e.message : 'Le simulateur est temporairement indisponible.'}) }
    }
  }
  app.get('/api/sale-lab',auth,route(read))
  app.put('/api/sale-lab/offers',auth,route(req=>change(async lab=>{
    const {vehicleId,price} = req.body || {}
    if (typeof price !== 'number' || !Number.isFinite(price) || price<=0 || price>100_000_000) fail(400,'Saisissez un prix de vente valide.')
    const fleet=await readStore()
    const car=fleet.vehicles.find(v=>v.id===vehicleId && !v.archivedAt && v.active!==false)
    if (!car) fail(409,'Ce véhicule est indisponible.')
    const offer=lab.offers.find(o=>o.vehicleId===vehicleId)
    const values={vehicleId, name:car.name, price:Math.round(price*100)/100}
    if (offer) Object.assign(offer,values)
    else lab.offers.push({id:crypto.randomUUID(),...values})
  })))
  app.post('/api/sale-lab/orders',auth,route(req=>change(async lab=>{
    const offer=lab.offers.find(o=>o.id===req.body?.offerId)
    if (!offer) fail(404,'Annonce test introuvable.')
    const fleet=await readStore()
    if (!fleet.vehicles.some(v=>v.id===offer.vehicleId && !v.archivedAt && v.active!==false)) fail(409,'Ce véhicule est indisponible.')
    lab.orders.unshift({id:crypto.randomUUID(),offerId:offer.id,name:offer.name,price:offer.price,createdAt:new Date().toISOString()})
  })))
}
