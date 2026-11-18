// Data-only transitions shared by the API and their tests.
// Archiving is reversible: photos, pricing and descriptions remain untouched.
export function isArchived(vehicle) {
  return Boolean(vehicle && typeof vehicle.archivedAt === 'string' && vehicle.archivedAt.trim())
}

export function archiveVehicle(store, id, at = new Date().toISOString()) {
  const vehicle = store.vehicles.find(item => String(item.id) === String(id))
  if (!vehicle) return { status: 'missing' }
  if (isArchived(vehicle)) return { status: 'already-archived' }
  Object.assign(vehicle, { archivedAt: at, active: false, featured: false, updatedAt: at })
  return { status: 'archived', vehicle }
}

export function restoreVehicle(store, id, at = new Date().toISOString()) {
  const vehicle = store.vehicles.find(item => String(item.id) === String(id))
  if (!vehicle) return { status: 'missing' }
  if (!isArchived(vehicle)) return { status: 'not-archived' }
  delete vehicle.archivedAt
  Object.assign(vehicle, { active: true, featured: false, updatedAt: at })
  return { status: 'restored', vehicle }
}

export function removeArchivedVehicle(store, id) {
  const vehicle = store.vehicles.find(item => String(item.id) === String(id))
  if (!vehicle) return { status: 'missing' }
  if (!isArchived(vehicle)) return { status: 'not-archived' }
  store.vehicles = store.vehicles.filter(item => String(item.id) !== String(id))
  return { status: 'removed', vehicle }
}
