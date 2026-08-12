const databaseName = 'go-slim'
const databaseVersion = 1
const storeName = 'assistant-state'
const snapshotKey = 'current'
const debounceMs = 500
const maximumWaitMs = 2_000

type SnapshotRecord<T> = {
  key: typeof snapshotKey
  snapshot: T
}

export interface AiPersistence {
  load(): Promise<unknown | null>
  schedule(): void
  flush(): Promise<void>
  clear(): Promise<void>
  destroy(): Promise<void>
}

const transactionError = (transaction: IDBTransaction): Error =>
  transaction.error ?? new Error('The IndexedDB transaction failed.')

export const createAiPersistence = <T>(
  getSnapshot: () => T,
  onError: (error: unknown) => void = (error) => {
    console.warn('Could not persist the AI conversation.', error)
  },
): AiPersistence => {
  let database: IDBDatabase | null = null
  let databasePromise: Promise<IDBDatabase> | null = null
  let debounceTimer: number | null = null
  let maximumWaitTimer: number | null = null
  let dirty = false
  let destroying = false
  let destroyed = false
  let writeChain: Promise<void> = Promise.resolve()

  const cancelTimers = () => {
    if (debounceTimer !== null) window.clearTimeout(debounceTimer)
    if (maximumWaitTimer !== null) window.clearTimeout(maximumWaitTimer)
    debounceTimer = null
    maximumWaitTimer = null
  }

  const openDatabase = (): Promise<IDBDatabase> => {
    if (destroyed) {
      return Promise.reject(new Error('IndexedDB persistence is closed.'))
    }
    if (database !== null) return Promise.resolve(database)
    if (databasePromise !== null) return databasePromise
    if (!('indexedDB' in globalThis)) {
      return Promise.reject(new Error('IndexedDB is unavailable.'))
    }

    databasePromise = new Promise((resolve, reject) => {
      const request = indexedDB.open(databaseName, databaseVersion)
      let settled = false

      const fail = (error: unknown) => {
        if (settled) return
        settled = true
        databasePromise = null
        reject(error)
      }

      request.onupgradeneeded = () => {
        const nextDatabase = request.result
        if (!nextDatabase.objectStoreNames.contains(storeName)) {
          nextDatabase.createObjectStore(storeName, { keyPath: 'key' })
        }
      }
      request.onerror = () =>
        fail(request.error ?? new Error('Could not open IndexedDB.'))
      request.onblocked = () =>
        fail(new Error('The IndexedDB upgrade was blocked by another tab.'))
      request.onsuccess = () => {
        if (settled) {
          request.result.close()
          return
        }

        settled = true
        const openedDatabase = request.result
        database = openedDatabase
        openedDatabase.onversionchange = () => {
          openedDatabase.close()
          if (database === openedDatabase) {
            database = null
            databasePromise = null
          }
        }
        resolve(openedDatabase)
      }
    })

    return databasePromise
  }

  const readSnapshot = async (): Promise<unknown | null> => {
    const nextDatabase = await openDatabase()
    return await new Promise((resolve, reject) => {
      const transaction = nextDatabase.transaction(storeName, 'readonly')
      const request = transaction.objectStore(storeName).get(snapshotKey)
      let value: unknown | null = null

      request.onsuccess = () => {
        const record = request.result as SnapshotRecord<unknown> | undefined
        value = record?.snapshot ?? null
      }
      transaction.oncomplete = () => resolve(value)
      transaction.onerror = () => reject(transactionError(transaction))
      transaction.onabort = () => reject(transactionError(transaction))
    })
  }

  const writeSnapshot = async (snapshot: T): Promise<void> => {
    const nextDatabase = await openDatabase()
    await new Promise<void>((resolve, reject) => {
      const transaction = nextDatabase.transaction(storeName, 'readwrite')
      transaction.objectStore(storeName).put({
        key: snapshotKey,
        snapshot,
      } satisfies SnapshotRecord<T>)
      transaction.oncomplete = () => resolve()
      transaction.onerror = () => reject(transactionError(transaction))
      transaction.onabort = () => reject(transactionError(transaction))
    })
  }

  const deleteSnapshot = async (): Promise<void> => {
    const nextDatabase = await openDatabase()
    await new Promise<void>((resolve, reject) => {
      const transaction = nextDatabase.transaction(storeName, 'readwrite')
      transaction.objectStore(storeName).delete(snapshotKey)
      transaction.oncomplete = () => resolve()
      transaction.onerror = () => reject(transactionError(transaction))
      transaction.onabort = () => reject(transactionError(transaction))
    })
  }

  const queueWrite = (operation: () => Promise<void>): Promise<void> => {
    const nextOperation = writeChain.catch(() => undefined).then(operation)
    writeChain = nextOperation.catch(() => undefined)
    return nextOperation
  }

  const persistence: AiPersistence = {
    load: readSnapshot,

    schedule() {
      if (destroying || destroyed) return
      dirty = true

      if (debounceTimer !== null) window.clearTimeout(debounceTimer)
      debounceTimer = window.setTimeout(() => {
        void persistence.flush().catch(onError)
      }, debounceMs)

      maximumWaitTimer ??= window.setTimeout(() => {
        void persistence.flush().catch(onError)
      }, maximumWaitMs)
    },

    async flush() {
      if (destroyed || !dirty) {
        await writeChain
        return
      }

      cancelTimers()
      dirty = false
      const snapshot = getSnapshot()
      try {
        await queueWrite(() => writeSnapshot(snapshot))
      } catch (error) {
        dirty = true
        throw error
      }
    },

    async clear() {
      cancelTimers()
      dirty = false
      await queueWrite(deleteSnapshot)
    },

    async destroy() {
      if (destroyed || destroying) return
      const finalWrite = dirty ? persistence.flush().catch(onError) : writeChain
      destroying = true
      cancelTimers()
      const pendingOpen = databasePromise
      await Promise.allSettled([finalWrite, pendingOpen ?? Promise.resolve()])
      destroyed = true
      try {
        database?.close()
      } finally {
        database = null
        databasePromise = null
      }
    },
  }

  return persistence
}
