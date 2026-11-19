import React,{useEffect,useMemo,useState} from 'react'
import {createRoot} from 'react-dom/client'
import {Archive,RotateCcw,ArrowUpRight,CalendarDays,Check,ChevronDown,ChevronLeft,ChevronRight,Eye,EyeOff,ImagePlus,LogIn,LogOut,Menu,MessageCircle,Plus,Settings,ShieldCheck,Trash2,X} from 'lucide-react'
import './styles.css'
import Showroom from './Showroom'
import './product.css'

const WA='https://wa.me/33746389931',PHONE='07 46 38 99 31'
async function api(path,options={}){const r=await fetch('/api'+path,{credentials:'include',cache:'no-store',...options,headers:{'Content-Type':'application/json',...(options.headers||{})}});const d=await r.json().catch(()=>null);if(!r.ok)throw new Error(d?.message||`Erreur ${r.status}`);return d}
function Logo(){return <img className="logo" src="/ynr-luxury-new.jpg" alt="YNR Location — YNR Luxury, location de voitures de luxe"/>}
function normalizeClientStore(value){const source=value&&typeof value==='object'?value:{};return {settings:source.settings&&typeof source.settings==='object'?source.settings:{},vehicles:Array.isArray(source.vehicles)?source.vehicles:[],requests:Array.isArray(source.requests)?source.requests:[],blocked:Array.isArray(source.blocked)?source.blocked:[]}}function getCart(){try{return JSON.parse(localStorage.getItem('ynr-cart')||'[]')}catch{return []}}function setCart(items){localStorage.setItem('ynr-cart',JSON.stringify(items));window.dispatchEvent(new Event('ynr-cart-change'))}function CartWidget(){const [items,setItems]=useState([]),[open,setOpen]=useState(false);useEffect(()=>{const sync=()=>setItems(getCart());sync();window.addEventListener('ynr-cart-change',sync);return()=>window.removeEventListener('ynr-cart-change',sync)},[]);return <><button className="cart-fab" type="button" onClick={()=>setOpen(true)} aria-label={`Ouvrir le panier, ${items.length} véhicule(s)`}>Panier <strong>{items.length}</strong></button>{open&&<div className="cart-backdrop" onMouseDown={e=>e.target===e.currentTarget&&setOpen(false)}><aside className="cart-panel"><button className="close" onClick={()=>setOpen(false)} aria-label="Fermer">×</button><p className="eyebrow">VOTRE SÉLECTION</p><h2>Panier</h2>{items.length===0?<p className="muted">Votre panier est vide.</p>:items.map(item=><div className="cart-item" key={item.id}><a href={`/vehicle/${encodeURIComponent(item.id)}`}>{item.name}</a><button onClick={()=>setCart(items.filter(x=>x.id!==item.id))}>Supprimer</button></div>)}{items.length>0&&<button className="btn" onClick={()=>{setOpen(false);location.href=`/vehicle/${encodeURIComponent(items[0].id)}`}}>Réserver un véhicule</button>}</aside></div>}</>}
function formatPricing(vehicle){const p=vehicle?.pricing||{};const discount=Math.max(0,Number(p.discount)||0);const base=Number(p.weekday24h??vehicle?.price)||0;const final=Math.round(base*(1-discount/100));return {base,final,discount,weekend48h:Number(p.weekend48h)||base*2,weekend72h:Number(p.weekend72h)||base*3,week7d:Number(p.week7d)||base*7,month30d:Number(p.month30d)||base*30}}
function isPriceVisible(vehicle,key){return vehicle?.visiblePrices?.[key]!==false}function PriceDisplay({vehicle,compact=false}){const p=formatPricing(vehicle);if(!isPriceVisible(vehicle,'weekday24h'))return null;return <div className="price-display"><strong>{p.final} €</strong>{p.discount>0&&<><del>{p.base} €</del><small>-{p.discount}%</small></>}{!compact&&<span>/ 24h semaine</span>}</div>}
function App(){if(location.pathname.startsWith('/admin'))return <Admin/>;const productMatch=location.pathname.match(/^\/vehicle\/([^/]+)/);return <><CartWidget/>{productMatch?<ProductPage id={decodeURIComponent(productMatch[1])}/>:<Public/>}</>}
function ProductPage({id}) {
  const [vehicle, setVehicle] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [attempt, setAttempt] = useState(0)
  const [activePhoto, setActivePhoto] = useState(0)
  const [requestOpen, setRequestOpen] = useState(false)
  const [sent, setSent] = useState(false)
  const [inCart, setInCart] = useState(false)
  const touch = React.useRef(null)
  const requestButton = React.useRef(null)

  useEffect(() => {
    let current = true
    setLoading(true)
    setError('')
    setActivePhoto(0)
    async function loadVehicle() {
      try {
        let record
        try {
          record = await api('/vehicles/' + encodeURIComponent(id))
        } catch (detailError) {
          const catalogue = await api('/public')
          record = catalogue?.vehicles?.find(item => String(item.id) === String(id))
          if (!record) throw detailError
        }
        if (current) setVehicle(record)
      } catch (failure) {
        if (current) setError(failure.message)
      } finally {
        if (current) setLoading(false)
      }
    }
    loadVehicle()
    return () => { current = false }
  }, [id, attempt])

  useEffect(() => {
    const sync = () => setInCart(getCart().some(item => String(item.id) === String(id)))
    sync()
    window.addEventListener('storage', sync)
    window.addEventListener('ynr-cart-change', sync)
    return () => {
      window.removeEventListener('storage', sync)
      window.removeEventListener('ynr-cart-change', sync)
    }
  }, [id])

  if (sent) return <ConfirmationModal/>
  const photos = Array.from(new Set((vehicle?.photos || []).filter(Boolean)))
  const pricing = formatPricing(vehicle)
  const rates = [
    ['weekday24h', '24 h en semaine', pricing.final],
    ['weekend48h', 'Week-end · 48 h', pricing.weekend48h],
    ['weekend72h', 'Week-end · 72 h', pricing.weekend72h],
    ['week7d', '7 jours', pricing.week7d],
    ['month30d', '30 jours', pricing.month30d],
  ].filter(([key]) => isPriceVisible(vehicle, key))
  const money = amount => new Intl.NumberFormat('fr-FR', {
    style: 'currency', currency: 'EUR', minimumFractionDigits: 0, maximumFractionDigits: 2,
  }).format(amount)
  const movePhoto = delta => setActivePhoto(index => (index + delta + photos.length) % photos.length)
  function closeRequest() {
    setRequestOpen(false)
    requestAnimationFrame(() => requestButton.current?.focus())
  }

  return <div className="ynr-detail">
    <header className="yd-header">
      <a className="yd-brand" href="/" aria-label="YNR Location, accueil"><Logo/><span>YNR <b>Location</b></span></a>
      <a className="yd-back" href="/#fleet"><ChevronLeft size={17}/> Retour à la flotte</a>
    </header>
    {loading ? <main className="yd-state" aria-busy="true"><p role="status">Chargement de la fiche…</p></main> :
      error || !vehicle ? <main className="yd-state"><h1>Véhicule indisponible</h1><p role="alert">{error || 'La fiche de ce véhicule est indisponible.'}</p><button type="button" className="yd-secondary" onClick={() => setAttempt(value => value + 1)}>Réessayer</button></main> :
      <main className="yd-layout">
        <section className="yd-media" aria-label={'Galerie de ' + vehicle.name}>
          <div className="yd-stage" tabIndex={photos.length > 1 ? 0 : undefined}
            aria-label={photos.length > 1 ? 'Galerie, utiliser les flèches du clavier pour changer de photo' : undefined}
            role={photos.length > 1 ? 'group' : undefined}
            onKeyDown={event => {
              if (photos.length < 2) return
              if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
                event.preventDefault()
                movePhoto(event.key === 'ArrowRight' ? 1 : -1)
              }
            }}
            onTouchStart={event => { touch.current = event.touches.length === 1 ? [event.touches[0].clientX, event.touches[0].clientY] : null }}
            onTouchCancel={() => { touch.current = null }}
            onTouchEnd={event => {
              if (!touch.current || photos.length < 2) return
              const dx = event.changedTouches[0].clientX - touch.current[0]
              const dy = event.changedTouches[0].clientY - touch.current[1]
              touch.current = null
              if (Math.abs(dx) > 55 && Math.abs(dx) > Math.abs(dy) * 1.4) movePhoto(dx < 0 ? 1 : -1)
            }}>
            {photos.length ? <img key={photos[activePhoto]} className="yd-shot" src={photos[activePhoto]} alt={vehicle.name + ' — vue ' + (activePhoto + 1)} decoding="async" fetchPriority="high"/> :
              <div className="yd-no-photo"><Logo/><span>Photos à venir</span></div>}
          </div>
          {photos.length > 0 && <div className="yd-gallery-bar">
            <span aria-live="polite">Photo {activePhoto + 1} <span className="yd-dim">/ {photos.length}</span></span>
            {photos.length > 1 && <div className="yd-arrows">
              <button type="button" aria-label="Photo précédente" onClick={() => movePhoto(-1)}><ChevronLeft size={18}/></button>
              <button type="button" aria-label="Photo suivante" onClick={() => movePhoto(1)}><ChevronRight size={18}/></button>
            </div>}
          </div>}
          {photos.length > 1 && <div className="yd-thumbs" aria-label="Choisir une photo">{photos.map((photo, index) =>
            <button type="button" key={photo} aria-label={'Voir la photo ' + (index + 1)} aria-pressed={index === activePhoto} onClick={() => setActivePhoto(index)}>
              <img src={photo} alt="" loading="lazy" decoding="async"/>
            </button>)}</div>}
        </section>
        <article className="yd-copy">
          <p className="yd-category">{vehicle.category || 'La flotte YNR'}</p>
          <h1>{vehicle.name}</h1>
          {vehicle.description && <p className="yd-description">{vehicle.description}</p>}
          <div className="yd-actions">
            <button ref={requestButton} type="button" className="yd-primary" onClick={() => setRequestOpen(true)}>Demander ce véhicule <ArrowUpRight size={18}/></button>
            <button type="button" className="yd-secondary" disabled={inCart} onClick={() => {
              const items = getCart()
              if (!items.some(item => String(item.id) === String(vehicle.id))) setCart([...items, {id: vehicle.id, name: vehicle.name}])
            }}>{inCart ? <Check size={16}/> : <Plus size={16}/>} {inCart ? 'Ajouté au panier' : 'Ajouter au panier'}</button>
          </div>
          {rates.length > 0 && <section className="yd-pricing"><h2>Tarifs de location</h2><dl>{rates.map(([key, label, amount]) =>
            <div key={key}><dt>{label}</dt><dd>{key === 'weekday24h' && pricing.discount > 0 && <del>{money(pricing.base)}</del>} {money(amount)}</dd></div>
          )}</dl></section>}
          {vehicle.deposit > 0 && isPriceVisible(vehicle, 'deposit') && <div className="yd-deposit"><span>Caution</span><strong>{money(vehicle.deposit)}</strong></div>}
        </article>
      </main>}
    {requestOpen && vehicle && <RequestModal vehicle={vehicle} onClose={closeRequest} onSent={() => { setRequestOpen(false); setSent(true) }}/>}
  </div>
}

function ConfirmationModal(){return <div className="modal-backdrop"><div className="modal confirmation-modal"><div className="confirmation-icon"><Check size={48}/></div><h2>Demande reçue</h2><p>Merci pour votre intérêt ! Nous examinerons votre demande et vous recontacterons rapidement par e-mail ou téléphone.</p><p className="confirmation-subtitle">Vérifiez vos documents et votre numéro de téléphone — c'est par là que nous vous joindrons.</p><button className="btn" onClick={()=>location.href='/'}>Retourner à la flotte</button></div></div>}function Public() {
  return <Showroom api={api} formatPricing={formatPricing} logo={<Logo/>} defaultWhatsApp={WA} defaultPhone={PHONE}/>
}
function RequestModal({vehicle,onClose,onSent}){const [form,setForm]=useState({name:'',email:'',phone:'',start:'',end:'',message:'',documents:{}}),[busy,setBusy]=useState(false),[error,setError]=useState('');async function readDocument(type,file){if(!file)return;const reader=new FileReader();reader.onload=()=>setForm(current=>({...current,documents:{...current.documents,[type]:{name:file.name,data:reader.result}}}));reader.readAsDataURL(file)}async function submit(e){e.preventDefault();setBusy(true);setError('');try{await api('/requests',{method:'POST',body:JSON.stringify({...form,vehicle:vehicle.name,vehicleId:vehicle.id})});onSent()}catch(e){setError(e.message)}finally{setBusy(false)}}return <div className="modal-backdrop" onMouseDown={e=>e.target===e.currentTarget&&onClose()}><form className="modal" onSubmit={submit}><button type="button" className="close" onClick={onClose}><X/></button><p className="eyebrow">DEMANDE DE RÉSERVATION</p><h2>{vehicle.name}</h2><PriceDisplay vehicle={vehicle}/><p className="modal-prices">{[['weekend48h',`48h week-end : ${formatPricing(vehicle).weekend48h} €`],['weekend72h',`72h : ${formatPricing(vehicle).weekend72h} €`],['week7d',`7 jours : ${formatPricing(vehicle).week7d} €`],['month30d',`30 jours : ${formatPricing(vehicle).month30d} €`],['deposit',vehicle.deposit?`caution ${vehicle.deposit} €`:null]].filter(([key])=>isPriceVisible(vehicle,key)).map(([,label])=>label).filter(Boolean).join(' · ')}</p><div className="form-grid"><label>Nom<input required value={form.name} onChange={e=>setForm({...form,name:e.target.value})}/></label><label>E-mail<input required type="email" value={form.email} onChange={e=>setForm({...form,email:e.target.value})}/></label><label>Téléphone<input required value={form.phone} onChange={e=>setForm({...form,phone:e.target.value})}/></label><label>Date de départ<input required type="date" value={form.start} onChange={e=>setForm({...form,start:e.target.value})}/></label><label>Date de retour<input required type="date" value={form.end} onChange={e=>setForm({...form,end:e.target.value})}/></label><label className="wide">Message<textarea rows="4" value={form.message} onChange={e=>setForm({...form,message:e.target.value})}/></label></div><fieldset className="documents-upload wide"><legend>Documents nécessaires</legend><p>Ajoutez une photo ou un PDF de votre CNI, de votre permis et d’un justificatif de domicile de moins de 3 mois.</p>{[['identity','CNI'],['license','Permis de conduire'],['address','Justificatif de domicile (-3 mois)']].map(([type,label])=><label key={type}>{label}<input required type="file" accept="image/jpeg,image/png,image/webp,application/pdf" onChange={e=>readDocument(type,e.target.files?.[0])}/><small>{form.documents[type]?.name||'Aucun fichier sélectionné'}</small></label>)}</fieldset><p className="document-note wide">Vos documents sont stockés de manière privée et leur nom est chiffré.</p>{error&&<p className="form-error">{error}</p>}<button className="btn wide-btn" disabled={busy}>{busy?'Envoi…':'Envoyer ma demande'} <ArrowUpRight size={17}/></button><small className="privacy">Aucun paiement en ligne. Vos informations servent uniquement à traiter votre demande.</small></form></div>}
function Admin(){
  const [logged,setLogged]=useState(false),[checking,setChecking]=useState(true),[data,setData]=useState({settings:{},vehicles:[],requests:[],blocked:[]}),[tab,setTab]=useState('vehicles'),[error,setError]=useState(''),[menuOpen,setMenuOpen]=useState(false)
  useEffect(()=>{api('/auth/session').then(()=>{setLogged(true);return api('/admin')}).then(result=>setData(normalizeClientStore(result))).catch(e=>setError(e.message)).finally(()=>setChecking(false))},[])
  if(checking)return <div className="admin-loading">Chargement…</div>
  if(!logged)return <Login onLogin={async()=>{try{const result=await api('/admin');setData(normalizeClientStore(result));setLogged(true);setError('')}catch(e){setError(e.message);throw e}}}/>
  const archiveCount=data.vehicles.filter(v=>Boolean(v.archivedAt)).length
  const menu=[['vehicles','Flotte'],['archives','Archives'],['requests','Demandes'],['settings','Réglages']]
  return <div className="admin"><button className="admin-menu-toggle" type="button" aria-label="Ouvrir le menu administrateur" onClick={()=>setMenuOpen(value=>!value)}><Menu/></button><aside className={menuOpen?'open':''}><a href="/"><Logo/></a><p>ESPACE PROPRIÉTAIRE</p>{menu.map(([id,label])=><button className={tab===id?'active':''} onClick={()=>{setTab(id);setMenuOpen(false)}} key={id}>{id==='vehicles'?<CalendarDays/>:id==='archives'?<Archive/>:id==='requests'?<MessageCircle/>:<Settings/>}{label}{id==='archives'&&archiveCount>0?<span className="archive-nav-count">{archiveCount}</span>:null}</button>)}<button className="logout" onClick={async()=>{await api('/auth/logout',{method:'POST'});location.reload()}}><LogOut/> Déconnexion</button></aside><main><header className="admin-head"><div><p className="eyebrow">YNR LUXURY · ADMIN</p><h1>{tab==='vehicles'?'Votre flotte':tab==='archives'?'Archives':tab==='requests'?'Demandes reçues':'Réglages'}</h1></div><a href="/" target="_blank" rel="noreferrer">Voir le site <ArrowUpRight size={15}/></a></header>{error&&<div className="notice">{error}</div>}{(tab==='vehicles'||tab==='archives')?<VehicleAdmin key={tab} archived={tab==='archives'} data={data} setData={setData}/>:tab==='requests'?<RequestsAdmin data={data} setData={setData}/>:<SettingsAdmin data={data} setData={setData}/>}</main></div>
}
function Login({onLogin}){const [email,setEmail]=useState(''),[password,setPassword]=useState(''),[showPassword,setShowPassword]=useState(false),[error,setError]=useState(''),[busy,setBusy]=useState(false);async function submit(e){e.preventDefault();setBusy(true);setError('');try{await api('/auth/login',{method:'POST',body:JSON.stringify({email,password})});await onLogin()}catch(e){setError(e.message||'Connexion impossible. Vérifiez vos identifiants.')}finally{setBusy(false)}}return <div className="login"><div className="login-art"><Logo/><p>YNR LUXURY</p><h1>Le contrôle<br/><i>de votre flotte.</i></h1></div><form onSubmit={submit} className="login-card"><Logo/><p className="eyebrow">ESPACE PROPRIÉTAIRE</p><h2>Connexion</h2><label>E-mail<input required type="email" autoComplete="username" value={email} onChange={e=>setEmail(e.target.value)} /></label><label>Mot de passe<div className="password-field"><input required type={showPassword?'text':'password'} autoComplete="current-password" value={password} onChange={e=>setPassword(e.target.value)}/><button type="button" className="password-toggle" aria-label={showPassword?'Masquer le mot de passe':'Afficher le mot de passe'} aria-pressed={showPassword} onClick={()=>setShowPassword(value=>!value)}>{showPassword?<EyeOff size={17}/>:<Eye size={17}/>}</button></div></label>{error&&<p className="form-error" role="alert">{error}</p>}<button className="btn" disabled={busy}>{busy?'Connexion…':'Se connecter'} <LogIn size={16}/></button><a href="/">← Retour au site</a></form></div>}
function VehicleAdmin({data,setData,archived=false}){
  const [editing,setEditing]=useState(null),[busy,setBusy]=useState(false),[notice,setNotice]=useState(''),[workingId,setWorkingId]=useState(null)
  const all=Array.isArray(data?.vehicles)?data.vehicles:[]
  const vehicles=all.filter(v=>archived?Boolean(v.archivedAt):!v.archivedAt)
  async function reload(){const refreshed=normalizeClientStore(await api('/admin',{cache:'no-store'}));setData(refreshed);return refreshed}
  async function save(v){
    if(workingId||busy)return
    setBusy(true);setNotice('')
    try{
      const result=await api('/vehicles',{method:'POST',body:JSON.stringify(v)})
      const refreshed=await reload()
      const saved=refreshed.vehicles.find(item=>item.id===result.id&&!item.archivedAt)
      if(!saved)throw new Error('Enregistrement non confirmé après actualisation.')
      const selectedPhotos=[...new Set((v.photos||[]).filter(Boolean))]
      if(JSON.stringify(saved.photos||[])!==JSON.stringify(selectedPhotos))throw new Error('Les photos enregistrées ne correspondent pas à votre sélection. Vérifiez avant de fermer.')
      setEditing(null)
      setNotice(result.photoCleanupWarning?'Véhicule enregistré. Certaines anciennes photos restent dans le stockage.':'Véhicule enregistré et vérifié.')
    }catch(error){setNotice('Enregistrement non confirmé : '+error.message)}
    finally{setBusy(false)}
  }
  async function runAction(vehicle,action){
    if(busy||workingId)return
    const id=String(vehicle.id)
    if(action==='archive'&&!confirm('Archiver « '+vehicle.name+' » ? Le véhicule sera retiré du site, mais les photos, tarifs et informations resteront sauvegardés.'))return
    if(action==='permanent'){
      const answer=prompt('Supprimer DÉFINITIVEMENT « '+vehicle.name+' » et ses photos non utilisées ? Cette opération est irréversible. Tapez SUPPRIMER pour confirmer :','')
      if(answer!=='SUPPRIMER')return
    }
    setWorkingId(id);setNotice(action==='archive'?'Archivage en cours…':action==='restore'?'Remise en ligne en cours…':'Suppression définitive en cours…')
    try{
      const suffix=action==='archive'?'':action==='restore'?'/restore':'/permanent'
      const options=action==='restore'?{method:'PATCH'}:action==='permanent'?{method:'DELETE',body:JSON.stringify({confirmation:'SUPPRIMER'})}:{method:'DELETE'}
      const result=await api('/vehicles/'+encodeURIComponent(id)+suffix,options)
      const expected=action==='archive'?'archived':action==='restore'?'restored':'permanentlyDeleted'
      if(!result?.ok||result.id!==id||result[expected]!==true)throw new Error('Réponse du serveur non confirmée.')
      const refreshed=await reload()
      const stored=refreshed.vehicles.find(item=>String(item.id)===id)
      if(action==='archive'&&!stored?.archivedAt)throw new Error('Le véhicule ne figure pas dans les archives.')
      if(action==='restore'&&(!stored||stored.archivedAt||stored.active===false))throw new Error('Le véhicule n’est pas encore remis en ligne.')
      if(action==='permanent'&&stored)throw new Error('Le véhicule figure encore dans les archives.')
      setEditing(null)
      setNotice(action==='archive'?'Véhicule archivé. Ses données et photos sont conservées.':action==='restore'?'Véhicule remis en ligne avec ses informations et photos.':result.photoCleanupWarning?'Véhicule définitivement supprimé. Certaines photos inutilisées n’ont pas pu être effacées du stockage.':'Véhicule définitivement supprimé et absence confirmée.')
    }catch(error){
      try{await reload()}catch{}
      setNotice('Opération non confirmée : '+(error.message||'Erreur inconnue'))
    }finally{setWorkingId(null)}
  }
  async function setFeatured(vehicle){
    if(busy||workingId)return
    setNotice('Mise à jour du véhicule à l’affiche…')
    try{await api('/vehicles/'+encodeURIComponent(vehicle.id)+'/featured',{method:'PATCH'});await reload();setNotice('Véhicule à l’affiche mis à jour.')}
    catch(error){setNotice('Erreur : '+error.message)}
  }
  return <section className="admin-section"><div className="admin-toolbar"><div><p>{vehicles.length} véhicule(s) {archived?'archivé(s)':'dans la flotte'}</p>{archived&&<small className="archive-explain">Les véhicules archivés sont masqués sur le site. Leurs photos et leurs tarifs sont conservés.</small>}</div>{!archived&&<button className="btn" disabled={busy||Boolean(workingId)} onClick={()=>setEditing({name:'',category:'',price:'',deposit:'',description:'',photos:[],active:true})}><Plus size={16}/> Ajouter</button>}</div>{notice&&<div className="notice" role="status" aria-live="polite">{notice}</div>}{editing&&!archived&&<VehicleForm initial={editing} busy={busy} onCancel={()=>setEditing(null)} onSave={save}/>}<div className="admin-cars">{vehicles.map(v=><article key={v.id}><div className="admin-car-img">{v.photos?.[0]?<img src={v.photos[0]} alt=""/>:<span>YNR</span>}</div><div><p>{v.category}</p><h3>{v.name}</h3><PriceDisplay vehicle={v} compact/>{archived&&<span className="archive-date">Archivé le {new Date(v.archivedAt).toLocaleDateString('fr-FR')}</span>}</div><div className="admin-actions">{archived?<><button type="button" className="archive-restore" disabled={busy||Boolean(workingId)} onClick={()=>runAction(v,'restore')}><RotateCcw size={15}/> {workingId===v.id?'Restauration…':'Remettre en ligne'}</button><button type="button" className="archive-danger" disabled={busy||Boolean(workingId)} onClick={()=>runAction(v,'permanent')}><Trash2 size={15}/> {workingId===v.id?'Traitement…':'Supprimer définitivement'}</button></>:<><button disabled={busy||Boolean(workingId)} onClick={()=>setFeatured(v)}>{v.featured?'À l’affiche':'Mettre à l’affiche'}</button><button disabled={busy||Boolean(workingId)} onClick={()=>setEditing(v)}>Modifier</button><button type="button" className="archive-soft" disabled={busy||Boolean(workingId)} aria-label={`Archiver ${v.name}`} onClick={()=>runAction(v,'archive')}><Archive size={15}/> {workingId===v.id?'Archivage…':'Archiver'}</button></>}</div></article>)}</div>{vehicles.length===0&&<div className="empty-state">{archived?'Aucun véhicule dans les archives.':'Aucun véhicule dans la flotte.'}</div>}</section>
}
function cropImage(file,mode='cover'){return new Promise((resolve,reject)=>{const reader=new FileReader();reader.onerror=()=>reject(new Error('Lecture du fichier impossible'));reader.onload=()=>{const image=new Image();image.onerror=()=>reject(new Error('Image invalide'));image.onload=()=>{const size=1200,target=mode==='square'?1:4/3;let sx=0,sy=0,sw=image.width,sh=image.height;if(mode==='cover'){if(image.width/image.height>target){sw=Math.round(image.height*target);sx=Math.round((image.width-sw)/2)}else{sh=Math.round(image.width/target);sy=Math.round((image.height-sh)/2)}}const canvas=document.createElement('canvas');canvas.width=size;canvas.height=mode==='cover'?900:Math.round(size/image.width*image.height);const ctx=canvas.getContext('2d');ctx.fillStyle='#111';ctx.fillRect(0,0,canvas.width,canvas.height);if(mode==='cover')ctx.drawImage(image,sx,sy,sw,sh,0,0,canvas.width,canvas.height);else{const scale=Math.min(canvas.width/image.width,canvas.height/image.height);const w=image.width*scale,h=image.height*scale;ctx.drawImage(image,0,0,image.width,image.height,(canvas.width-w)/2,(canvas.height-h)/2,w,h)}resolve(canvas.toDataURL('image/jpeg',.82));};image.src=reader.result;};reader.readAsDataURL(file);})}
function VehicleForm({initial,onCancel,onSave,busy}){const [v,setV]=useState({...initial,featuredPhoto:initial.photos?.[0]||''}),[removedPhotos,setRemovedPhotos]=useState([]),[uploading,setUploading]=useState(false),[error,setError]=useState(''),[cropMode,setCropMode]=useState('cover');async function upload(files){const images=Array.from(files||[]).filter(file=>file.type.startsWith('image/'));if(!images.length)return;setUploading(true);setError('');try{const uploaded=[];for(const file of images.slice(0,8-(v.photos?.length||0))){const data=await cropImage(file,cropMode);if(data.length>11_000_000)throw new Error('Image trop volumineuse après compression. Choisissez une autre image.');const result=await api('/uploads',{method:'POST',body:JSON.stringify({data})});uploaded.push(result.url)}setV(current=>{const photos=[...(current.photos||[]),...uploaded];return {...current,photos,featuredPhoto:photos[0]||''}})}catch(e){setError(e.message)}finally{setUploading(false)}}async function removePhoto(photo){setError('');setRemovedPhotos(current=>current.includes(photo)?current:[...current,photo]);setV(current=>{const photos=(current.photos||[]).filter(item=>item!==photo);return {...current,photos,featuredPhoto:photos[0]||''}})}return <div className="editor"><div className="editor-head"><div><p className="eyebrow">{initial.id?'MODIFIER':'NOUVEAU'}</p><h2>{initial.id?initial.name:'Ajouter un véhicule'}</h2></div><button type="button" onClick={onCancel}><X/></button></div><div className="crop-choice" role="group" aria-labelledby="crop-choice-label"><span id="crop-choice-label">Cadrage des images</span><label><input type="radio" name="crop-mode" value="cover" checked={cropMode==='cover'} onChange={()=>setCropMode('cover')}/> 4:3 recadré</label><label><input type="radio" name="crop-mode" value="contain" checked={cropMode==='contain'} onChange={()=>setCropMode('contain')}/> Original avec marge</label><label><input type="radio" name="crop-mode" value="square" checked={cropMode==='square'} onChange={()=>setCropMode('square')}/> Carré</label></div>{v.photos?.length>0&&<div className="photo-order" aria-label="Ordre des photos"><strong>Ordre des photos</strong><small>La première photo est affichée en vedette.</small><div className="photo-order-strip">{v.photos.map((photo,index)=><div className="photo-order-item" key={`${photo}-${index}`}><img src={photo} alt={`Photo ${index+1}`}/><span>#{index+1}</span><div><button type="button" disabled={index===0} aria-label="Déplacer vers la gauche" onClick={()=>setV(current=>{const photos=[...(current.photos||[])];[photos[index-1],photos[index]]=[photos[index],photos[index-1]];return {...current,photos,featuredPhoto:photos[0]}})}><ChevronLeft size={14}/></button><button type="button" disabled={index===v.photos.length-1} aria-label="Déplacer vers la droite" onClick={()=>setV(current=>{const photos=[...(current.photos||[])];[photos[index+1],photos[index]]=[photos[index],photos[index+1]];return {...current,photos,featuredPhoto:photos[0]}})}><ChevronRight size={14}/></button></div></div>)}</div></div>}<div className="editor-grid"><label>Nom<input required value={v.name} onChange={e=>setV({...v,name:e.target.value})}/></label><label>Catégorie<input value={v.category} onChange={e=>setV({...v,category:e.target.value})}/></label><label className="price-field"><span className="price-field-head">Prix 24h semaine<span className="price-visibility"><input type="checkbox" checked={v.visiblePrices?.weekday24h!==false} onChange={e=>setV({...v,visiblePrices:{...(v.visiblePrices||{}),weekday24h:e.target.checked}})}/> Afficher</span></span><input min="0" required type="number" value={v.pricing?.weekday24h ?? v.price} onChange={e=>setV({...v,price:e.target.value,pricing:{...(v.pricing||{}),weekday24h:e.target.value}})}/></label><label className="price-field"><span className="price-field-head">48h week-end<span className="price-visibility"><input type="checkbox" checked={v.visiblePrices?.weekend48h!==false} onChange={e=>setV({...v,visiblePrices:{...(v.visiblePrices||{}),weekend48h:e.target.checked}})}/> Afficher</span></span><input min="0" type="number" value={v.pricing?.weekend48h ?? ''} onChange={e=>setV({...v,pricing:{...(v.pricing||{}),weekend48h:e.target.value}})}/></label><label className="price-field"><span className="price-field-head">72h week-end<span className="price-visibility"><input type="checkbox" checked={v.visiblePrices?.weekend72h!==false} onChange={e=>setV({...v,visiblePrices:{...(v.visiblePrices||{}),weekend72h:e.target.checked}})}/> Afficher</span></span><input min="0" type="number" value={v.pricing?.weekend72h ?? ''} onChange={e=>setV({...v,pricing:{...(v.pricing||{}),weekend72h:e.target.value}})}/></label><label className="price-field"><span className="price-field-head">7 jours<span className="price-visibility"><input type="checkbox" checked={v.visiblePrices?.week7d!==false} onChange={e=>setV({...v,visiblePrices:{...(v.visiblePrices||{}),week7d:e.target.checked}})}/> Afficher</span></span><input min="0" type="number" value={v.pricing?.week7d ?? ''} onChange={e=>setV({...v,pricing:{...(v.pricing||{}),week7d:e.target.value}})}/></label><label className="price-field"><span className="price-field-head">30 jours<span className="price-visibility"><input type="checkbox" checked={v.visiblePrices?.month30d!==false} onChange={e=>setV({...v,visiblePrices:{...(v.visiblePrices||{}),month30d:e.target.checked}})}/> Afficher</span></span><input min="0" type="number" value={v.pricing?.month30d ?? ''} onChange={e=>setV({...v,pricing:{...(v.pricing||{}),month30d:e.target.value}})}/></label><label>Réduction (%)<input min="0" max="100" type="number" value={v.pricing?.discount ?? 0} onChange={e=>setV({...v,pricing:{...(v.pricing||{}),discount:e.target.value}})}/></label><label className="price-field"><span className="price-field-head">Caution<span className="price-visibility"><input type="checkbox" checked={v.visiblePrices?.deposit!==false} onChange={e=>setV({...v,visiblePrices:{...(v.visiblePrices||{}),deposit:e.target.checked}})}/> Afficher</span></span><input min="0" type="number" value={v.deposit} onChange={e=>setV({...v,deposit:e.target.value})}/></label><div className="wide media-uploader"><div className="upload-head"><label className="crop-choice">Format<select value={cropMode} onChange={e=>setCropMode(e.target.value)}><option value="cover">Recadrer en 4:3</option><option value="contain">Conserver l’image</option></select></label><span>Photos du véhicule</span><small>{v.photos?.length||0}/8</small></div><div className="photo-grid">{(v.photos||[]).map(photo=><div className="photo-thumb" key={photo}><img src={photo} alt="Photo du véhicule"/><button type="button" onClick={()=>removePhoto(photo)} aria-label="Supprimer la photo"><X size={14}/></button></div>)}<label className="upload-card"><ImagePlus size={20}/><span>{uploading?'Téléversement…':'Ajouter des photos'}</span><input type="file" accept="image/jpeg,image/png,image/webp" multiple disabled={uploading||(v.photos?.length||0)>=8} onChange={e=>upload(e.target.files)}/></label></div><small className="upload-help">JPEG, PNG ou WEBP · 8 Mo maximum par image · Les photos retirées disparaissent du site après avoir cliqué sur « Enregistrer ».</small></div><label className="wide">Description<textarea rows="4" value={v.description} onChange={e=>setV({...v,description:e.target.value})}/></label><label className="check"><input type="checkbox" checked={v.active!==false} onChange={e=>setV({...v,active:e.target.checked})}/> Visible sur le site</label></div>{error&&<p className="form-error">{error}</p>}<div className="editor-actions"><button type="button" onClick={onCancel}>Annuler</button><button className="btn" disabled={busy||uploading} onClick={()=>onSave({...v,featuredPhoto:v.photos?.[0]||'',removedPhotos})}><Check size={16}/> {busy?'Enregistrement…':'Enregistrer'}</button></div></div>}
function RequestsAdmin({data,setData}){return <section className="admin-section"><div className="admin-toolbar"><p>{data.requests.length} demande(s)</p></div>{data.requests.length?<div className="requests">{data.requests.map(r=>{const status=r.status||'nouvelle';const statusLabel={nouvelle:'📥 Nouvelle',contacted:'📞 Contacté',confirmed:'✅ Confirmée',declined:'❌ Refusée'}[status];return <article key={r.id}><div className="request-header"><div><span className="request-date">{new Date(r.createdAt).toLocaleDateString('fr-FR')}</span><h3>{r.name}</h3><p className="request-contact">{r.email}</p><p className="request-contact">{r.phone}</p></div><div className="request-status"><strong>{r.vehicle}</strong><small>{r.start} → {r.end}</small></div></div>{r.documents&&<div className="request-documents">{[['identity','CNI'],['license','Permis'],['address','Domicile']].map(([type,label])=>r.documents[type]&&<a key={type} href={`/api/request-document/${r.id}/${type}`} target="_blank" rel="noreferrer">{label}</a>)}</div>}<div className="request-actions"><select value={status} onChange={async e=>{const newStatus=e.target.value;await api('/requests/'+r.id,{method:'PATCH',body:JSON.stringify({status:newStatus})});setData(d=>({...d,requests:d.requests.map(x=>x.id===r.id?{...x,status:newStatus}:x)}))}}><option value="nouvelle">📥 Nouvelle</option><option value="contacted">📞 Contacté</option><option value="confirmed">✅ Confirmée</option><option value="declined">❌ Refusée</option></select></div></article>})}</div>:<div className="empty-state">Aucune demande pour le moment.</div>}</section>}
function SettingsAdmin({data,setData}){const [s,setS]=useState(data.settings||{});return <section className="admin-section"><div className="settings-form"><label>Nom de marque<input value={s.brand||''} onChange={e=>setS({...s,brand:e.target.value})}/></label><label>Accroche<textarea value={s.tagline||''} onChange={e=>setS({...s,tagline:e.target.value})}/></label><label>Téléphone<input value={s.phone||''} onChange={e=>setS({...s,phone:e.target.value})}/></label><label>E-mail<input value={s.email||''} onChange={e=>setS({...s,email:e.target.value})}/></label><button className="btn" onClick={async()=>setData({...data,settings:await api('/settings',{method:'PUT',body:JSON.stringify(s)})})}>Enregistrer</button></div></section>}

const rootElement=document.getElementById('root');const appRoot=window.__ynrRoot||(window.__ynrRoot=createRoot(rootElement));appRoot.render(<App/>)
