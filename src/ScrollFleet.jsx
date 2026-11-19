import React, { useEffect, useRef } from 'react'
import { ArrowUpRight } from 'lucide-react'
import './scroll-fleet.css'
import { AddToCart } from './CartAndDialog'

// Each photograph follows its own position in the viewport. The page keeps native scrolling.
export function useVehicleScroll(fleet) {
  const root = useRef(null)
  useEffect(() => {
    const page = root.current
    if (!page) return
    const images = Array.from(page.querySelectorAll('[data-car-motion]'))
    const preference = window.matchMedia('(prefers-reduced-motion: reduce)')
    let frame = 0
    function paint() {
      frame = 0
      const height = window.innerHeight
      for (const image of images) {
        const box = image.getBoundingClientRect()
        if (box.bottom < 0 || box.top > height) continue
        const progress = Math.max(-1, Math.min(1, (height - 2 * box.top - box.height) / (height + box.height)))
        image.style.setProperty('--travel', progress.toFixed(4))
        const entry = Math.max(0, Math.min(1, (box.top / height - 0.46) / 0.54))
        image.style.setProperty('--entry', (entry * entry).toFixed(4))
      }
    }
    function schedule() {
      if (!preference.matches && !frame) frame = requestAnimationFrame(paint)
    }
    function reset() {
      images.forEach(image => {
        image.style.removeProperty('--travel')
        image.style.removeProperty('--entry')
      })
      schedule()
    }
    schedule()
    window.addEventListener('scroll', schedule, { passive: true })
    window.addEventListener('resize', schedule)
    preference.addEventListener('change', reset)
    return () => {
      window.removeEventListener('scroll', schedule)
      window.removeEventListener('resize', schedule)
      preference.removeEventListener('change', reset)
      cancelAnimationFrame(frame)
    }
  }, [fleet])
  return root
}

export function ScrollFleet({ vehicles, formatPricing }) {
  return <div className="drive-list">
    {vehicles.map(vehicle => {
      const url = '/vehicle/' + encodeURIComponent(vehicle.id)
      const price = formatPricing(vehicle)
      return <article className="drive-car" key={vehicle.id}>
        <a href={url} className="drive-frame" data-car-motion aria-label={'Voir ' + vehicle.name}>
          {vehicle.photos?.[0] ? <img src={vehicle.photos[0]} alt={vehicle.name} loading="lazy" decoding="async"/> : <span>Photos à venir</span>}
        </a>
        <div className="drive-copy">
          <p className="eyebrow">{vehicle.category || 'Collection YNR'}</p>
          <h3><a href={url}>{vehicle.name}</a></h3>
          {vehicle.description && <p className="drive-description">{vehicle.description}</p>}
          {vehicle.visiblePrices?.weekday24h !== false && price.base > 0 && <p className="drive-price"><strong>{price.final} €</strong> / 24 h en semaine</p>}
          <div className="drive-actions"><AddToCart vehicle={vehicle}/><a className="drive-link" href={url}>Voir le véhicule <ArrowUpRight size={17}/></a></div>
        </div>
      </article>
    })}
  </div>
}
