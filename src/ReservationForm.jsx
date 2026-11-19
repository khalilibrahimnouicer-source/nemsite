import React, {useRef, useState} from 'react'
import { ArrowUpRight, X } from 'lucide-react'
import { MotionDialog } from './CartAndDialog'

const documentTypes = [
  ['identity','Carte nationale d’identité'],
  ['license','Permis de conduire'],
  ['address','Justificatif de domicile de moins de 3 mois'],
]

function readDocument(file) {
  return new Promise((resolve,reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve({name:file.name, data:reader.result})
    reader.onerror = () => reject(new Error('Impossible de lire le fichier '+file.name+'.'))
    reader.readAsDataURL(file)
  })
}

export default function ReservationForm({vehicles,api,renderPrices,onClose,onSent}) {
  const [busy,setBusy] = useState(false)
  const [error,setError] = useState('')
  const [start,setStart] = useState('')
  const pending = useRef(false)
  const key = useRef('')
  const grouped = vehicles.length > 1

  async function submit(event) {
    event.preventDefault()
    if (pending.current) return
    pending.current = true
    const fields = new FormData(event.currentTarget)
    setBusy(true)
    setError('')
    try {
      const files = documentTypes.map(([type]) => fields.get(type))
      if (files.reduce((sum,file) => sum+file.size,0) > 3_150_000) throw new Error('Les trois justificatifs dépassent 3 Mo au total. Choisissez des fichiers plus légers.')
      const documents = Object.fromEntries(await Promise.all(documentTypes.map(async ([type],i) => [type,await readDocument(files[i])])))
      const details = Object.fromEntries(['name','email','phone','start','end','message'].map(field => [field,fields.get(field)]))
      if (!key.current) key.current = crypto.randomUUID()
      await api('/requests',{method:'POST',body:JSON.stringify({...details,vehicleIds:vehicles.map(v=>v.id),requestKey:key.current,documents})})
      onSent()
    } catch (failure) {
      setError(failure.message || 'Envoi impossible. Réessayez.')
    } finally {
      pending.current = false
      setBusy(false)
    }
  }

  return <MotionDialog variant="order" titleId="request-title" onClose={onClose} busy={busy}>{dismiss =>
    <form className="modal" onSubmit={submit} onChange={() => {key.current=''}}>
      <button type="button" className="close" aria-label="Fermer la demande" disabled={busy} onClick={dismiss}><X/></button>
      <p className="eyebrow">DEMANDE DE RÉSERVATION</p>
      <h2 id="request-title">{grouped ? 'Réserver '+vehicles.length+' véhicules' : vehicles[0].name}</h2>
      {grouped && <p>Les dates et les justificatifs s’appliquent à toute votre sélection.</p>}
      {vehicles.map(v => <div key={v.id} className="yn-request-vehicle">{grouped && <h3>{v.name}</h3>}{renderPrices(v)}</div>)}
      <fieldset disabled={busy} className="yn-request-fields">
        <div className="form-grid">
          <label>Nom<input name="name" autoComplete="name" required maxLength={100}/></label>
          <label>E-mail<input name="email" type="email" autoComplete="email" required/></label>
          <label>Téléphone<input name="phone" type="tel" autoComplete="tel" required/></label>
          <label>Date de départ<input name="start" type="date" required value={start} onChange={e=>setStart(e.target.value)}/></label>
          <label>Date de retour<input name="end" type="date" required min={start||undefined}/></label>
          <label className="wide">Message<textarea name="message" rows="3" maxLength={2000}/></label>
        </div>
        <fieldset className="documents-upload wide"><legend>Justificatifs</legend><p>Photos ou PDF, 3 Mo au total.</p>
          {documentTypes.map(([type,label])=><label key={type}>{label}<input name={type} required type="file" accept="image/jpeg,image/png,image/webp,application/pdf"/></label>)}
        </fieldset>
      </fieldset>
      {error&&<p className="form-error" role="alert">{error}</p>}
      <button className="btn wide-btn" aria-busy={busy} disabled={busy}>{busy?'Envoi en cours…':'Envoyer ma demande'} {busy?<span className="yn-submit-spinner"/>:<ArrowUpRight size={17}/>}</button>
      <small className="privacy">YNR vous recontactera pour confirmer la disponibilité. Aucun paiement en ligne.</small>
    </form>}
  </MotionDialog>
}
