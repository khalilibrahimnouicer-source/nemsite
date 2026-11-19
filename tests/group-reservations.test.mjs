import test from 'node:test'
import assert from 'node:assert/strict'
import { registerReservations } from '../reservations.mjs'

const data = 'data:application/pdf;base64,' + Buffer.from('%PDF-1.7\n' + 'sample'.repeat(22)).toString('base64')
function booking() {
  return { name:'QA', email:'qa@example.test', phone:'0100000000', start:'2027-04-01', end:'2027-04-04',
    vehicleIds:['a','b'], requestKey:'065a03ab-8492-4a15-852e-5ff62026b824',
    documents:Object.fromEntries(['identity','license','address'].map(key => [key,{data}])) }
}
function setup(options = {}) {
  let handler
  const state = { vehicles:[{id:'a',name:'Alpha'},{id:'b',name:'Beta'}], requests:[], blocked:[] }
  const files = new Set(), notifications = []
  const readStore = async () => structuredClone(state)
  const writeStore = async value => { Object.assign(state, structuredClone(value)) }
  registerReservations({post(path, callback) { assert.equal(path,'/api/requests'); handler=callback }}, {
    readStore, writeStore, blobEnabled:true,
    put:async path => {files.add(path);return {pathname:path}}, del:async paths => { for(const path of paths) files.delete(path) },
    notifyReservation: async record => {notifications.push(record);return {sent:true}},
    blobOptions:(_,extra) => extra, isArchived:v => Boolean(v.archivedAt), clean:(v,n) => typeof v==='string' ? v.trim().slice(0,n) : '',
    ...options
  })
  async function post(body) {
    const res={code:200,status(code){this.code=code;return this},json(value){this.body=value;return this}}
    await handler({body,headers:{},socket:{}},res)
    return res
  }
  return {state,files,notifications,post}
}
test('A group is saved once with one document set and trusted vehicle names, including concurrent retries',async () => {
  const {state,files,notifications,post}=setup()
  const payload=booking()
  const results=await Promise.all([post(payload),post({...payload,vehicle:'Untrusted label'})])
  assert.deepEqual(results.map(r=>r.code),[200,200])
  assert.equal(state.requests.length,1);assert.equal(files.size,3);assert.equal(notifications.length,1)
  const record=state.requests[0]
  assert.deepEqual(record.vehicles,[{id:'a',name:'Alpha'},{id:'b',name:'Beta'}])
  assert.deepEqual(record.vehicleIds,['a','b']);assert.equal(record.vehicle,'Alpha · Beta')
  assert.equal((await post({...payload,end:'2027-04-05'})).code,409)
  assert.equal(state.requests.length,1)
})
test('Invalid or unavailable selection fails as a whole before uploading any document',async () => {
  const {state,files,notifications,post}=setup()
  assert.equal((await post({...booking(),vehicleIds:['a','missing']})).code,409)
  state.blocked=[{vehicleId:'b',start:'2027-03-31',end:'2027-04-01'}]
  assert.equal((await post(booking())).code,409)
  assert.equal((await post({...booking(),documents:{identity:{data}}})).code,400)
  assert.equal((await post({...booking(),start:'2027-02-30'})).code,400)
  assert.equal(state.requests.length,0);assert.equal(files.size,0);assert.equal(notifications.length,0)
})
test('Single-vehicle payloads remain compatible and reuse the persisted selection name',async () => {
  const {state,post}=setup()
  const payload=booking();delete payload.vehicleIds;delete payload.requestKey
  assert.equal((await post({...payload,vehicleId:'a',vehicle:'Wrong'})).code,200)
  assert.equal(state.requests[0].vehicle,'Alpha');assert.equal(state.requests[0].vehicleId,'a')
})
test('A failed second upload cleans up the batch without saving a request',async () => {
  let writes=0,removed=[]
  const {state,post}=setup({put: async () => { if (++writes===2) throw new Error('fixture upload failed') },del:async paths=>{removed=paths}})
  assert.equal((await post(booking())).code,503)
  assert.equal(removed.length,2);assert.equal(state.requests.length,0)
})
