import test from 'node:test'
import assert from 'node:assert/strict'
import {contentVersion,overwriteCatalog} from '../catalog-blob.mjs'

test('saves a new fleet order using the metadata ETag even when the download supplies a different ETag', async()=>{
  let content='["A","B"]'
  let saved
  const params={
    path:'catalog',previous:contentVersion(content),body:'["B","A"]',options:{access:'private'},
    head:async()=>({etag:'storage-version'}),
    get:async(_,opts)=>{assert.equal(opts.useCache,false);return {blob:{etag:'"download-version"'},stream:new Response(content).body}},
    put:async(_,body,opts)=>{assert.equal(opts.ifMatch,'storage-version');saved=body}
  }
  await overwriteCatalog(params)
  assert.equal(saved,'["B","A"]')
  content='["A","B","C"]'
  saved=null
  await assert.rejects(overwriteCatalog(params),{status:412})
  assert.equal(saved,null)
})
test('propagates a racing Blob update as a retryable conflict',async()=>{
  const body='[]'
  await assert.rejects(overwriteCatalog({path:'catalog',previous:contentVersion(body),body,
    head:async()=>({etag:'before'}),get:async()=>({stream:new Response(body).body}),
    put:async()=>{throw new Error('Vercel Blob: Precondition failed: ETag mismatch.')}
  }),{status:412})
})
