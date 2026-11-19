import React, { useEffect, useMemo, useState } from 'react'
import { ArrowDown, ArrowUp, Check, ShoppingBag } from 'lucide-react'
import './fleet-tools.css'

const money = new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR', maximumFractionDigits: 2 })
const timestamp = new Intl.DateTimeFormat('fr-FR', { dateStyle: 'short', timeStyle: 'short' })

function published(vehicles) {
  return (vehicles || []).filter(vehicle => !vehicle.archivedAt && vehicle.active !== false)
}

function VehiclePicture({ vehicle }) {
  const photo = vehicle?.photos?.[0]
  return photo ? <img className="ft-photo" src={photo} alt="" loading="lazy" /> : <span className="ft-photo ft-placeholder">YNR</span>
}

export function FleetOrder({ vehicles, api, onSaved }) {
  const active = useMemo(() => published(vehicles), [vehicles])
  const ids = active.map(vehicle => vehicle.id)
  const [draft, setDraft] = useState(null)
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')
  const byId = new Map(active.map(vehicle => [vehicle.id, vehicle]))
  const order = draft ? [...draft.filter(id => byId.has(id)), ...ids.filter(id => !draft.includes(id))] : ids
  const changed = order.some((id, index) => id !== ids[index])

  function move(index, offset) {
    const next = [...order]
    const target = index + offset
    if (target < 0 || target >= next.length) return
    ;[next[index], next[target]] = [next[target], next[index]]
    setDraft(next)
    setError('')
    setMessage(byId.get(next[target]).name + ' en position ' + (target + 1) + ' sur ' + next.length + '.')
  }
  async function save() {
    setBusy(true)
    setError('')
    setMessage('')
    try {
      await api('/fleet-order', { method: 'PUT', body: JSON.stringify({ ids: order }) })
      await onSaved()
      setDraft(null)
      setMessage('Ordre enregistré pour la flotte publique.')
    } catch (failure) {
      setError(failure.message || 'Impossible d’enregistrer le classement.')
    } finally {
      setBusy(false)
    }
  }

  return <section className="ft-panel ft-order">
    <h2>Ordre de la flotte</h2>
    <p className="ft-intro">Placez en haut les voitures que les visiteurs verront en premier.</p>
    {order.length ? <ol className="ft-rows">{order.map((id, index) => {
      const vehicle = byId.get(id)
      return <li key={id}>
        <span className="ft-position" aria-hidden="true">{index + 1}</span>
        <VehiclePicture vehicle={vehicle} />
        <strong>{vehicle.name}</strong>
        <div className="ft-arrows">
          <button type="button" aria-label={'Monter ' + vehicle.name} disabled={busy || index === 0} onClick={() => move(index, -1)}><ArrowUp size={16} /></button>
          <button type="button" aria-label={'Descendre ' + vehicle.name} disabled={busy || index === order.length - 1} onClick={() => move(index, 1)}><ArrowDown size={16} /></button>
        </div>
      </li>
    })}</ol> : <p>Aucun véhicule en ligne.</p>}
    <div className="ft-actions">
      <button className="ft-primary" type="button" onClick={save} disabled={!changed || busy}>{busy ? 'Enregistrement…' : 'Enregistrer l’ordre'}</button>
      {changed && <button type="button" className="ft-link" disabled={busy} onClick={() => {setDraft(null); setMessage('Modifications annulées.'); setError('')}}>Annuler</button>}
    </div>
    {message && <p className="ft-message" role="status">{message}</p>}
    {error && <p className="ft-error" role="alert">{error}</p>}
  </section>
}

export function SaleLab({ vehicles, api }) {
  const active = useMemo(() => published(vehicles), [vehicles])
  const [lab, setLab] = useState(null)
  const [retry, setRetry] = useState(0)
  const [editing, setEditing] = useState(null)
  const [busy, setBusy] = useState('')
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')
  const byId = new Map(active.map(vehicle => [String(vehicle.id), vehicle]))

  useEffect(() => {
    const controller = new AbortController()
    setError('')
    api('/sale-lab', { signal: controller.signal })
      .then(result => { if (!controller.signal.aborted) setLab(result) })
      .catch(failure => { if (!controller.signal.aborted) setError(failure.message) })
    return () => controller.abort()
  }, [api, retry])

  function choose(id) {
    const offer = lab?.offers.find(item => String(item.vehicleId) === id)
    setEditing({ id, price:offer ? String(offer.price) : '' })
    setMessage('')
    setError('')
  }
  const vehicleId = editing?.id || String(active[0]?.id || '')
  const offer = lab?.offers.find(item => String(item.vehicleId) === vehicleId)
  const price = editing?.price ?? (offer ? String(offer.price) : '')

  async function mutate(path, method, payload, key, success) {
    setBusy(key)
    setMessage('')
    setError('')
    try {
      const result = await api(path, { method, body:JSON.stringify(payload) })
      setLab(result)
      setMessage(success)
    } catch (failure) {
      setError(failure.message || 'La simulation a échoué.')
    } finally {
      setBusy('')
    }
  }

  return <section className="ft-panel">
    <h2>Ventes en test</h2>
    <p className="ft-intro">Espace privé de l’administration. Les annonces et les achats simulés restent ici, sans paiement.</p>
    {!lab && !error && <p role="status">Chargement des essais…</p>}
    {error && <p className="ft-error" role="alert">{error}</p>}
    {!lab && error && <button className="ft-primary" onClick={() => setRetry(value => value + 1)}>Réessayer</button>}
    {lab && <>
      {active.length > 0 ? <form className="ft-sale-form" onSubmit={event => {
        event.preventDefault()
        mutate('/sale-lab/offers','PUT',{ vehicleId, price:Number(price) },'offer','Annonce de test enregistrée.')
      }}>
        <label>Véhicule<select disabled={!!busy} value={vehicleId} onChange={e => choose(e.target.value)}>{active.map(vehicle => <option key={vehicle.id} value={vehicle.id}>{vehicle.name}</option>)}</select></label>
        <label>Prix de vente (€)<input type="number" required min="0.01" step="0.01" placeholder="Ex. 65 000" value={price} disabled={!!busy} onChange={e => setEditing({id:vehicleId, price:e.target.value})}/></label>
        <button className="ft-primary" disabled={!!busy || !byId.has(vehicleId)}>{busy === 'offer' ? 'Enregistrement…' : 'Enregistrer le brouillon'}</button>
      </form> : <p>Ajoutez un véhicule à la flotte pour préparer une annonce.</p>}
      {message && <p className="ft-message" role="status"><Check size={15} aria-hidden="true"/> {message}</p>}
      <h3>Aperçu des annonces</h3>
      {lab.offers.length ? <div className="ft-offers">{lab.offers.map(item => <article key={item.id}>
        <VehiclePicture vehicle={byId.get(String(item.vehicleId))}/>
        <div className="ft-offer-body"><h4>{item.name}</h4><p>{money.format(item.price)}</p>
          <button className="ft-secondary" type="button" disabled={!!busy || !byId.has(String(item.vehicleId))} onClick={() => mutate('/sale-lab/orders','POST',{offerId:item.id},item.id,'Achat simulé enregistré pour ' + item.name + '.')}><ShoppingBag size={16} /> {busy === item.id ? 'Simulation…' : 'Simuler un achat'}</button>
        </div>
      </article>)}</div> : <p className="ft-intro">Les brouillons enregistrés apparaîtront ici.</p>}
      <h3>Historique des achats simulés</h3>
      {lab.orders.length ? <ul className="ft-history">{lab.orders.map(order => <li key={order.id}><strong>{order.name}</strong><span>{money.format(order.price)}</span><time dateTime={order.createdAt}>{timestamp.format(new Date(order.createdAt))}</time></li>)}</ul> : <p className="ft-intro">Aucun achat simulé.</p>}
    </>}
  </section>
}
