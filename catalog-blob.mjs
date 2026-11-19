// The Blob metadata API supplies the version token accepted by conditional writes.
// Check that this token still represents the exact content the caller edited.
import { createHash } from 'node:crypto'

export const contentVersion = raw => createHash('sha256').update(raw).digest('hex')

export async function overwriteCatalog({path,previous,body,head,get,put,options}) {
  const conflict = () => Object.assign(new Error('Le catalogue a changé. Actualisez et réessayez.'),{status:412})
  if (!previous) throw conflict()
  const metadata = await head(path,options)
  if (!metadata?.etag) throw new Error('Version du catalogue indisponible.')
  const current = await get(path,{...options,useCache:false})
  if (!current?.stream || contentVersion(await new Response(current.stream).text()) !== previous) throw conflict()
  try {
    await put(path,body,{...options,allowOverwrite:true,addRandomSuffix:false,contentType:'application/json',ifMatch:metadata.etag})
  } catch (error) {
    if (error.statusCode===412 || error.status===412 || error.name==='BlobPreconditionFailedError' || /precondition failed/i.test(error.message)) throw conflict()
    throw error
  }
}
