import React, { useEffect, useRef, useState } from 'react'
import { ArrowUpRight, Check, Plus, ShoppingBag, X } from 'lucide-react'
import './checkout-motion.css'

const cartKey = 'ynr-cart'
function readCart() {
  try {
    const items = JSON.parse(localStorage.getItem(cartKey) || '[]')
    return Array.isArray(items) ? items.filter(item => item && item.id != null) : []
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
    if (!latest.some(item => String(item.id) === String(vehicle.id))) writeCart([...latest, {id:vehicle.id, name:vehicle.name}])
  }}>
    <span key={String(added)} className="yn-add-inner">{added ? <Check size={17}/> : <Plus size={17}/>} {added ? 'Ajouté · Voir le panier' : 'Ajouter au panier'}</span>
  </button>
}

export function CartWidget() {
  const items = useCart()
  const [open,setOpen] = useState(false)
  useEffect(() => {
    const show = () => setOpen(true)
    window.addEventListener('ynr-open-cart', show)
    return () => window.removeEventListener('ynr-open-cart', show)
  }, [])
  return <>
    <button className="cart-fab yn-cart-fab" type="button" onClick={() => setOpen(true)} aria-haspopup="dialog" aria-label={'Ouvrir le panier, '+items.length+' véhicule(s)'}>
      <ShoppingBag size={16} aria-hidden="true"/> Panier <strong key={items.length}>{items.length}</strong>
    </button>
    {open && <MotionDialog variant="cart" titleId="yn-cart-title" onClose={() => setOpen(false)}>{dismiss =>
      <div className="yn-cart-sheet">
        <div className="yn-cart-top"><h2 id="yn-cart-title">Mon panier</h2><button type="button" aria-label="Fermer le panier" onClick={dismiss}><X size={20}/></button></div>
        {items.length ? <ul>{items.map(item => {
          const url='/vehicle/'+encodeURIComponent(item.id)
          return <li key={item.id}><a className="yn-item-title" href={url}>{item.name}</a>
            <div className="yn-item-actions"><a href={url+'#reservation'} onClick={() => setOpen(false)}>Demander ce véhicule <ArrowUpRight size={15}/></a>
            <button onClick={() => writeCart(readCart().filter(v => String(v.id)!==String(item.id)))} aria-label={'Retirer '+item.name}>Retirer</button></div></li>
        })}</ul> : <p className="yn-cart-empty">Votre panier est vide.</p>}
      </div>}
    </MotionDialog>}
  </>
}
