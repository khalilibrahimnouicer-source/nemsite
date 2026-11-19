import React, { useEffect, useRef, useState } from 'react'
import { ArrowUpRight, Check, Plus, ShoppingBag, X } from 'lucide-react'
import './checkout-motion.css'

const cartKey = 'ynr-cart'
function readCart() {
  try {
    const items = JSON.parse(localStorage.getItem(cartKey) || '[]')
    if (!Array.isArray(items)) return []
    const unique = new Map()
    for (const item of items) {
      if (item?.id != null) unique.set(String(item.id), item)
    }
    return [...unique.values()]
  } catch { return [] }
}
function writeCart(items) {
  localStorage.setItem(cartKey, JSON.stringify(items))
  window.dispatchEvent(new Event('ynr-cart-change'))
}
function useCart() {
  const [items, setItems] = useState(readCart)
  useEffect(() => {
    const sync = () => setItems(readCart())
    window.addEventListener('ynr-cart-change', sync)
    window.addEventListener('storage', sync)
    return () => {
      window.removeEventListener('ynr-cart-change', sync)
      window.removeEventListener('storage', sync)
    }
  }, [])
  return items
}

export function MotionDialog({ variant, titleId, onClose, busy = false, children }) {
  const ref = useRef(null)
  const closing = useRef(false)
  useEffect(() => {
    const dialog = ref.current
    const previous = document.activeElement
    const overflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    dialog.showModal()
    return () => {
      dialog.close()
      document.body.style.overflow = overflow
      if (previous instanceof HTMLElement && previous.isConnected) previous.focus({ preventScroll:true })
    }
  }, [])
  function dismiss() {
    if (busy || closing.current || !onClose) return
    closing.current = true
    const dialog = ref.current
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches || !dialog.animate) { onClose(); return }
    dialog.classList.add('is-closing')
    const transform = variant === 'cart' ? 'translateX(100%)' : 'translateY(18px) scale(.985)'
    const animation = dialog.animate([{ opacity:1, transform:'none' }, { opacity:0, transform }], { duration:170, easing:'ease-in', fill:'forwards' })
    animation.finished.then(onClose, () => {})
  }
  return <dialog ref={ref} className={'yn-dialog yn-dialog-' + variant} aria-labelledby={titleId}
    onCancel={e => { e.preventDefault(); dismiss() }}
    onClick={e => {
      if (e.target !== ref.current) return
      const rect = ref.current.getBoundingClientRect()
      if (e.clientX < rect.left || e.clientX > rect.right || e.clientY < rect.top || e.clientY > rect.bottom) dismiss()
    }}>
    {children(dismiss)}
  </dialog>
}

export function AddToCart({vehicle}) {
  const items = useCart()
  const added = items.some(item => String(item.id) === String(vehicle.id))
  return <button type="button" className="cart-add yn-add" aria-live="polite" onClick={() => {
    if (added) { window.dispatchEvent(new Event('ynr-open-cart')); return }
    const latest = readCart()
    if (!latest.some(item => String(item.id) === String(vehicle.id))) {
      const photo = vehicle.photos?.[0]
      writeCart([...latest, { id:vehicle.id, name:vehicle.name, photo:photo?.startsWith('/api/media/') ? photo : '' }])
    }
  }}>
    <span key={String(added)} className="yn-add-inner">{added ? <Check size={17}/> : <Plus size={17}/>} {added ? 'Ajouté · Voir le panier' : 'Ajouter au panier'}</span>
  </button>
}

function CartVehicle({item, vehicle, unavailable, loading}) {
  const name = vehicle?.name || item.name
  const href = '/vehicle/' + encodeURIComponent(item.id)
  const photo = vehicle?.photos?.[0] || (loading ? item.photo : '')
  function tilt(event) {
    if (event.pointerType !== 'mouse' || !matchMedia('(hover:hover) and (prefers-reduced-motion:no-preference)').matches) return
    const card=event.currentTarget
    const rect=card.getBoundingClientRect()
    card.style.setProperty('--yaw', ((event.clientX-rect.left)/rect.width-.5)*6+'deg')
    card.style.setProperty('--pitch', (.5-(event.clientY-rect.top)/rect.height)*4+'deg')
  }
  function reset(event) {
    event.currentTarget.style.removeProperty('--yaw')
    event.currentTarget.style.removeProperty('--pitch')
  }
  return <li className="yn-group-card" onPointerMove={tilt} onPointerLeave={reset}>
    {photo && <img className="yn-group-photo" src={photo} alt="" loading="lazy" decoding="async"/>}
    <div className="yn-group-copy">
      {unavailable ? <strong className="yn-item-title">{name}</strong> : <a className="yn-item-title" href={href}>{name}</a>}
      {unavailable && <small>Retiré de la flotte</small>}
      <button className="yn-remove" type="button" aria-label={'Retirer '+name} onClick={() => writeCart(readCart().filter(v => String(v.id)!==String(item.id)))}>Retirer</button>
    </div>
  </li>
}

export function CartWidget({renderCheckout, renderConfirmation}) {
  const items = useCart()
  const [step, setStep] = useState('closed')
  const [catalog, setCatalog] = useState(null)
  const [error, setError] = useState(false)
  const [attempt, setAttempt] = useState(0)
  const [selection, setSelection] = useState([])
  function showCart() {
    setError(false)
    setCatalog(null)
    setStep('cart')
  }
  useEffect(() => {
    window.addEventListener('ynr-open-cart', showCart)
    return () => window.removeEventListener('ynr-open-cart', showCart)
  }, [])
  useEffect(() => {
    if (step !== 'cart') return
    const controller = new AbortController()
    fetch('/api/public', {cache:'no-store', signal:controller.signal}).then(async response => {
      if (!response.ok) throw new Error()
      const data = await response.json()
      if (!Array.isArray(data.vehicles)) throw new Error()
      setCatalog(new Map(data.vehicles.map(v => [String(v.id), v])))
    }).catch(() => { if (!controller.signal.aborted) setError(true) })
    return () => controller.abort()
  }, [step,attempt])
  const selected = items.map(item => catalog?.get(String(item.id))).filter(Boolean)
  const missing = catalog && selected.length !== items.length
  function confirmed() {
    const submitted = new Set(selection.map(v => String(v.id)))
    writeCart(readCart().filter(item => !submitted.has(String(item.id))))
    setSelection([])
    setStep('success')
  }
  return <>
    <button className="cart-fab yn-cart-fab" type="button" onClick={showCart} aria-haspopup="dialog" aria-label={'Ouvrir le panier, '+items.length+' véhicule(s)'}>
      <ShoppingBag size={16} aria-hidden="true"/> Panier <strong key={items.length}>{items.length}</strong>
    </button>
    {step === 'cart' && <MotionDialog variant="cart" titleId="yn-cart-title" onClose={() => setStep('closed')}>{dismiss =>
      <div className="yn-cart-sheet">
        <div className="yn-cart-top"><h2 id="yn-cart-title">Mon panier</h2><button type="button" aria-label="Fermer le panier" onClick={dismiss}><X size={20}/></button></div>
        {items.length ? <>
          <ul className="yn-group-list">{items.map(item => <CartVehicle key={item.id} item={item} vehicle={catalog?.get(String(item.id))} unavailable={catalog && !catalog.has(String(item.id))} loading={!catalog && !error}/>)}</ul>
          <div className="yn-group-action">
            {error ? <p role="alert">La flotte est momentanément inaccessible. <button className="yn-retry" onClick={() => {setError(false);setAttempt(value => value+1)}}>Réessayer</button></p> :
             missing ? <p role="status">Retirez les véhicules indisponibles pour continuer.</p> :
             !catalog ? <p role="status">Vérification de la flotte…</p> :
             <p>Une seule demande pour vos dates et vos justificatifs.</p>}
            <button className="yn-group-submit" type="button" disabled={!catalog || missing || error} onClick={() => {setSelection(selected);setStep('checkout')}}>
              {items.length === 1 ? 'Réserver ce véhicule' : 'Réserver les '+items.length+' véhicules'} <ArrowUpRight size={18}/>
            </button>
          </div>
        </> : <p className="yn-cart-empty">Votre panier est vide.</p>}
      </div>}
    </MotionDialog>}
    {step === 'checkout' && renderCheckout(selection, showCart, confirmed)}
    {step === 'success' && renderConfirmation()}
  </>
}
