import express from 'express'
import crypto from 'node:crypto'
import fs from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import bcrypt from 'bcryptjs'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const dataDir = path.join(__dirname, 'data')
const dataFile = path.join(dataDir, 'store.json')
const port = Number(process.env.PORT || 8787)
const email = process.env.OWNER_EMAIL
const passwordHash = process.env.OWNER_PASSWORD_HASH
const password = process.env.OWNER_PASSWORD
if (!email || (!passwordHash && !password)) console.warn('[YNR] Set OWNER_EMAIL and OWNER_PASSWORD_HASH (recommended) in .env.local.')
const sessions = new Map()
const seed = { vehicles: [], requests: [], unavailable: [] }
async function readStore(){ try{return JSON.parse(await fs.readFile(dataFile,'utf8'))}catch{await fs.mkdir(dataDir,{recursive:true});await fs.writeFile(dataFile,JSON.stringify(seed,null,2));return seed} }
async function writeStore(store){await fs.mkdir(dataDir,{recursive:true});await fs.writeFile(dataFile,JSON.stringify(store,null,2))}
function auth(req,res,next){const token=req.headers.cookie?.match(/ynr_session=([^;]+)/)?.[1];if(!token||!sessions.has(token))return res.status(401).json({message:'Authentification requise'});req.session=token;next()}
function safe(v){return typeof v==='string'?v.trim().slice(0,1000):''}
const app=express();app.use(express.json({limit:'100kb'}));app.use(express.static(path.join(__dirname,'dist')))
app.get('/api/session',(req,res)=>{const token=req.headers.cookie?.match(/ynr_session=([^;]+)/)?.[1];res.json({authenticated:Boolean(token&&sessions.has(token))})})
app.post('/api/auth/login',async(req,res)=>{const inputEmail=safe(req.body.email).toLowerCase();const inputPassword=String(req.body.password||'');const validEmail=email&&inputEmail===email.toLowerCase();const validPassword=passwordHash?await bcrypt.compare(inputPassword,passwordHash):password&&crypto.timingSafeEqual(Buffer.from(inputPassword),Buffer.from(password));if(!validEmail||!validPassword)return res.status(401).json({message:'Identifiants invalides'});const token=crypto.randomBytes(32).toString('hex');sessions.set(token,Date.now()+86400000);res.setHeader('Set-Cookie',`ynr_session=${token}; HttpOnly; SameSite=Strict; Path=/; Max-Age=86400`);res.json({authenticated:true})})
app.post('/api/auth/logout',auth,(req,res)=>{sessions.delete(req.session);res.setHeader('Set-Cookie','ynr_session=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0');res.status(204).end()})
app.get('/api/vehicles',async(_,res)=>res.json((await readStore()).vehicles))
app.get('/api/requests',auth,async(_,res)=>res.json((await readStore()).requests))
app.post('/api/requests',async(req,res)=>{const body=req.body||{};if(!safe(body.name)||!safe(body.email)||!safe(body.car)||!safe(body.dates))return res.status(400).json({message:'Champs requis manquants'});const store=await readStore();const item={id:crypto.randomUUID(),name:safe(body.name),email:safe(body.email),car:safe(body.car),dates:safe(body.dates),message:safe(body.message),status:'Nouveau',createdAt:new Date().toISOString()};store.requests.unshift(item);await writeStore(store);res.status(201).json(item)})
app.patch('/api/requests/:id',auth,async(req,res)=>{const store=await readStore();const item=store.requests.find(x=>x.id===req.params.id);if(!item)return res.status(404).json({message:'Demande introuvable'});item.status=req.body.status==='Traité'?'Traité':'Nouveau';await writeStore(store);res.json(item)})
app.delete('/api/requests/:id',auth,async(req,res)=>{const store=await readStore();store.requests=store.requests.filter(x=>x.id!==req.params.id);await writeStore(store);res.status(204).end()})
app.get('/api/unavailable',auth,async(_,res)=>res.json((await readStore()).unavailable))
app.put('/api/unavailable',auth,async(req,res)=>{const store=await readStore();store.unavailable=Array.isArray(req.body)?req.body:[];await writeStore(store);res.json(store.unavailable)})
app.use((req,res)=>res.sendFile(path.join(__dirname,'dist','index.html')))
app.listen(port,()=>console.log(`[YNR] backend listening on ${port}`))

export default app
