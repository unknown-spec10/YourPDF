/**
 * Cross-page file handoff.
 *
 * Dropping a PDF on a tool card (or chaining from a result) navigates to another route, which
 * wipes in-memory state. `sessionStorage` cannot hold this — it is string-only and capped around
 * 5 MB, while a request may legitimately carry up to 30 MB. IndexedDB stores the `File` itself
 * via structured clone, so the destination page can pick it up without re-asking the user.
 *
 * Entries are single-use: `takeFile` reads and deletes in one transaction, so a refresh cannot
 * resurrect a file the user has already moved on from.
 */

const DB_NAME = 'yourpdf-handoff'
const STORE = 'files'
const VERSION = 1

/** Route keys ignore trailing slashes so `/compress` and `/compress/` agree. */
function key(path: string): string {
  return path.replace(/\/+$/, '') || '/'
}

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, VERSION)
    request.onupgradeneeded = () => {
      const db = request.result
      if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE)
    }
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error)
  })
}

export async function stashFile(path: string, file: File): Promise<void> {
  if (typeof indexedDB === 'undefined') return
  const db = await openDb()
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite')
    tx.objectStore(STORE).put(file, key(path))
    tx.oncomplete = () => resolve()
    tx.onerror = () => reject(tx.error)
  })
  db.close()
}

/** Read and remove in one transaction: the handoff is single-use. */
export async function takeFile(path: string): Promise<File | null> {
  if (typeof indexedDB === 'undefined') return null
  const db = await openDb()
  const file = await new Promise<File | null>((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite')
    const store = tx.objectStore(STORE)
    const get = store.get(key(path))
    get.onsuccess = () => {
      const value = get.result as File | undefined
      if (value) store.delete(key(path))
      resolve(value ?? null)
    }
    get.onerror = () => reject(get.error)
  })
  db.close()
  return file
}
