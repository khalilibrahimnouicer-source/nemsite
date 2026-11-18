import test from 'node:test'
import assert from 'node:assert/strict'
import { archiveVehicle, restoreVehicle, removeArchivedVehicle, isArchived } from '../archive-vehicles.mjs'

const initial = () => ({
  vehicles: [
    { id: 'car-1', name: 'BMW M3', active: true, featured: true, price: 350, pricing: { weekday24h: 350 }, description: 'Full options', photos: ['/api/media/vehicles/test/a.jpg', '/api/media/vehicles/test/b.jpg'], featuredPhoto: '/api/media/vehicles/test/a.jpg', createdAt: '2026-01-01T00:00:00.000Z' },
    { id: 'car-2', name: 'Porsche', active: true, featured: false, photos: ['https://example.com/car.jpg'] }
  ]
})

test('archiving hides the car, preserves its details and does not affect another car', () => {
  const store = initial(), sibling = structuredClone(store.vehicles[1])
  const result = archiveVehicle(store, 'car-1', '2026-11-18T12:00:00.000Z')
  assert.equal(result.status, 'archived')
  assert.equal(isArchived(store.vehicles[0]), true)
  assert.equal(store.vehicles[0].active, false)
  assert.equal(store.vehicles[0].featured, false)
  assert.equal(store.vehicles[0].archivedAt, '2026-11-18T12:00:00.000Z')
  assert.deepEqual(store.vehicles[0].photos, initial().vehicles[0].photos)
  assert.equal(store.vehicles[0].price, 350)
  assert.equal(store.vehicles[0].description, 'Full options')
  assert.deepEqual(store.vehicles[1], sibling)
})

test('restoration republishes without re-entering details or re-uploading photos', () => {
  const store = initial()
  archiveVehicle(store, 'car-1')
  const result = restoreVehicle(store, 'car-1')
  assert.equal(result.status, 'restored')
  assert.equal(isArchived(store.vehicles[0]), false)
  assert.equal(store.vehicles[0].active, true)
  assert.equal(store.vehicles[0].featured, false)
  assert.deepEqual(store.vehicles[0].photos, initial().vehicles[0].photos)
  assert.deepEqual(store.vehicles[0].pricing, { weekday24h: 350 })
  assert.equal(store.vehicles.length, 2)
})

test('permanent deletion is only possible from archives', () => {
  const store = initial()
  assert.equal(removeArchivedVehicle(store, 'car-1').status, 'not-archived')
  assert.equal(store.vehicles.length, 2)
  archiveVehicle(store, 'car-1')
  const removed = removeArchivedVehicle(store, 'car-1')
  assert.equal(removed.status, 'removed')
  assert.equal(removed.vehicle.id, 'car-1')
  assert.deepEqual(store.vehicles.map(v => v.id), ['car-2'])
})

test('repeat / invalid operations are safe', () => {
  const store = initial()
  assert.equal(restoreVehicle(store, 'car-1').status, 'not-archived')
  assert.equal(archiveVehicle(store, 'missing').status, 'missing')
  assert.equal(restoreVehicle(store, 'missing').status, 'missing')
  assert.equal(removeArchivedVehicle(store, 'missing').status, 'missing')
  assert.equal(archiveVehicle(store, 'car-1').status, 'archived')
  assert.equal(archiveVehicle(store, 'car-1').status, 'already-archived')
  assert.equal(removeArchivedVehicle(store, 'car-2').status, 'not-archived')
  assert.equal(store.vehicles.length, 2)
})

test('archived vehicle data survives serialization and can be restored', () => {
  const store = initial()
  archiveVehicle(store, 'car-1')
  const reloaded = JSON.parse(JSON.stringify(store))
  assert.equal(restoreVehicle(reloaded, 'car-1').status, 'restored')
  assert.deepEqual(reloaded.vehicles[0].photos, initial().vehicles[0].photos)
})
