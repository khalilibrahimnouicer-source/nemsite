import express from 'express'
import crypto from 'node:crypto'
import fs from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import bcrypt from 'bcryptjs'
import { put, del, get } from '@vercel/blob'
const root=path.dirname(fileURLToPath(import.meta.url)), dataDir=path.join(root,'data'), file=path.join(dataDir,'store.json'), port=Number(process.env.PORT||8787)
const OWNER_EMAIL=String(process.env.OWNER_EMAIL||'ynr.location@gmail.com').trim().toLowerCase()
const OWNER_PASSWORD_HASH=String(process.env.OWNER_PASSWORD_HASH||'').trim();const loginAttempts=new Map();const requestAttempts=new Map();const isProd=Boolean(process.env.VERCEL||process.env.NODE_ENV==='production');
const defaults={settings:{brand:'YNR Luxury Rent',tagline:'Location de véhicules premium pour professionnels et particuliers',phone:'07 46 38 99 31',whatsapp:'33746389931',whatsappChannel:'https://wa.me/33746389931',email:'ynr.location@gmail.com',instagram:'https://instagram.com/ynr_location',snapchat:'https://t.snapchat.com/ECABDZ05'},vehicles:[{id:'v1',name:'BMW M3 Competition',category:'Berline sportive',price:490,deposit:3000,description:'Une sportive précise et confortable pour les trajets professionnels comme les escapades du week-end.',photos:['https://images.unsplash.com/photo-1555215695-3004980ad54e?auto=format&fit=crop&w=1200&q=85'],active:true}],requests:[],blocked:[]}
let memoryStore=structuredClone(defaults);const clean=(v,max=1000)=>typeof v==='string'?v.trim().slice(0,max):''
const sessionSecret=String(process.env.SESSION_SECRET||'').trim();const signSession=exp=>{const value=String(exp),sig=crypto.createHmac('sha256',sessionSecret).update(value).digest('hex');return `${value}.${sig}`};const validSession=t=>{const [exp,sig]=String(t||'').split('.'),expected=crypto.createHmac('sha256',sessionSecret).update(exp||'').digest('hex');return Boolean(exp&&sig&&Number(exp)>Date.now()&&sig.length===expected.length&&crypto.timingSafeEqual(Buffer.from(sig),Buffer.from(expected)))}
const STORE_BLOB_PATH='data/store.json'
const PRIVATE_BLOB_STORE_ID=String(process.env.PRIVATE_BLOB_READ_WRITE_TOKEN_STORE_ID||'').trim()
async function read(){
  if(isProd){
    try{
      if(!PRIVATE_BLOB_STORE_ID) throw new Error('PRIVATE_BLOB_READ_WRITE_TOKEN_STORE_ID is missing')
      const result=await get(STORE_BLOB_PATH,{access:'private',useCache:false,storeId:PRIVATE_BLOB_STORE_ID})
      if(result?.stream){const text=await new Response(result.stream).text();const parsed=JSON.parse(text);memoryStore=structuredClone(parsed);return parsed}
    }catch(error){
      if(error?.name==='BlobNotFoundError'){
        // First production boot: seed the private store from the non-sensitive site defaults.
        const seeded=structuredClone(defaults)
        await put(STORE_BLOB_PATH,JSON.stringify(seeded,null,2),{access:'private',allowOverwrite:false,addRandomSuffix:false,contentType:'application/json',storeId:PRIVATE_BLOB_STORE_ID})
        memoryStore=structuredClone(seeded)
        return seeded
      }
      console.error('[YNR] Private Blob store read failed:',error?.message||error)
    }
    // In production, never fall back to a public or in-memory copy of personal data.
    throw new Error('Le stockage privé des données est indisponible. Connectez un Vercel Blob Store privé au projet.')
  }
  try{return JSON.parse(await fs.readFile(file,'utf8'))}catch{return structuredClone(memoryStore)}
}
async function write(v){
  memoryStore=structuredClone(v)
  const serialized=JSON.stringify(v,null,2)
  if(isProd){
    try{
      if(!PRIVATE_BLOB_STORE_ID) throw new Error('PRIVATE_BLOB_READ_WRITE_TOKEN_STORE_ID is missing')
      await put(STORE_BLOB_PATH,serialized,{access:'private',allowOverwrite:true,addRandomSuffix:false,contentType:'application/json',storeId:PRIVATE_BLOB_STORE_ID})
      return
    }catch(error){
      console.error('[YNR] Persistent private Blob write failed:',error?.message||error)
      throw new Error('Le stockage privé des données est indisponible. Vérifiez le Vercel Blob Store privé du projet.')
    }
  }
  await fs.mkdir(dataDir,{recursive:true});const tmp=`${file}.tmp`;await fs.writeFile(tmp,serialized);await fs.rename(tmp,file)
}
function auth(req,res,next){if(!sessionSecret)return res.status(503).json({message:'Session administrateur non configurée'});const t=req.headers.cookie?.match(/(?:^|;\s*)ynr_session=([^;]+)/)?.[1];if(!validSession(t))return res.status(401).json({message:'Authentification requise'});req.session=t;next()}
const app=express();app.disable('x-powered-by');app.use((_,res,next)=>{res.setHeader('X-Content-Type-Options','nosniff');res.setHeader('X-Frame-Options','DENY');res.setHeader('Referrer-Policy','strict-origin-when-cross-origin');res.setHeader('Permissions-Policy','camera=(), microphone=(), geolocation=()');res.setHeader('Cross-Origin-Opener-Policy','same-origin');if(isProd)res.setHeader('Strict-Transport-Security','max-age=31536000; includeSubDomains');next()});app.use(express.json({limit:'12mb',strict:true}));app.use(express.static(path.join(root,'dist')))
app.post('/api/uploads',auth,async(req,res)=>{try{
  const data=String(req.body?.data||'')
  const match=data.match(/^data:(image\/(?:jpeg|png|webp));base64,([A-Za-z0-9+/=]+)$/)
  if(!match)return res.status(400).json({message:'Image JPEG, PNG ou WEBP requise'})
  const raw=Buffer.from(match[2],'base64')
  if(raw.length<100)return res.status(400).json({message:'Image invalide'})
  if(raw.length>8*1024*1024)return res.status(413).json({message:'Image trop volumineuse (8 Mo maximum)'})
  const ext=match[1].split('/')[1].replace('jpeg','jpg')
  const name=`vehicles/${new Date().toISOString().slice(0,10)}/${crypto.randomUUID()}.${ext}`
  const blob=await put(name,raw,{access:'public',contentType:match[1],addRandomSuffix:false})
  res.status(201).json({url:blob.url,pathname:blob.pathname,size:raw.length,type:match[1]})
}catch(error){console.error('[YNR] Blob upload failed',error);res.status(500).json({message:'Le stockage des photos est indisponible. Vérifiez le stockage Vercel Blob du projet.'})}})
app.delete('/api/uploads',auth,async(req,res)=>{try{const url=clean(req.body?.url,200000);if(!url)return res.status(400).json({message:'URL requise'});await del(url);res.sendStatus(204)}catch(error){console.error('[YNR] Blob delete failed',error);res.status(500).json({message:'Impossible de supprimer la photo du stockage'})}})
app.get('/api/public',async(req,res)=>{
  res.setHeader('Cache-Control','no-store, max-age=0')
  const s=await read();let vehicles=s.vehicles.filter(v=>v.active)
  const sort=String(req.query.sort||'recent')
  const dir=String(req.query.dir||'asc')==='desc'?-1:1
  if(sort==='price') vehicles.sort((a,b)=>(Number(a.price||0)-Number(b.price||0))*dir)
  else if(sort==='name') vehicles.sort((a,b)=>String(a.name).localeCompare(String(b.name),'fr',{sensitivity:'base'})*dir)
  else if(sort==='category') vehicles.sort((a,b)=>String(a.category).localeCompare(String(b.category),'fr',{sensitivity:'base'})*dir)
  else vehicles.sort((a,b)=>new Date(b.createdAt||b.updatedAt||0)-new Date(a.createdAt||a.updatedAt||0))
  res.json({settings:s.settings,vehicles,blocked:s.blocked})
})
app.get('/api/health',(_,res)=>res.json({ok:true}))
app.post('/api/auth/login',async(req,res)=>{if(!sessionSecret)return res.status(503).json({message:'Session administrateur non configurée'});const email=clean(req.body?.email||req.body?.username,180).toLowerCase(),pw=String(req.body?.password||''),ip=String(req.headers['x-forwarded-for']||req.socket.remoteAddress||'').split(',')[0].trim(),key=`${ip}:${email}`,attempt=loginAttempts.get(key)||{count:0,at:Date.now()};if(Date.now()-attempt.at>900000){attempt.count=0;attempt.at=Date.now()}if(attempt.count>=8)return res.status(429).json({message:'Trop de tentatives. Réessayez dans quelques minutes.'});if(!OWNER_PASSWORD_HASH)return res.status(503).json({message:'Authentification administrateur non configurée'});const valid=Boolean(email===OWNER_EMAIL&&await bcrypt.compare(pw,OWNER_PASSWORD_HASH));if(!valid){attempt.count+=1;loginAttempts.set(key,attempt);return res.status(401).json({message:'Identifiants invalides'})}loginAttempts.delete(key);const t=signSession(Date.now()+86400000);const secure=isProd?' Secure;':'';res.setHeader('Set-Cookie',`ynr_session=${t}; HttpOnly; SameSite=Strict;${secure} Path=/; Max-Age=86400`);res.json({ok:true})})
app.get('/api/auth/session',auth,(req,res)=>res.json({ok:true}));app.post('/api/auth/logout',auth,(req,res)=>{const secure=isProd?' Secure;':'';res.setHeader('Set-Cookie',`ynr_session=; HttpOnly; SameSite=Strict;${secure} Path=/; Max-Age=0`);res.status(204).end()})
app.get('/api/admin',auth,async(_,res)=>{res.setHeader('Cache-Control','no-store, max-age=0');res.json(await read())})
app.post('/api/requests',async(req,res)=>{
  const ip=String(req.headers['x-forwarded-for']||req.socket.remoteAddress||'').split(',')[0].trim().slice(0,100)||'unknown'
  const now=Date.now(),windowMs=15*60*1000,maxRequests=8
  const recent=(requestAttempts.get(ip)||[]).filter(t=>now-t<windowMs)
  if(recent.length>=maxRequests)return res.status(429).json({message:'Trop de demandes envoyées. Réessayez dans quelques minutes.'})
  recent.push(now);requestAttempts.set(ip,recent)
  const b=req.body||{}
  if(clean(b.website,120))return res.status(400).json({message:'Demande invalide'})
  const name=clean(b.name,120),email=clean(b.email,180).toLowerCase(),phone=clean(b.phone,40),vehicle=clean(b.vehicle,120),start=clean(b.start,20),end=clean(b.end,20),message=clean(b.message,1500)
  const emailOk=/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email),phoneOk=/^[+0-9 ()\-.]{7,40}$/.test(phone),startDate=Date.parse(start),endDate=Date.parse(end)
  if(!name||!emailOk||!phoneOk||!vehicle||!start||!end||!Number.isFinite(startDate)||!Number.isFinite(endDate)||endDate<startDate)return res.status(400).json({message:'Veuillez vérifier les champs obligatoires et les dates.'})
  const s=await read(),item={id:crypto.randomUUID(),name,email,phone,type:b.type==='professionnel'?'professionnel':'particulier',vehicle,start,end,message,status:'nouvelle',createdAt:new Date().toISOString()}
  s.requests.unshift(item);await write(s);res.status(201).json({ok:true})
})
app.patch('/api/requests/:id',auth,async(req,res)=>{const s=await read(),r=s.requests.find(x=>x.id===req.params.id);if(!r)return res.sendStatus(404);r.status=['nouvelle','en_cours','traitee'].includes(req.body.status)?req.body.status:r.status;await write(s);res.json(r)})
app.delete('/api/requests/:id',auth,async(req,res)=>{const s=await read();s.requests=s.requests.filter(x=>x.id!==req.params.id);await write(s);res.sendStatus(204)})
app.post('/api/vehicles',auth,async(req,res)=>{const b=req.body||{},s=await read(),now=new Date().toISOString();const photos=Array.isArray(b.photos)?[...new Set(b.photos.filter(x=>typeof x==='string').map(x=>clean(x,200000)).filter(Boolean))].slice(0,8):[];const v={id:crypto.randomUUID(),name:clean(b.name,120),category:clean(b.category,80),price:Math.max(0,Number(b.price)||0),deposit:Math.max(0,Number(b.deposit)||0),description:clean(b.description,1500),photos,active:b.active!==false,createdAt:now,updatedAt:now};if(!v.name)return res.status(400).json({message:'Nom requis'});if(!photos.length)return res.status(400).json({message:'Ajoutez au moins une photo du véhicule'});s.vehicles.unshift(v);await write(s);res.status(201).json(v)})
app.patch('/api/vehicles/:id',auth,async(req,res)=>{const s=await read(),v=s.vehicles.find(x=>x.id===req.params.id);if(!v)return res.sendStatus(404);const oldPhotos=Array.isArray(v.photos)?v.photos:[];const photos=Array.isArray(req.body.photos)?[...new Set(req.body.photos.filter(x=>typeof x==='string').map(x=>clean(x,200000)).filter(Boolean))].slice(0,8):oldPhotos;Object.assign(v,{name:clean(req.body.name,120)||v.name,category:clean(req.body.category,80),price:Math.max(0,Number(req.body.price??v.price)||0),deposit:Math.max(0,Number(req.body.deposit??v.deposit)||0),description:clean(req.body.description,1500),photos,active:req.body.active!==undefined?Boolean(req.body.active):v.active,updatedAt:new Date().toISOString()});if(!v.name)return res.status(400).json({message:'Nom requis'});if(!photos.length)return res.status(400).json({message:'Ajoutez au moins une photo du véhicule'});const removed=oldPhotos.filter(url=>!photos.includes(url));if(removed.length)await Promise.all(removed.map(url=>del(url).catch(()=>null)));await write(s);res.json(v)})
app.delete('/api/vehicles/:id',auth,async(req,res)=>{const s=await read(),vehicle=s.vehicles.find(x=>x.id===req.params.id);if(!vehicle)return res.sendStatus(404);if(vehicle.photos?.length)await Promise.all(vehicle.photos.map(x=>del(x).catch(()=>null)));s.vehicles=s.vehicles.filter(x=>x.id!==req.params.id);await write(s);res.sendStatus(204)})
app.put('/api/calendar',auth,async(req,res)=>{const s=await read();s.blocked=Array.isArray(req.body)?req.body.filter(x=>x.vehicleId&&x.start&&x.end).slice(0,500):[];await write(s);res.json(s.blocked)})
app.put('/api/settings',auth,async(req,res)=>{const s=await read();s.settings={...s.settings,...Object.fromEntries(Object.entries(req.body||{}).map(([k,v])=>[k,clean(v,500)]))};await write(s);res.json(s.settings)})
app.use((_,res)=>res.sendFile(path.join(root,'dist','index.html')))
if(isProd && !sessionSecret) console.error('[YNR] SESSION_SECRET is missing in production.');
if(isProd && !OWNER_PASSWORD_HASH) console.error('[YNR] OWNER_PASSWORD_HASH is missing in production.');
if(!process.env.VERCEL) app.listen(port,()=>console.log(`[YNR] API listening on ${port}`))
export default app
