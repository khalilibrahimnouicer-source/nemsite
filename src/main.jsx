import React, { useEffect, useMemo, useState } from 'react'
import { createRoot } from 'react-dom/client'
import {
  ArrowRight, CalendarDays, Check, ChevronDown, Eye, EyeOff, ImagePlus,
  LayoutDashboard, LogOut, Menu, MessageCircle, Plus, Save, Settings,
  Trash2, Truck, UploadCloud, X, ExternalLink, RefreshCw
} from 'lucide-react'
import './styles.css'

const PHONE = '+33745454109'
const WA = 'https://chat.whatsapp.com/DDUWaSzXm4DBuA8co2I0bE'
const FALLBACK = { settings: { brand: 'YNR Pro Rent' }, vehicles: [], requests: [], blocked: [] }

async function api(path, options = {}) {
  const response = await fetch('/api' + path, {
    credentials: 'include',
    ...options,
    headers: { 'Content-Type': 'application/json', ...(options.headers || {}) },
  })
  const data = await response.json().catch(() => null)
  if (!response.ok) throw new Error(data?.message || `Erreur serveur (${response.status})`)
  return data
}

function Logo({ compact = false }) {
  return <div className={`ynr-logo ${compact ? 'compact' : ''}`} aria-label="YNR Pro Rent">
    <div className="ynr-logo-main"><span>Y</span><span className="orange">N</span><span>R</span></div>
    <div className="ynr-logo-sub"><span>PRO</span><span className="orange">RENT</span></div>
  </div>
}

function Public() {
  const [data, setData] = useState(FALLBACK)
  const [menu, setMenu] = useState(false)
  const [sent, setSent] = useState(false)
  const [activeFaq, setActiveFaq] = useState(0)

  useEffect(() => { api('/public').then(setData).catch(() => {}) }, [])
  const vehicles = data.vehicles || []
  const featured = vehicles[0]
  const others = vehicles.slice(1)

  return <div className="site">
    <header className="public-header">
      <nav className={`public-nav ${menu ? 'open' : ''}`}>
        <a href="#why" onClick={() => setMenu(false)}>Pourquoi nous</a>
        <a href="#fleet" onClick={() => setMenu(false)}>Véhicules</a>
        <a href="#contact" onClick={() => setMenu(false)}>Réserver</a>
      </nav>
      <div className="header-actions">
        <a className="whatsapp-pill" href={WA} target="_blank" rel="noreferrer"><MessageCircle size={15}/> WhatsApp</a>
        <a className="desktop-logo" href="#top"><Logo compact/></a>
      </div>
      <button className="mobile-menu" onClick={() => setMenu(v => !v)} aria-label={menu ? 'Fermer le menu' : 'Ouvrir le menu'}>
        {menu ? <X size={20}/> : <Menu size={20}/>}<span>Menu</span>
      </button>
    </header>

    <main id="top">
      <section className="hero-v2">
        <div className="hero-v2-copy">
          <p className="eyebrow">LOCATION DE VOITURES SPORTIVES & DE LUXE</p>
          <h1>Louez une voiture <span>qui marque.</span></h1>
          <p className="hero-sub">Une sélection exigeante, un service direct et une réservation pensée pour aller à l'essentiel.</p>
          <div className="hero-ctas">
            <a className="button primary" href="#fleet">Voir les véhicules <ArrowRight size={16}/></a>
            <a className="text-cta" href={WA} target="_blank" rel="noreferrer"><MessageCircle size={16}/> Écrire sur WhatsApp</a>
          </div>
          <div className="hero-contact"><a href={`tel:${PHONE}`}>07 45 45 41 09</a><span>Réservation directe</span></div>
        </div>
        <div className="hero-v2-media">
          {featured?.photos?.[0] ? <img src={featured.photos[0]} alt={featured.name} /> : <div className="image-placeholder"><Logo/></div>}
          <div className="hero-caption"><span>{featured?.category || 'YNR PRO RENT'}</span><strong>{featured?.name || 'Votre prochaine voiture.'}</strong><a href="#fleet">Découvrir <ArrowRight size={15}/></a></div>
        </div>
        <a className="scroll-cue" href="#trust" aria-label="Découvrir la suite">Scroll <span></span></a>
      </section>

      <section id="trust" className="trust-strip">
        <div><span className="trust-index">01</span><strong>SÉLECTION</strong><small>Une flotte présentée avec exigence.</small></div>
        <div><span className="trust-index">02</span><strong>DIRECT</strong><small>Une prise de contact simple et humaine.</small></div>
        <div><span className="trust-index">03</span><strong>ESSENTIEL</strong><small>Une réservation sans parcours inutile.</small></div>
      </section>

      <section id="why" className="editorial-intro section-shell">
        <div className="section-kicker"><span>02</span><p className="eyebrow">L'EXPÉRIENCE YNR</p></div>
        <div>
          <h2>Le bon véhicule change <em>toute une journée.</em></h2>
          <p>Pour un événement, un rendez-vous professionnel ou simplement le plaisir de conduire. YNR met le véhicule au centre de l'expérience.</p>
        </div>
      </section>

      <section id="fleet" className="fleet-showcase section-shell">
        <div className="section-heading-row"><div><p className="eyebrow">LA FLOTTE</p><h2>Choisissez votre <em>signature.</em></h2></div><a className="text-cta desktop-only" href="#contact">Réserver une voiture <ArrowRight size={16}/></a></div>
        {vehicles.length === 0 ? <div className="empty-public">La flotte sera bientôt disponible.</div> : <div className="fleet-showcase-grid">
          {featured && <VehicleFeature vehicle={featured}/>} 
          {others.map(vehicle => <VehicleTile key={vehicle.id} vehicle={vehicle}/>)}
        </div>}
      </section>

      <section className="experience-band section-shell">
        <div className="experience-image">{featured?.photos?.[0] && <img src={featured.photos[0]} alt=""/>}</div>
        <div className="experience-copy"><p className="eyebrow">L'ART DE L'ESSENTIEL</p><h2>Une voiture qui donne le ton.</h2><p>Une présentation claire, une prise de contact directe et une expérience pensée autour du véhicule.</p><div className="experience-points"><span><b>01</b> Une sélection lisible</span><span><b>02</b> Un contact direct</span><span><b>03</b> Une réservation simple</span></div></div>
      </section>

      <section className="why-grid section-shell">
        <div className="why-lead"><p className="eyebrow">POURQUOI YNR</p><h2>Moins de friction. <em>Plus de conduite.</em></h2></div>
        <div className="why-items"><article><span>01</span><h3>Le véhicule d'abord</h3><p>Chaque élément du site sert à mieux découvrir la flotte.</p></article><article><span>02</span><h3>Un contact direct</h3><p>La réservation commence par un échange clair, sans parcours inutile.</p></article><article><span>03</span><h3>Une image cohérente</h3><p>Du premier écran à la demande, la même exigence visuelle.</p></article></div>
      </section>

      <section className="process section-shell"><div className="process-head"><p className="eyebrow">COMMENT ÇA MARCHE</p><h2>Simple, du premier clic <em>à la route.</em></h2></div><div className="process-steps"><article><b>01</b><h3>Choisissez</h3><p>Découvrez le véhicule qui correspond à votre besoin.</p></article><article><b>02</b><h3>Demandez</h3><p>Indiquez votre véhicule et vos dates.</p></article><article><b>03</b><h3>Confirmez</h3><p>Échangez directement avec YNR pour finaliser votre demande.</p></article><article><b>04</b><h3>Profitez</h3><p>Votre expérience peut commencer.</p></article></div></section>

      <section className="faq-section section-shell"><div className="faq-lead"><p className="eyebrow">QUESTIONS</p><h2>Tout ce qu'il faut <em>savoir.</em></h2></div><div className="faq-list">
        {[['Quels documents sont nécessaires ?','Permis valide, carte d’identité et justificatif de domicile.'],['Quel est le prix ?','Le prix varie selon le modèle et les dates. Une demande permet d’obtenir les informations adaptées.'],['Qu’en est-il de l’assurance ?','Les modalités d’assurance et de franchise dépendent de la formule applicable au véhicule.'],['Jeune conducteur ?','La location est indiquée à partir de 21 ans minimum depuis 3 ans.']].map(([q,a], i) => <div className={`faq-item ${activeFaq === i ? 'active' : ''}`} key={q}><button onClick={() => setActiveFaq(activeFaq === i ? -1 : i)}><span>{q}</span>{activeFaq === i ? <X size={18}/> : <Plus size={18}/>}</button>{activeFaq === i && <p>{a}</p>}</div>)}
      </div></section>

      <section id="contact" className="reservation-section section-shell"><div className="reservation-copy"><p className="eyebrow">RÉSERVATION</p><h2>Votre prochaine route <em>commence ici.</em></h2><p>Choisissez un véhicule, indiquez vos dates et envoyez votre demande. YNR vous recontactera pour la suite.</p><a className="text-cta" href={WA} target="_blank" rel="noreferrer"><MessageCircle size={16}/> Écrire sur WhatsApp</a></div>{sent ? <div className="success-panel"><Check size={28}/><strong>Demande envoyée.</strong><p>Votre demande a bien été transmise.</p></div> : <RequestForm vehicles={vehicles} onSent={() => setSent(true)}/>}</section>
    </main>

    <footer className="site-footer"><div className="footer-brand"><Logo/><p>Location de voitures sportives et de luxe.</p></div><div className="footer-nav"><a href="#why">Pourquoi nous</a><a href="#fleet">Véhicules</a><a href="#contact">Réserver</a></div><div className="footer-contact"><a href={`tel:${PHONE}`}>07 45 45 41 09</a><a href={WA} target="_blank" rel="noreferrer">WhatsApp</a></div><div className="footer-bottom"><span>© {new Date().getFullYear()} YNR Pro Rent</span><span>Paris · France</span></div></footer>
  </div>
}

function VehicleFeature({ vehicle }) { return <article className="vehicle-feature"><a href="#contact" className="vehicle-image-wrap"><img src={vehicle.photos?.[0]} alt={vehicle.name}/><span>Voir & réserver <ArrowRight size={16}/></span></a><div className="vehicle-meta"><div><small>{vehicle.category || 'Véhicule'}</small><h3>{vehicle.name}</h3></div>{Number.isFinite(Number(vehicle.price)) && <strong>{vehicle.price}€ <small>/ jour</small></strong>}</div></article> }
function VehicleTile({ vehicle }) { return <article className="vehicle-tile"><a href="#contact" className="vehicle-image-wrap"><img src={vehicle.photos?.[0]} alt={vehicle.name}/><span>Réserver <ArrowRight size={15}/></span></a><div className="vehicle-meta"><div><small>{vehicle.category || 'Véhicule'}</small><h3>{vehicle.name}</h3></div>{Number.isFinite(Number(vehicle.price)) && <strong>{vehicle.price}€</strong>}</div></article> }

function RequestForm({ vehicles, onSent }) {
  const [busy, setBusy] = useState(false), [error, setError] = useState('')
  async function submit(e) { e.preventDefault(); setBusy(true); setError(''); try { const data = Object.fromEntries(new FormData(e.currentTarget)); await api('/requests', { method: 'POST', body: JSON.stringify(data) }); e.currentTarget.reset(); onSent() } catch (err) { setError(err.message) } finally { setBusy(false) } }
  return <form className="reservation-form" onSubmit={submit}><label>Véhicule<select name="vehicle" required>{vehicles.map(v => <option key={v.id} value={v.name}>{v.name}</option>)}</select></label><div className="field-grid"><label>Début<input name="start" required type="date"/></label><label>Fin<input name="end" required type="date"/></label></div><label>Nom<input name="name" required/></label><label>Téléphone<input name="phone" required placeholder="07 45 45 41 09"/></label><label>E-mail<input name="email" required type="email"/></label>{error && <p className="form-error">{error}</p>}<button className="button primary" disabled={busy}>{busy ? 'Envoi…' : 'Vérifier la disponibilité'} <ArrowRight size={17}/></button></form>
}

function Admin() {
  const [auth, setAuth] = useState(null), [data, setData] = useState(null)
  useEffect(() => { api('/auth/session').then(() => { setAuth(true); return api('/admin') }).then(setData).catch(() => setAuth(false)) }, [])
  if (auth === false) return <AdminLogin onSuccess={() => { setAuth(true); api('/admin').then(setData) }}/>
  if (!data) return <div className="admin-loading"><div><Logo/><p>Chargement de l'administration…</p></div></div>
  return <AdminApp data={data} setData={setData}/>
}

function AdminLogin({ onSuccess }) {
  const [show, setShow] = useState(false), [error, setError] = useState(''), [busy, setBusy] = useState(false)
  async function submit(e) { e.preventDefault(); setBusy(true); setError(''); try { const f = Object.fromEntries(new FormData(e.currentTarget)); await api('/auth/login', { method: 'POST', body: JSON.stringify(f) }); onSuccess() } catch (err) { setError(err.message) } finally { setBusy(false) } }
  return <div className="admin-login"><div className="login-visual"><p className="eyebrow">YNR PRO RENT</p><h1>L'administration,<br/><em>sans détour.</em></h1><p>Gérez votre flotte et vos demandes depuis un espace privé.</p></div><div className="login-card"><Logo/><div className="login-heading"><span>ESPACE PRIVÉ</span><h2>Connexion</h2></div><form onSubmit={submit}><label>E-mail<input name="email" type="email" autoComplete="username" required placeholder="E-mail administrateur"/></label><label>Mot de passe<div className="password-wrap"><input name="password" type={show ? 'text' : 'password'} autoComplete="current-password" required placeholder="Mot de passe"/><button type="button" onClick={() => setShow(v => !v)} aria-label={show ? 'Masquer le mot de passe' : 'Afficher le mot de passe'}>{show ? <EyeOff size={18}/> : <Eye size={18}/>}</button></div></label>{error && <p className="login-error">{error}</p>}<button className="button primary login-submit" disabled={busy}>{busy ? 'Connexion…' : 'Se connecter'} <ArrowRight size={16}/></button></form><a className="back-site" href="/">← Retour au site</a></div></div>
}

function AdminApp({ data, setData }) {
  const [view, setView] = useState('dashboard'), [mobileNav, setMobileNav] = useState(false), [notice, setNotice] = useState('')
  const refresh = async () => { const d = await api('/admin'); setData(d) }
  const nav = [['dashboard','Vue d’ensemble',LayoutDashboard],['vehicles','Véhicules',Truck],['requests','Demandes',MessageCircle],['calendar','Calendrier',CalendarDays],['settings','Réglages',Settings]]
  async function logout() { await api('/auth/logout', { method: 'POST' }); location.href = '/' }
  return <div className="admin-shell"><aside className={mobileNav ? 'open' : ''}><div className="admin-side-top"><Logo compact/><button className="mobile-close" onClick={() => setMobileNav(false)}><X size={19}/></button></div><p className="admin-label">ADMINISTRATION</p><nav>{nav.map(([key,label,Icon]) => <button key={key} className={view === key ? 'active' : ''} onClick={() => { setView(key); setMobileNav(false) }}><Icon size={17}/><span>{label}</span></button>)}</nav><div className="admin-side-bottom"><a href="/" target="_blank" rel="noreferrer"><ExternalLink size={16}/> Voir le site</a><button onClick={logout}><LogOut size={16}/> Déconnexion</button></div></aside>{mobileNav && <div className="admin-overlay" onClick={() => setMobileNav(false)}/>}<main className="admin-main"><header className="admin-topbar"><button className="admin-menu" onClick={() => setMobileNav(true)}><Menu size={20}/></button><div><p className="eyebrow">YNR PRO RENT / ADMIN</p><h1>{nav.find(x => x[0] === view)?.[1]}</h1></div><button className="refresh-btn" onClick={async () => { await refresh(); setNotice('Données actualisées') }} aria-label="Actualiser"><RefreshCw size={17}/></button></header>{notice && <button className="admin-notice" onClick={() => setNotice('')}>{notice} ×</button>}{view === 'dashboard' && <Dashboard data={data}/>} {view === 'vehicles' && <Vehicles data={data} setData={setData} setNotice={setNotice}/>} {view === 'requests' && <Requests data={data} setData={setData} setNotice={setNotice}/>} {view === 'calendar' && <Calendar data={data} setData={setData} setNotice={setNotice}/>} {view === 'settings' && <SettingsView data={data} setData={setData} setNotice={setNotice}/>}</main></div>
}

function Dashboard({ data }) { const pending = (data.requests || []).filter(r => ['nouvelle','en_cours'].includes(r.status)).length; return <div className="admin-content"><div className="metrics-v2"><Metric label="Véhicules actifs" value={(data.vehicles || []).filter(v => v.active !== false).length}/><Metric label="Demandes" value={(data.requests || []).length}/><Metric label="À traiter" value={pending}/><Metric label="Indisponibilités" value={(data.blocked || []).length}/></div><div className="admin-two-col"><section className="admin-panel"><div className="panel-head"><div><span>ACTIVITÉ</span><h2>Dernières demandes</h2></div></div>{(data.requests || []).slice(0, 8).map(r => <div className="request-line" key={r.id}><div><strong>{r.name}</strong><small>{r.vehicle} · {r.start} → {r.end}</small></div><Status value={r.status}/></div>)}{!data.requests?.length && <Empty text="Aucune demande pour le moment."/>}</section><section className="admin-panel"><div className="panel-head"><div><span>FLOTTE</span><h2>Vos véhicules</h2></div></div>{(data.vehicles || []).slice(0, 5).map(v => <div className="fleet-line" key={v.id}>{v.photos?.[0] ? <img src={v.photos[0]} alt=""/> : <div className="thumb-empty"><Truck size={18}/></div>}<div><strong>{v.name}</strong><small>{v.category || 'Véhicule'}</small></div><i className={v.active === false ? 'offline' : ''}/></div>)}{!data.vehicles?.length && <Empty text="Ajoutez votre premier véhicule."/>}</section></div></div> }
function Metric({ label, value }) { return <div className="metric-v2"><span>{label}</span><strong>{value}</strong><small>DONNÉES RÉELLES</small></div> }
function Status({ value }) { return <span className={`status status-${value}`}>{value?.replace('_',' ') || 'nouvelle'}</span> }
function Empty({ text }) { return <div className="empty-admin">{text}</div> }

function Vehicles({ data, setData, setNotice }) {
  const [editing, setEditing] = useState(null), [busy, setBusy] = useState(false)
  async function save(payload) { setBusy(true); try { const path = editing?.id ? `/vehicles/${editing.id}` : '/vehicles'; const method = editing?.id ? 'PATCH' : 'POST'; const result = await api(path, { method, body: JSON.stringify(payload) }); setData(d => ({ ...d, vehicles: editing?.id ? d.vehicles.map(v => v.id === result.id ? result : v) : [result, ...d.vehicles] })); setEditing(null); setNotice('Véhicule enregistré') } catch (e) { setNotice(e.message) } finally { setBusy(false) } }
  async function remove(v) { if (!confirm(`Supprimer ${v.name} ?`)) return; try { await api(`/vehicles/${v.id}`, { method:'DELETE' }); setData(d => ({ ...d, vehicles: d.vehicles.filter(x => x.id !== v.id) })); setNotice('Véhicule supprimé') } catch(e) { setNotice(e.message) } }
  return <div className="admin-content"><div className="admin-page-intro"><div><span>CATALOGUE</span><h2>Votre flotte</h2></div><button className="admin-primary" onClick={() => setEditing({})}><Plus size={17}/> Ajouter un véhicule</button></div>{editing !== null && <VehicleEditor initial={editing} busy={busy} onCancel={() => setEditing(null)} onSave={save}/>}<div className="vehicle-admin-grid">{data.vehicles.map(v => <article className="vehicle-admin-card-v2" key={v.id}><div className="admin-vehicle-image">{v.photos?.[0] ? <img src={v.photos[0]} alt=""/> : <Truck size={28}/>}<span className={v.active === false ? 'offline' : ''}>{v.active === false ? 'Masqué' : 'Actif'}</span></div><div className="admin-vehicle-body"><small>{v.category || 'Véhicule'}</small><h3>{v.name}</h3><p>{v.description || 'Aucune description.'}</p><div className="vehicle-admin-foot"><strong>{v.price || 0}€ <small>/ jour</small></strong><div><button onClick={() => setEditing(v)}><Settings size={15}/> Modifier</button><button className="danger" onClick={() => remove(v)}><Trash2 size={15}/> Supprimer</button></div></div></div></article>)}</div>{!data.vehicles.length && <Empty text="Votre flotte est vide. Ajoutez votre premier véhicule."/>}</div>
}

function VehicleEditor({ initial, onCancel, onSave, busy }) {
  const [form, setForm] = useState({ name: initial.name || '', category: initial.category || '', price: initial.price ?? '', deposit: initial.deposit ?? '', description: initial.description || '', active: initial.active !== false, photos: initial.photos || [] })
  const [files, setFiles] = useState([]), [uploading, setUploading] = useState(false), [error, setError] = useState('')
  const update = (k,v) => setForm(f => ({...f,[k]:v}))
  async function uploadFiles() { if (!files.length) return; setUploading(true); setError(''); try { const urls=[]; for (const file of files.slice(0,8-form.photos.length)) { if (!file.type.startsWith('image/')) continue; if (file.size > 8*1024*1024) throw new Error(`${file.name} dépasse 8 Mo.`); const base64 = await fileToData(file); const r = await api('/uploads',{method:'POST',body:JSON.stringify({data:base64})}); urls.push(r.url) } update('photos',[...form.photos,...urls]); setFiles([]) } catch(e) { setError(e.message) } finally { setUploading(false) } }
  function removePhoto(i) { update('photos', form.photos.filter((_,idx)=>idx!==i)) }
  return <section className="vehicle-editor"><div className="editor-top"><div><span>{initial.id ? 'MODIFICATION' : 'NOUVEAU VÉHICULE'}</span><h2>{initial.id ? initial.name : 'Ajouter un véhicule'}</h2></div><button onClick={onCancel} className="icon-btn" aria-label="Fermer"><X size={19}/></button></div><div className="editor-layout"><div className="editor-fields"><label>Nom / modèle<input value={form.name} onChange={e=>update('name',e.target.value)} placeholder="BMW M3 Competition" required/></label><div className="field-grid"><label>Catégorie<input value={form.category} onChange={e=>update('category',e.target.value)} placeholder="Berline sportive"/></label><label>Prix / jour<input value={form.price} onChange={e=>update('price',e.target.value)} type="number" min="0"/></label></div><label>Caution<input value={form.deposit} onChange={e=>update('deposit',e.target.value)} type="number" min="0"/></label><label>Description<textarea value={form.description} onChange={e=>update('description',e.target.value)} rows="5" placeholder="Présentez le véhicule en quelques lignes."/></label><label className="switch-line"><input type="checkbox" checked={form.active} onChange={e=>update('active',e.target.checked)}/><span>Visible sur le site public</span></label></div><div className="editor-media"><div className="media-head"><div><span>PHOTOS</span><strong>{form.photos.length}/8</strong></div></div><div className="photo-grid">{form.photos.map((url,i)=><div className={`photo-item ${i===0?'featured':''}`} key={url}><img src={url} alt=""/><button type="button" onClick={()=>removePhoto(i)} aria-label="Supprimer la photo"><X size={15}/></button>{i===0&&<span>Principale</span>}</div>)}</div><label className="upload-zone"><UploadCloud size={25}/><strong>{files.length ? `${files.length} photo(s) sélectionnée(s)` : 'Ajouter des photos'}</strong><small>JPEG, PNG ou WEBP · 8 Mo max / photo</small><input type="file" accept="image/jpeg,image/png,image/webp" multiple onChange={e=>setFiles(Array.from(e.target.files || []))}/></label><button type="button" className="secondary-action full" onClick={uploadFiles} disabled={uploading || !files.length}><ImagePlus size={16}/>{uploading ? 'Upload en cours…' : 'Uploader les photos'}</button>{error&&<p className="form-error">{error}</p>}</div></div><div className="editor-bottom"><button className="secondary-action" onClick={onCancel}>Annuler</button><button className="admin-primary" onClick={()=>onSave(form)} disabled={busy || uploading}><Save size={16}/>{busy?'Enregistrement…':'Enregistrer le véhicule'}</button></div></section>
}

function fileToData(file) { return new Promise((resolve,reject)=>{ const reader=new FileReader(); reader.onload=()=>resolve(reader.result); reader.onerror=reject; reader.readAsDataURL(file) }) }

function Requests({ data, setData, setNotice }) { const [selected, setSelected] = useState(null); async function update(id,status){try{const r=await api(`/requests/${id}`,{method:'PATCH',body:JSON.stringify({status})});setData(d=>({...d,requests:d.requests.map(x=>x.id===r.id?r:x)}));setNotice('Demande mise à jour')}catch(e){setNotice(e.message)}} async function remove(id){if(!confirm('Supprimer cette demande ?'))return;try{await api(`/requests/${id}`,{method:'DELETE'});setData(d=>({...d,requests:d.requests.filter(x=>x.id!==id)}));setSelected(null)}catch(e){setNotice(e.message)}} return <div className="admin-content"><div className="admin-page-intro"><div><span>CLIENTS</span><h2>Demandes de réservation</h2></div></div><div className="request-table"><div className="table-head"><span>CLIENT</span><span>VÉHICULE</span><span>DATES</span><span>STATUT</span></div>{data.requests.map(r=><article className="request-admin-row" key={r.id} onClick={()=>setSelected(r)}><div><strong>{r.name}</strong><small>{r.email}<br/>{r.phone}</small></div><span>{r.vehicle}</span><span>{r.start} → {r.end}</span><select value={r.status||'nouvelle'} onClick={e=>e.stopPropagation()} onChange={e=>update(r.id,e.target.value)}><option value="nouvelle">Nouvelle</option><option value="en_cours">En cours</option><option value="traitee">Traitée</option></select></article>)}{!data.requests.length&&<Empty text="Aucune demande reçue."/>}</div>{selected&&<div className="request-drawer"><div className="drawer-head"><div><span>DEMANDE</span><h3>{selected.name}</h3></div><button onClick={()=>setSelected(null)}><X size={18}/></button></div><div className="drawer-body"><p><b>Véhicule</b>{selected.vehicle}</p><p><b>Dates</b>{selected.start} → {selected.end}</p><p><b>E-mail</b>{selected.email}</p><p><b>Téléphone</b>{selected.phone || '—'}</p><p><b>Type</b>{selected.type || 'particulier'}</p><p><b>Message</b>{selected.message || 'Aucun message.'}</p></div><button className="danger-action" onClick={()=>remove(selected.id)}><Trash2 size={16}/> Supprimer</button></div>}</div> }

function Calendar({ data, setData, setNotice }) { const [date,setDate]=useState(''), [vehicleId,setVehicleId]=useState(data.vehicles?.[0]?.id||'')
  async function save(){if(!date||!vehicleId)return;const blocked=[...(data.blocked||[])];blocked.push({vehicleId,start:date,end:date});try{const result=await api('/calendar',{method:'PUT',body:JSON.stringify(blocked)});setData(d=>({...d,blocked:result}));setDate('');setNotice('Date bloquée')}catch(e){setNotice(e.message)}}
  async function remove(index){const blocked=(data.blocked||[]).filter((_,i)=>i!==index);try{const result=await api('/calendar',{method:'PUT',body:JSON.stringify(blocked)});setData(d=>({...d,blocked:result}));setNotice('Indisponibilité supprimée')}catch(e){setNotice(e.message)}}
  return <div className="admin-content"><div className="admin-page-intro"><div><span>DISPONIBILITÉ</span><h2>Calendrier</h2></div></div><section className="calendar-panel"><div className="calendar-add"><label>Véhicule<select value={vehicleId} onChange={e=>setVehicleId(e.target.value)}>{data.vehicles.map(v=><option key={v.id} value={v.id}>{v.name}</option>)}</select></label><label>Date<input type="date" value={date} onChange={e=>setDate(e.target.value)}/></label><button className="admin-primary" onClick={save}><Plus size={16}/> Bloquer</button></div><div className="blocked-list">{(data.blocked||[]).map((b,i)=><div key={`${b.vehicleId}-${b.start}-${i}`}><div><span>{b.start || b}</span><strong>{data.vehicles.find(v=>v.id===b.vehicleId)?.name || 'Véhicule'}</strong></div><button onClick={()=>remove(i)} aria-label="Supprimer"><X size={16}/></button></div>)}{!data.blocked?.length&&<Empty text="Aucune date bloquée."/>}</div></section></div>
}

function SettingsView({ data, setData, setNotice }) { const [form,setForm]=useState(data.settings||{}), [busy,setBusy]=useState(false); async function save(e){e.preventDefault();setBusy(true);try{const s=await api('/settings',{method:'PUT',body:JSON.stringify(form)});setData(d=>({...d,settings:s}));setNotice('Réglages enregistrés')}catch(e){setNotice(e.message)}finally{setBusy(false)}} return <div className="admin-content"><div className="admin-page-intro"><div><span>CONFIGURATION</span><h2>Réglages publics</h2></div></div><form className="settings-panel" onSubmit={save}><label>Nom de la marque<input value={form.brand||''} onChange={e=>setForm({...form,brand:e.target.value})}/></label><label>Accroche<textarea rows="3" value={form.tagline||''} onChange={e=>setForm({...form,tagline:e.target.value})}/></label><div className="field-grid"><label>Téléphone<input value={form.phone||''} onChange={e=>setForm({...form,phone:e.target.value})}/></label><label>E-mail<input value={form.email||''} onChange={e=>setForm({...form,email:e.target.value})}/></label></div><label>WhatsApp<input value={form.whatsappChannel||''} onChange={e=>setForm({...form,whatsappChannel:e.target.value})}/></label><button className="admin-primary" disabled={busy}><Save size={16}/>{busy?'Enregistrement…':'Enregistrer'}</button></form></div> }

function App(){ return location.pathname.startsWith('/admin') ? <Admin/> : <Public/> }

createRoot(document.getElementById('root')).render(<App/>)
