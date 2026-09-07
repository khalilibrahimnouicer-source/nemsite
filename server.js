import express from 'express'
import crypto from 'node:crypto'
import fs from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import bcrypt from 'bcryptjs'

const root=path.dirname(fileURLToPath(import.meta.url))
const app=express()
const isProd=Boolean(process.env.VERCEL||process.env.NODE_ENV==='production')
const PORT=Number(process.env.PORT||8787)
const OWNER_EMAIL=String(process.env.OWNER_EMAIL||'ynr.location@gmail.com').trim().toLowerCase()
const OWNER_PASSWORD_HASH=String(process.env.OWNER_PASSWORD_HASH||'').trim()
const SESSION_SECRET=String(process.env.SESSION_SECRET||'').trim()
const DATA_FILE=path.join(root,'data','store.json')
const phone='07 46 38 99 31'
const whatsapp='https://wa.me/33746389931'

const seed={
 settings:{brand:'YNR Luxury',tagline:'Location de véhicules premium.',phone,email:'ynr.location@gmail.com',whatsapp,instagram:'https://instagram.com/ynr_location'},
 vehicles:[{id:'demo-bmw-m3',name:'BMW M3 Competition',category:'Berline sportive',price:490,deposit:3000,description:'Une sportive précise et spectaculaire, pensée pour les déplacements professionnels comme les escapades.',photos:['https://images.unsplash.com/photo-1555215695-3004980ad54e?auto=format&fit=crop&w=1800&q=85'],active:true,createdAt:new Date().toISOString()}],
 requests:[],blocked:[]
}
let memory=structuredClone(seed)
const loginAttempts=new Map(), requestAttempts=new Map()

function clean(v,max=1000){return typeof v==='string'?v.trim().slice(0,max):''}
function sign(exp){return `${exp}.${crypto.createHmac('sha256',SESSION_SECRET).update(String(exp)).digest('hex')}`}
function validSession(t){if(!SESSION_SECRET)return false;const [exp,sig]=String(t||'').split('.');if(!exp||!sig||Number(exp)<=Date.now())return false;const expected=crypto.createHmac('sha256',SESSION_SECRET).update(exp).digest('hex');return sig.length===expected.length&&crypto.timingSafeEqual(Buffer.from(sig),Buffer.from(expected))}
function getCookie(req){return req.headers.cookie?.match(/(?:^|;\s*)ynr_session=([^;]+)/)?.[1]||''}
function auth(req,res,next){if(!validSession(getCookie(req)))return res.status(401).json({message:'Authentification requise'});next()}

async function supabase(pathname,options={}){
 const url=clean(process.env.SUPABASE_URL,500), key=clean(process.env.SUPABASE_SERVICE_ROLE_KEY,500)
 if(!url||!key) return null
 const r=await fetch(`${url}/rest/v1/${pathname}`,{...options,headers:{apikey:key,Authorization:`Bearer ${key}`,'Content-Type':'application/json',Prefer:'return=representation',...(options.headers||{})}})
 if(!r.ok) throw new Error(`Supabase ${r.status}: ${await r.text()}`)
 return r.status===204?null:r.json()
}
async function readStore(){
 if(process.env.SUPABASE_URL&&process.env.SUPABASE_SERVICE_ROLE_KEY){
  try{
   const [settings,vehicles,requests,blocked]=await Promise.all([
    supabase('ynr_settings?select=key,value'),supabase('ynr_vehicles?select=*'),supabase('ynr_requests?select=*&order=created_at.desc'),supabase('ynr_blocked?select=*')
   ])
   if(settings===null) throw new Error('Supabase non configuré')
   const s=Object.fromEntries((settings||[]).map(x=>[x.key,x.value]))
   return {settings:{...seed.settings,...s},vehicles:(vehicles||[]).map(v=>({id:v.id,name:v.name,category:v.type,price:Number(v.price_per_day),deposit:v.deposit,description:v.description||'',photos:v.image_url?[v.image_url]:[],active:v.status!=='hidden',createdAt:v.created_at})),requests:(requests||[]).map(r=>({id:r.id,name:r.customer_name,email:r.customer_email,phone:r.customer_phone||'',vehicle:r.vehicle_name||'Véhicule',vehicleId:r.vehicle_id,start:r.start_date,end:r.end_date,message:r.message||'',status:r.status,createdAt:r.created_at})),blocked:(blocked||[]).map(b=>({id:b.id,vehicleId:b.vehicle_id,start:b.start_date,end:b.end_date}))}
  }catch(e){console.error('[YNR] database read failed:',e.message); throw e}
 }
 try{memory=JSON.parse(await fs.readFile(DATA_FILE,'utf8'));return structuredClone(memory)}catch{return structuredClone(memory)}
}
async function writeStore(store){
 memory=structuredClone(store)
 if(process.env.SUPABASE_URL&&process.env.SUPABASE_SERVICE_ROLE_KEY) throw new Error('Use database-specific mutations')
 if(!isProd){await fs.mkdir(path.dirname(DATA_FILE),{recursive:true});await fs.writeFile(DATA_FILE,JSON.stringify(store,null,2))}
}

app.disable('x-powered-by')
app.use((_,res,next)=>{res.setHeader('X-Content-Type-Options','nosniff');res.setHeader('X-Frame-Options','DENY');res.setHeader('Referrer-Policy','strict-origin-when-cross-origin');res.setHeader('Permissions-Policy','camera=(), microphone=(), geolocation=()');res.setHeader('Cross-Origin-Opener-Policy','same-origin');if(isProd)res.setHeader('Strict-Transport-Security','max-age=31536000; includeSubDomains');next()})
app.use(express.json({limit:'1mb'}))
app.use(express.static(path.join(root,'dist')))

app.get('/api/health',(_,res)=>res.json({ok:true,storage:process.env.SUPABASE_URL?'supabase':'local'}))
app.get('/api/public',async(req,res)=>{try{res.setHeader('Cache-Control','no-store');const s=await readStore();const vehicles=s.vehicles.filter(v=>v.active).sort((a,b)=>new Date(b.createdAt||0)-new Date(a.createdAt||0));res.json({settings:s.settings,vehicles,blocked:s.blocked})}catch(e){console.error('[YNR] /api/public:',e);res.status(503).json({message:'Le catalogue est temporairement indisponible. Réessayez dans un instant.'})}})

app.post('/api/auth/login',async(req,res)=>{if(!SESSION_SECRET||!OWNER_PASSWORD_HASH)return res.status(503).json({message:'Authentification administrateur non configurée'});const email=clean(req.body?.email,180).toLowerCase(),pw=String(req.body?.password||''),ip=String(req.headers['x-forwarded-for']||req.socket.remoteAddress||'').split(',')[0],key=`${ip}:${email}`;const a=loginAttempts.get(key)||{count:0,at:Date.now()};if(Date.now()-a.at>900000){a.count=0;a.at=Date.now()}if(a.count>=8)return res.status(429).json({message:'Trop de tentatives. Réessayez plus tard.'});const ok=email===OWNER_EMAIL&&await bcrypt.compare(pw,OWNER_PASSWORD_HASH);if(!ok){a.count++;loginAttempts.set(key,a);return res.status(401).json({message:'Identifiants invalides'})}loginAttempts.delete(key);const secure=isProd?' Secure;':'';res.setHeader('Set-Cookie',`ynr_session=${sign(Date.now()+86400000)}; HttpOnly; SameSite=Strict;${secure} Path=/; Max-Age=86400`);res.json({ok:true})})
app.post('/api/auth/logout',auth,(req,res)=>{const secure=isProd?' Secure;':'';res.setHeader('Set-Cookie',`ynr_session=; HttpOnly; SameSite=Strict;${secure} Path=/; Max-Age=0`);res.status(204).end()})
app.get('/api/auth/session',auth,(_,res)=>res.json({ok:true}))

app.get('/api/admin',auth,async(_,res)=>{try{res.setHeader('Cache-Control','no-store');res.json(await readStore())}catch(e){console.error('[YNR] /api/admin:',e);res.status(503).json({message:'Administration temporairement indisponible.'})}})

app.post('/api/requests',async(req,res)=>{const ip=String(req.headers['x-forwarded-for']||req.socket.remoteAddress||'').split(',')[0].slice(0,100),now=Date.now();const recent=(requestAttempts.get(ip)||[]).filter(x=>now-x<900000);if(recent.length>=8)return res.status(429).json({message:'Trop de demandes. Réessayez plus tard.'});recent.push(now);requestAttempts.set(ip,recent);const b=req.body||{};if(clean(b.website,50))return res.status(400).json({message:'Demande invalide'});const name=clean(b.name,100),email=clean(b.email,254).toLowerCase(),phoneIn=clean(b.phone,40),vehicleId=clean(b.vehicleId,100),vehicle=clean(b.vehicle,150),start=clean(b.start,20),end=clean(b.end,20),message=clean(b.message,2000);if(!name||!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)||!/^[+0-9 ()\-.]{7,40}$/.test(phoneIn)||!vehicle||!start||!end||Number.isNaN(Date.parse(start))||Number.isNaN(Date.parse(end))||Date.parse(end)<Date.parse(start))return res.status(400).json({message:'Vérifiez les informations saisies.'});try{if(process.env.SUPABASE_URL&&process.env.SUPABASE_SERVICE_ROLE_KEY){await supabase('ynr_requests',{method:'POST',body:JSON.stringify({vehicle_id:vehicleId||null,vehicle_name:vehicle,customer_name:name,customer_email:email,customer_phone:phoneIn,start_date:start,end_date:end,message,status:'new'})})}else{const s=await readStore();s.requests.unshift({id:crypto.randomUUID(),name,email,phone:phoneIn,vehicleId,vehicle,start,end,message,status:'nouvelle',createdAt:new Date().toISOString()});await writeStore(s)}res.json({ok:true})}catch(e){console.error('[YNR] request:',e);res.status(503).json({message:'Impossible d’enregistrer la demande pour le moment.'})}})

app.post('/api/vehicles',auth,async(req,res)=>{const b=req.body||{};const v={id:clean(b.id,100)||crypto.randomUUID(),name:clean(b.name,120),category:clean(b.category,100)||'Véhicule premium',price:Number(b.price)||0,deposit:Number(b.deposit)||0,description:clean(b.description,2000),photos:Array.isArray(b.photos)?b.photos.map(x=>clean(x,2000)).filter(Boolean).slice(0,8):[],active:b.active!==false,createdAt:b.createdAt||new Date().toISOString()};if(!v.name)return res.status(400).json({message:'Nom du véhicule requis.'});try{if(process.env.SUPABASE_URL&&process.env.SUPABASE_SERVICE_ROLE_KEY){const row={id:v.id,name:v.name,type:v.category,price_per_day:v.price,deposit:v.deposit,description:v.description,image_url:v.photos[0]||null,status:v.active?'available':'hidden'};await supabase(`ynr_vehicles?id=eq.${encodeURIComponent(v.id)}`,{method:'DELETE',headers:{Prefer:'return=minimal'}});const rows=await supabase('ynr_vehicles',{method:'POST',body:JSON.stringify(row)});return res.status(201).json(v)}const s=await readStore();const i=s.vehicles.findIndex(x=>x.id===v.id);if(i>=0)s.vehicles[i]={...s.vehicles[i],...v};else s.vehicles.push(v);await writeStore(s);res.status(201).json(v)}catch(e){console.error(e);res.status(503).json({message:'Impossible d’enregistrer le véhicule.'})}})
app.delete('/api/vehicles/:id',auth,async(req,res)=>{try{if(process.env.SUPABASE_URL&&process.env.SUPABASE_SERVICE_ROLE_KEY)await supabase(`vehicles?id=eq.${encodeURIComponent(req.params.id)}`,{method:'DELETE'});else{const s=await readStore();s.vehicles=s.vehicles.filter(v=>v.id!==req.params.id);await writeStore(s)}res.status(204).end()}catch(e){res.status(503).json({message:'Impossible de supprimer le véhicule.'})}})
app.put('/api/settings',auth,async(req,res)=>{try{const s=await readStore();s.settings={...s.settings,...req.body};if(process.env.SUPABASE_URL&&process.env.SUPABASE_SERVICE_ROLE_KEY){for(const [key,value] of Object.entries(s.settings)){await supabase(`ynr_settings?key=eq.${encodeURIComponent(key)}`,{method:'DELETE'});await supabase('ynr_settings',{method:'POST',body:JSON.stringify({key,value})})}}else await writeStore(s);res.json(s.settings)}catch(e){res.status(503).json({message:'Impossible d’enregistrer les réglages.'})}})
app.patch('/api/requests/:id',auth,async(req,res)=>{try{const status=clean(req.body?.status,30);if(process.env.SUPABASE_URL&&process.env.SUPABASE_SERVICE_ROLE_KEY){const rows=await supabase(`booking_requests?id=eq.${encodeURIComponent(req.params.id)}`,{method:'PATCH',body:JSON.stringify({status,updated_at:new Date().toISOString()})});return res.json(rows?.[0]||{id:req.params.id,status})}const s=await readStore(),r=s.requests.find(x=>x.id===req.params.id);if(!r)return res.status(404).json({message:'Demande introuvable'});r.status=status;await writeStore(s);res.json(r)}catch(e){res.status(503).json({message:'Impossible de mettre à jour la demande.'})}})
app.delete('/api/requests/:id',auth,async(req,res)=>{try{if(process.env.SUPABASE_URL&&process.env.SUPABASE_SERVICE_ROLE_KEY)await supabase(`booking_requests?id=eq.${encodeURIComponent(req.params.id)}`,{method:'DELETE'});else{const s=await readStore();s.requests=s.requests.filter(x=>x.id!==req.params.id);await writeStore(s)}res.status(204).end()}catch(e){res.status(503).json({message:'Impossible de supprimer la demande.'})}})

app.use((req,res,next)=>{if(req.path.startsWith('/api/')) return next(); if(req.method==='GET') return res.sendFile(path.join(root,'dist','index.html')); next()})

if(!process.env.VERCEL)app.listen(PORT,()=>console.log(`[YNR] http://localhost:${PORT}`))
export default app
