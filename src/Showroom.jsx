import React, { useEffect, useMemo, useState } from 'react'
import { ArrowUpRight, ChevronDown, Menu, X } from 'lucide-react'
import ShowroomScene from './ShowroomScene'
import './showroom.css'

function ContactLink({ href, children }) {
  return <a href={href} target={href.startsWith('https:') ? '_blank' : undefined} rel="noreferrer">{children}<ArrowUpRight size={16} /></a>
}

function FleetCard({ vehicle, price }) {
  const [brokenPhoto, setBrokenPhoto] = useState('')
  const photo = vehicle.photos?.[0]
  const href = '/vehicle/' + encodeURIComponent(vehicle.id)
  const showPrice = vehicle.visiblePrices?.weekday24h !== false && price.base > 0
  return <article className="yn-card">
    <a href={href} aria-label={'Voir la fiche de ' + vehicle.name}>
      <div className="yn-photo">
        {photo && photo !== brokenPhoto
          ? <img src={photo} alt={vehicle.name} loading="lazy" decoding="async" onError={() => setBrokenPhoto(photo)} />
          : <span>Photo à venir</span>}
        <span className="yn-open" aria-hidden="true"><ArrowUpRight size={22} /></span>
      </div>
      <div className="yn-card-body">
        <div><p className="yn-label">{vehicle.category || 'Collection YNR'}</p><h3>{vehicle.name}</h3></div>
        <div className="yn-price">{showPrice ? <><strong>{price.final} €</strong><small>/ 24 h semaine</small></> : <small>Voir la fiche</small>}</div>
      </div>
    </a>
  </article>
}

function HeroGallery({ vehicles, loading }) {
  const photos = vehicles.filter(v => v.photos?.[0])
  const [index, setIndex] = useState(0)
  const [studio, setStudio] = useState(false)
  const current = photos[index % (photos.length || 1)]
  const showScene = studio || (!current && !loading)
  return <div className="yn-display">
    {showScene ? <div className="yn-concept"><ShowroomScene /><small>Étude de style YNR</small></div> : current ?
      <a className="yn-hero-photo" href={'/vehicle/' + encodeURIComponent(current.id)} key={current.id}>
        <img src={current.photos[0]} alt={current.name} fetchPriority="high" decoding="async" />
        <div className="yn-caption"><span>{current.category || 'Collection YNR'}</span><strong>{current.name}</strong></div>
      </a> : <div className="yn-hero-loading" aria-label="Chargement du showroom" />}
    <div className="yn-deck">
      <button type="button" className="yn-mode" disabled={!current} aria-pressed={showScene} onClick={() => setStudio(value => !value)}>{showScene ? 'Photos de la flotte' : 'Explorer en 3D'} <span aria-hidden="true">↗</span></button>
      {!showScene && photos.length > 1 && <div className="yn-pager"><button aria-label="Véhicule précédent" onClick={() => setIndex((index + photos.length - 1) % photos.length)}>←</button><span>{index % photos.length + 1} / {photos.length}</span><button aria-label="Véhicule suivant" onClick={() => setIndex((index + 1) % photos.length)}>→</button></div>}
    </div>
  </div>
}

export default function Showroom({ api, formatPricing, logo, defaultWhatsApp, defaultPhone }) {
  const [catalog, setCatalog] = useState({ vehicles: [], settings: {} })
  const [status, setStatus] = useState('loading')
  const [attempt, setAttempt] = useState(0)
  const [sort, setSort] = useState('recent')
  const [menu, setMenu] = useState(false)
  useEffect(() => {
    const controller = new AbortController()
    setStatus('loading')
    api('/public', { signal: controller.signal }).then(result => {
      if (!Array.isArray(result?.vehicles)) throw new Error('Catalogue illisible')
      setCatalog({ vehicles: result.vehicles, settings: result.settings || {} })
      setStatus('ready')
    }).catch(() => { if (!controller.signal.aborted) setStatus('error') })
    return () => controller.abort()
  }, [api, attempt])
  const vehicles = useMemo(() => {
    const amount = v => v.visiblePrices?.weekday24h === false || formatPricing(v).base <= 0 ? null : formatPricing(v).final
    return [...catalog.vehicles].sort((a, b) => {
      if (sort === 'name') return a.name.localeCompare(b.name, 'fr')
      if (sort === 'recent') return (Date.parse(b.createdAt || b.updatedAt) || 0) - (Date.parse(a.createdAt || a.updatedAt) || 0)
      const left = amount(a), right = amount(b)
      if (left === null || right === null) return Number(left === null) - Number(right === null)
      return sort === 'asc' ? left - right : right - left
    })
  }, [catalog.vehicles, sort, formatPricing])
  const settings = catalog.settings
  const whatsapp = /^https:\/\/(wa\.me|api\.whatsapp\.com)\//i.test(settings.whatsapp || '') ? settings.whatsapp : defaultWhatsApp
  const phone = settings.phone || defaultPhone
  return <div className="yn-show" id="top">
    <a className="yn-skip" href="#fleet">Aller à la flotte</a>
    <header className="yn-header"><div className="yn-shell yn-bar">
      <a className="yn-brand" href="#top" aria-label="YNR Location, accueil">{logo}<span>YNR <b>LOCATION</b></span></a>
      <nav aria-label="Navigation principale" id="yn-navigation" className={menu ? 'yn-nav expanded' : 'yn-nav'} onClick={() => setMenu(false)} onKeyDown={e => { if (e.key === 'Escape') {setMenu(false); document.getElementById('yn-toggle')?.focus()} }}>
        <a href="#fleet">La flotte</a><a href="#process">La réservation</a><a href="#contact">Contact</a>
      </nav>
      <a className="yn-contact-btn" href={whatsapp} target="_blank" rel="noreferrer">WhatsApp <ArrowUpRight size={15} /></a>
      <button id="yn-toggle" className="yn-toggle" aria-label={menu ? 'Fermer le menu' : 'Ouvrir le menu'} aria-expanded={menu} aria-controls="yn-navigation" onClick={() => setMenu(!menu)}>{menu ? <X /> : <Menu />}</button>
    </div></header>
    <main>
      <section id="experience" className="yn-hero"><div className="yn-shell yn-stage">
        <div className="yn-headline"><p className="yn-label"><i /> Location premium en Île-de-France</p>
          <h1>Prenez le <em>volant.</em></h1>
          <p className="yn-intro">{settings.tagline || 'Location de véhicules premium.'}</p>
          <a className="yn-primary" href="#fleet">Découvrir la flotte <ChevronDown size={17} /></a>
        </div>
        <div className="yn-model"><HeroGallery vehicles={catalog.vehicles} loading={status === 'loading'} /></div>
      </div></section>
      <section id="fleet" className="yn-fleet yn-shell">
        <div className="yn-section-head"><div><p className="yn-label">Collection YNR</p><h2>La flotte<span>.</span></h2></div>
          <label className="yn-sort">Trier par <select value={sort} onChange={e => setSort(e.target.value)}><option value="recent">Nouveautés</option><option value="asc">Prix croissant</option><option value="desc">Prix décroissant</option><option value="name">Nom du modèle</option></select></label>
        </div>
        {status === 'loading' ? <p role="status" className="yn-state">Chargement des véhicules…</p> : status === 'error' ? <div className="yn-state" role="alert">La flotte est momentanément inaccessible. <button onClick={() => setAttempt(n => n + 1)}>Réessayer</button></div> : vehicles.length ? <div className="yn-grid">{vehicles.map(v => <FleetCard key={v.id} vehicle={v} price={formatPricing(v)} />)}</div> : <p className="yn-state">La flotte est en cours de mise à jour. <a href={whatsapp}>Contacter YNR</a></p>}
      </section>
      <section id="process" className="yn-process"><div className="yn-shell"><p className="yn-label">La réservation</p><h2>Avant de <em>partir.</em></h2>
        <ol><li><h3>Choisissez votre véhicule</h3><p>Retrouvez les photos, les tarifs et la caution sur sa fiche.</p></li><li><h3>Indiquez vos dates</h3><p>Envoyez votre demande avec vos coordonnées et vos justificatifs.</p></li><li><h3>Confirmez avec YNR</h3><p>Notre équipe vous recontacte pour la disponibilité et les modalités de retrait.</p></li></ol>
      </div></section>
    </main>
    <footer id="contact" className="yn-footer"><div className="yn-shell"><div className="yn-footer-content"><div><p className="yn-label">Contact</p><h2>Parlons de votre <em>location.</em></h2></div><div className="yn-links">
      <ContactLink href={whatsapp}>WhatsApp</ContactLink><ContactLink href={'tel:' + phone.replace(/[^+\d]/g, '')}>{phone}</ContactLink>
      <ContactLink href={'mailto:' + (settings.email || 'ynr.location@gmail.com')}>E-mail</ContactLink>
      <ContactLink href={/^https:\/\/(www\.)?instagram\.com\//i.test(settings.instagram || '') ? settings.instagram : 'https://www.instagram.com/ynr_location/'}>Instagram</ContactLink><ContactLink href="https://snapchat.com/t/TMt4xEoz">Snapchat</ContactLink>
    </div></div><div className="yn-footline">© {new Date().getFullYear()} {settings.brand || 'YNR Luxury'}<a href="#top">Retour en haut ↑</a></div></div></footer>
  </div>
}
