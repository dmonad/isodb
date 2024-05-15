import * as common from './common.js'
import * as idb from 'lib0/indexeddb'
import * as object from 'lib0/object'
import * as encoding from 'lib0/encoding'
import * as decoding from 'lib0/decoding'
import * as error from 'lib0/error'
import * as promise from 'lib0/promise'
import * as buffer from 'lib0/buffer'
import * as string from 'lib0/string'
import * as binary from 'lib0/binary'
import * as time from 'lib0/time'

export const name = 'isodb-indexeddb'

export * from './common.js'

/**
 * @param {typeof common.IEncodable} V
 * @param {common.IEncodable} value
 * @return {Uint8Array | CryptoKey}
 */
const encodeValue = (V, value) => {
  if (value == null || /** @type {any} */ (value).constructor !== V) {
    value = new V(value)
  }
  const encoder = encoding.createEncoder()
  switch (value.constructor) {
    case common.CryptoKeyValue: {
      return /** @type {common.CryptoKeyValue} */ (value).key
    }
    default: {
      value.encode(encoder)
    }
  }
  return encoding.toUint8Array(encoder)
}

/**
 * @param {typeof common.IEncodable} K
 * @param {common.IEncodable} key
 * @return {Uint8Array|string|number}
 */
const encodeKey = (K, key) => {
  if (key == null || /** @type {any} */ (key).constructor !== K) {
    key = new K(key)
  }
  switch (key.constructor) {
    case common.AutoKey:
      return /** @type {common.AutoKey} */ (key).v
    case common.StringKey:
      return /** @type {common.StringKey} */ (key).v
    case common.BinaryKey:
      return /** @type {common.BinaryKey} */ (key).v
  }
  const encoder = encoding.createEncoder()
  key.encode(encoder)
  return encoding.toUint8Array(encoder)
}

/**
 * @param {typeof common.IEncodable} keytype
 * @return {function(any):common.IEncodable | null}
 */
const getKeyDecoder = (keytype) => {
  switch (/** @type {any} */ (keytype)) {
    case common.AutoKey:
      /* c8 ignore next */
      return id => id != null ? new common.AutoKey(id) : null
    case common.StringKey:
      /* c8 ignore next */
      return id => id != null ? new common.StringKey(id) : null
    case common.BinaryKey:
      /* c8 ignore next */
      return id => id != null ? new common.BinaryKey(id) : null
    default:
      /* c8 ignore next */
      return id => id != null ? keytype.decode(decoding.createDecoder(buffer.createUint8ArrayFromArrayBuffer(id))) : null
  }
}

/**
 * @param {string|number|Uint8Array} prefix
 */
const _appendBytesToPrefix = prefix => {
  switch (prefix.constructor) {
    case String:
      return prefix + string.MAX_UTF16_CHARACTER
    case Uint8Array:
      return encoding.encode(encoder => {
        encoding.writeUint8Array(encoder, /** @type {Uint8Array} */ (prefix))
        encoding.writeUint8(encoder, binary.BITS8)
      })
    /* c8 ignore next 2 */
    default:
      error.unexpectedCase()
  }
}

/**
 * @template {typeof common.IEncodable} KEY
 * @param {KEY} K
 * @param {Partial<common.PrefixedRangeOption<KEY>&common.StartEndRangeOption<KEY>>} range
 */
const toNativeRange = (K, range) => {
  const prefix = range.prefix != null ? common.encodePrefix(K, range.prefix) : null
  const reverse = range.reverse === true
  // @todo make sure that start/endExclusive is standardize (e.g. always inclusive by default)
  const startExclusive = prefix != null ? false : range.startExclusive === true
  const endExclusive = prefix != null ? true : range.endExclusive === true
  const lowerExclusive = reverse ? endExclusive : startExclusive
  const upperExclusive = reverse ? startExclusive : endExclusive
  const start = prefix != null ? prefix : (range.start && encodeKey(K, range.start))
  const end = prefix != null ? _appendBytesToPrefix(prefix) : (range.end && encodeKey(K, range.end))
  const lower = reverse ? end : start
  const upper = reverse ? start : end
  if (lower && upper) {
    return idb.createIDBKeyRangeBound(lower, upper, lowerExclusive, upperExclusive)
  }
  if (lower) {
    return idb.createIDBKeyRangeLowerBound(lower, lowerExclusive)
  }
  if (upper) {
    return idb.createIDBKeyRangeUpperBound(upper, upperExclusive)
  }
  return null
}

/**
 * @param {common.RangeOption<any>} range
 */
const getRangeLimit = range => range.limit != null && range.limit > 0 ? range.limit : undefined

/**
 * @template {typeof common.IEncodable} KEY
 * @template {typeof common.IEncodable} VALUE
 * @template {{[key: string]: common.ITableIndex<any, any, any>}} INDEX
 *
 * @implements {common.ITable<KEY,VALUE,INDEX,undefined>}
 */
class Table {
  /**
   * @param {IDBObjectStore} store
   * @param {KEY} K
   * @param {VALUE} V
   */
  constructor (store, K, V) {
    this.store = store
    this.K = K
    this.V = V
    // decode key
    this._dK = getKeyDecoder(K)
    /**
     * @type {{ [Indexname in keyof INDEX]: common.IndexedTable<KEY, VALUE, InstanceType<INDEX[Indexname]["key"]>, {}> }}
     */
    this.indexes = /** @type {any} */ ({})
  }

  /**
   * @param {InstanceType<KEY>|common.FirstKeyParam<KEY>} key
   * @return {Promise<InstanceType<VALUE>>}
   */
  async get (key) {
    const v = /** @type {Uint8Array | CryptoKey} */ (await idb.get(this.store, encodeKey(this.K, key)))
    if (v && v.constructor !== Uint8Array) { // @todo is there a better way to check for cryptokey?
      return /** @type {any} */ (new common.CryptoKeyValue(/** @type {any} */ (v)))
    }
    return v == null ? null : /** @type {any} */ (this.V.decode(decoding.createDecoder(v)))
  }

  /**
   * @param {InstanceType<KEY>|common.FirstKeyParam<KEY>} key
   */
  remove (key) {
    const encodedKey = encodeKey(this.K, key)
    /**
     * @type {Array<Promise<any>>}
     */
    const ps = []
    if (!object.isEmpty(this.indexes)) {
      ps.push(idb.get(this.store, encodedKey).then(v => {
        /* c8 ignore next */
        const value = v == null ? null : this.V.decode(decoding.createDecoder(/** @type {Uint8Array} */ (v)))
        return promise.all(object.map(this.indexes, (indexTable) => {
          const mappedKey = indexTable.indexDef.mapper(key, value)
          /* c8 ignore next */
          return mappedKey !== null ? indexTable.t.remove(mappedKey) : null
        }))
      }))
    }
    ps.push(idb.del(this.store, encodeKey(this.K, key)))
    return promise.all(ps).then(() => {})
  }

  /**
   * @param {common.RangeOption<KEY>} range
   */
  async removeRange (range) {
    const nrange = toNativeRange(this.K, range)
    if (nrange == null) {
      // clear everything
      return promise.all([idb.rtop(this.store.clear()), ...object.map(this.indexes, index =>
        idb.rtop(/** @type {Table<any, any, any>} */ (index.t).store.clear())
      )])
    }
    if (object.isEmpty(this.indexes)) {
      // delete using native range iterator
      return idb.del(this.store, nrange)
    }
    // delete all indexed k-v pairs manually
    // @todo this should block future requests (we can still retrieve indexed values after we
    // deleted the range)
    return idb.getAllKeysValues(this.store, nrange).then(entries =>
      promise.all(entries.map(({ v, k }) => {
        const key = this._dK(k)
        /* c8 ignore next */
        const value = v == null ? null : this.V.decode(decoding.createDecoder(/** @type {Uint8Array} */ (v)))
        return promise.all([idb.del(this.store, k), ...object.map(this.indexes, indexTable => {
          const mappedKey = indexTable.indexDef.mapper(key, value)
          return mappedKey === null ? null : indexTable.t.remove(mappedKey)
        })])
      })).then(() => undefined)
    )
  }

  /**
   * @param {common.RangeOption<KEY>} range
   * @param {function(common.ICursor<InstanceType<KEY>,InstanceType<VALUE>,undefined>):void|Promise<void>} f
   * @return {Promise<void>}
   */
  async iterate (range, f) {
    let cnt = 0
    let stopped = false
    const stop = () => {
      stopped = true
    }
    const lrange = toNativeRange(this.K, range)
    await idb.iterate(this.store, lrange, async (value, key) => {
      await f({
        stop,
        value: /** @type {InstanceType<VALUE>} */ (this.V.decode(decoding.createDecoder(value))),
        key: /** @type {InstanceType<KEY>} */ (this._dK(key)),
        fkey: undefined
      })
      const rangeLimit = getRangeLimit(range)
      /* c8 ignore next */
      if (stopped || (rangeLimit != null && ++cnt >= rangeLimit)) {
        return false
      }
    }, range.reverse ? 'prev' : 'next')
  }

  /**
   * @param {common.RangeOption<KEY>} range
   * @return {Promise<Array<{ key: InstanceType<KEY>, value: InstanceType<VALUE>, fkey: undefined }>>}
   */
  async getEntries (range = {}) {
    const entries = await idb.getAllKeysValues(this.store, toNativeRange(this.K, range) || undefined, getRangeLimit(range))
    return entries.map(entry => ({
      value: /** @type {InstanceType<VALUE>} */ (this.V.decode(decoding.createDecoder(entry.v))),
      key: /** @type {InstanceType<KEY>} */ (this._dK(entry.k)),
      fkey: undefined
    }))
  }

  /**
   * @param {common.RangeOption<KEY>} range
   * @return {Promise<Array<InstanceType<VALUE>>>}
   */
  async getValues (range = {}) {
    const values = await idb.getAll(this.store, toNativeRange(this.K, range) || undefined, getRangeLimit(range))
    return values.map(value =>
      /** @type {InstanceType<VALUE>} */ (this.V.decode(decoding.createDecoder(value)))
    )
  }

  /**
   * @param {common.RangeOption<KEY>} range
   * @return {Promise<Array<InstanceType<KEY>>>}
   */
  async getKeys (range = {}) {
    const keys = await idb.getAllKeys(this.store, toNativeRange(this.K, range) || undefined, getRangeLimit(range))
    return keys.map(key =>
      /** @type {InstanceType<KEY>} */ (this._dK(key))
    )
  }

  /**
   * @param {InstanceType<KEY>|common.FirstKeyParam<KEY>} key
   * @param {InstanceType<VALUE>|common.FirstKeyParam<VALUE>} value
   */
  set (key, value) {
    idb.put(this.store, /** @type {any} */ (encodeValue(this.V, value)), encodeKey(this.K, key))
    for (const indexname in this.indexes) {
      const indexTable = this.indexes[indexname]
      const mappedKey = indexTable.indexDef.mapper(key, value)
      mappedKey !== null && indexTable.t.set(mappedKey, key)
    }
  }

  /**
   * Only works with AutoKey
   * @todo make sure all puts are finished before running the next get or write request
   * This might already be handled everywhere but here.
   *
   * @param {InstanceType<VALUE>|common.FirstKeyParam<VALUE>} value
   * @return {Promise<InstanceType<KEY>>}
   */
  async add (value) {
    /**
     * @type {typeof common.AutoKey}
     */
    const K = /** @type {any} */ (this.K)
    if (K !== common.AutoKey) {
      /* c8 ignore next 2 */
      throw error.create('Expected key to be an AutoKey')
    }
    const key = await idb.put(this.store, /** @type {any} */ (encodeValue(this.V, value))).then(k => /** @type {any} */ (new K(k)))
    for (const indexname in this.indexes) {
      const indexTable = this.indexes[indexname]
      const mappedKey = indexTable.indexDef.mapper(key, value)
      mappedKey !== null && indexTable.t.set(mappedKey, key)
    }
    return key
  }
}

/**
 * @template {common.IDbDef} DEF
 * @implements common.ITransaction<DEF>
 */
class Transaction {
  /**
   * @param {DB<DEF>} db
   * @param {boolean} [readonly]
   */
  constructor (db, readonly = false) {
    this.db = db
    /**
     * @type {Array<string>}
     */
    const dbKeys = []
    object.forEach(db.def.tables || {}, (d, dname) => {
      dbKeys.push(`table#${dname}`)
      object.keys(d.indexes || {}).forEach(indexname => dbKeys.push(`table#${dname}#${indexname}`))
    })
    object.forEach(db.def.objects || {}, (_d, dname) => {
      dbKeys.push(`object#${dname}`)
    })
    const stores = idb.transact(db.db, dbKeys, readonly ? 'readonly' : 'readwrite')
    /**
     * @type {{ [Tablename in keyof DEF["tables"]]: common.ITable<NonNullable<DEF["tables"]>[Tablename]["key"],NonNullable<DEF["tables"]>[Tablename]["value"],common.Defined<NonNullable<DEF["tables"]>[Tablename]["indexes"]>,undefined> }}
     */
    this.tables = /** @type {any} */ ({})
    const tables = /** @type {any} */ (this.tables)
    const defTables = db.def.tables
    let storeIndex = 0
    for (const key in defTables) {
      const d = defTables[key]
      const table = new Table(stores[storeIndex], d.key, d.value)
      storeIndex += 1
      tables[key] = table
      for (const indexname in d.indexes) {
        const idxDef = d.indexes[indexname]
        const t = new Table(stores[storeIndex], idxDef.key, d.key)
        storeIndex += 1
        const idxTable = new common.IndexedTable(t, table, idxDef)
        table.indexes[indexname] = idxTable
      }
    }
    /**
     * @type {{ [Objectname in keyof DEF["objects"]]: common.IObject<NonNullable<DEF["objects"][Objectname]>> }}
     */
    this.objects = /** @type {any} */ ({})
    const objectStores = /** @type {any} */ (this.objects)
    const defObjects = db.def.objects
    for (const key in defObjects) {
      const d = defObjects[key]
      objectStores[key] = new ObjectStore(stores[storeIndex], d)
      storeIndex += 1
    }
  }
}

/**
 * @template {common.IDbDef} DEF
 * @implements common.ITransactionReadonly<DEF>
 * @extends Transaction<DEF>
 */
class TransactionReadonly extends Transaction {
  /**
   * @param {DB<DEF>} db
   */
  constructor (db) {
    super(db, true)
  }
}

/**
 * @template {common.IDbDef} DEF
 * @implements common.IDB<DEF>
 */
class DB {
  /**
   * @param {IDBDatabase} db
   * @param {DEF} def
   */
  constructor (db, def) {
    this.db = db
    this.def = def
    /**
     * @type {Transaction<DEF>?}
     */
    this._tr = null
    /**
     * @type {Promise<any>|null}
     */
    this._trP = null
    this._trWaiting = 0
  }

  /**
   * @todo Implement forceflush in idb https://developer.mozilla.org/en-US/docs/Web/API/IndexedDB_API/Using_IndexedDB?retiredLocale=de#adding_retrieving_and_removing_data
   * @template T
   * @param {function(common.ITransaction<DEF>): Promise<T>} f
   * @return {Promise<T>}
   */
  transact (f) {
    this._trWaiting++
    const exec = async () => {
      if (this._tr == null) {
        this._tr = new Transaction(this)
      }
      /**
       * @type {T}
       */
      let res
      try {
        const p = f(this._tr)
        if (p && p.catch) p.catch(() => { this._tr = null })
        res = await p
      } finally {
        this._trWaiting--
        if (this._trWaiting === 0) {
          this._tr = null
        }
      }
      return res
    }
    if (this._trP) {
      this._trP = this._trP.finally(exec)
    } else {
      this._trP = exec()
    }
    return this._trP
  }

  /**
   * @todo Implement forceflush in idb https://developer.mozilla.org/en-US/docs/Web/API/IndexedDB_API/Using_IndexedDB?retiredLocale=de#adding_retrieving_and_removing_data
   * @template T
   * @param {function(common.ITransactionReadonly<DEF>): Promise<T>} f
   * @return {Promise<T>}
   */
  transactReadonly (f) {
    /**
     * @type {common.ITransactionReadonly<DEF>}
     */
    const tr = new TransactionReadonly(this)
    return f(tr)
  }

  destroy () {
    this.db.close()
    return promise.resolve()
  }
}

/**
 * @template {common.IDbDef} DEF
 *
 * @param {string} name
 * @param {DEF} def
 * @return {Promise<common.IDB<DEF>>}
 */
export const openDB = (name, def) =>
  idb.openDB(name, db => {
    const stores = []
    const defTables = def.tables
    for (const key in defTables) {
      const d = defTables[key]
      const autoIncrement = d.key === /** @type {any} */ (common.AutoKey)
      stores.push([`table#${key}`, { autoIncrement }])
      for (const indexname in d.indexes) {
        const idxDef = d.indexes[indexname]
        const autoIncrement = idxDef.key === /** @type {any} */ (common.AutoKey)
        stores.push([`table#${key}#${indexname}`, { autoIncrement }])
      }
    }
    for (const key in def.objects) {
      stores.push([`object#${key}`])
    }
    idb.createStores(db, stores)
  }).then(db => new DB(db, def))

/**
 * @param {string} name
 */
export const deleteDB = (name) => idb.deleteDB(name)

/**
 * @template {common.IObjectDef<any>} ODef
 *
 * @implements common.IObject<ODef>
 */
export class ObjectStore {
  /**
   * @param {IDBObjectStore} store
   * @param {ODef} odef
   */
  constructor (store, odef) {
    this.store = store
    this.odef = odef
  }

  /**
   * @template {keyof ODef} Key
   * @param {Key} key
   * @return {Promise<InstanceType<ODef[Key]>|null>}
   */
  async get (key) {
    const v = /** @type {Uint8Array | CryptoKey} */ (await idb.get(this.store, /** @type {string} */ (key)))
    if (v && v.constructor !== Uint8Array) { // @todo is there a better way to check for cryptokey?
      return /** @type {any} */ (new common.CryptoKeyValue(/** @type {any} */ (v)))
    }
    return v == null ? null : /** @type {any} */ (this.odef[key].decode(decoding.createDecoder(v)))
  }

  /**
   * @template {keyof ODef} Key
   * @param {Key} key
   * @param {InstanceType<ODef[Key]>} value
   */
  set (key, value) {
    idb.put(this.store, /** @type {any} */ (encodeValue(this.odef[key], value)), /** @type {string} */ (key))
  }

  /**
   * @template {keyof ODef} Key
   * @param {Key} key
   */
  remove (key) {
    idb.del(this.store, /** @type {string} */ (key))
  }
}
