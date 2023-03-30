import * as common from './common.js'
import * as idb from 'lib0/indexeddb'
import * as object from 'lib0/object'
import * as encoding from 'lib0/encoding'
import * as decoding from 'lib0/decoding'
import * as error from 'lib0/error'
import * as promise from 'lib0/promise'
import * as buffer from 'lib0/buffer'

export const name = 'isodb-indexeddb'

export * from './common.js'

/**
 * @param {common.IEncodable} value
 * @return {Uint8Array | CryptoKey}
 */
const encodeValue = value => {
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
 * @param {common.IEncodable} key
 * @return {Uint8Array|string|number}
 */
const encodeKey = key => {
  switch (key.constructor) {
    case common.AutoKey:
      return /** @type {common.AutoKey} */ (key).v
    case common.StringKey:
      return /** @type {common.StringKey} */ (key).v
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
      return id => id ? new common.AutoKey(id) : null
    case common.StringKey:
      return id => id ? new common.StringKey(id) : null
    default:
      return id => id ? keytype.decode(decoding.createDecoder(buffer.createUint8ArrayFromArrayBuffer(id))) : null
  }
}

/**
 * @template {common.IEncodable} KEY
 * @param {common.RangeOption<KEY>} range
 */
const toNativeRange = (range) => {
  const startExclusive = range.startExclusive === true
  const endExclusive = range.endExclusive === true
  if (range.start && range.end) {
    return idb.createIDBKeyRangeBound(encodeKey(range.start), encodeKey(range.end), startExclusive, endExclusive)
  }
  if (range.start) {
    return idb.createIDBKeyRangeLowerBound(encodeKey(range.start), startExclusive)
  }
  if (range.end) {
    return idb.createIDBKeyRangeUpperBound(encodeKey(range.end), endExclusive)
  }
  return null
}

/**
 * @template {common.IEncodable} KEY
 * @template {common.IEncodable} VALUE
 * @template {{[key: string]: common.ITableIndex<any, any, any>}} INDEX
 *
 * @implements {common.ITable<KEY,VALUE,INDEX,undefined>}
 */
class Table {
  /**
   * @param {IDBObjectStore} store
   * @param {typeof common.IEncodable} K
   * @param {typeof common.IEncodable} V
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
   * @param {KEY} key
   * @return {Promise<VALUE>}
   */
  async get (key) {
    const v = /** @type {Uint8Array | CryptoKey} */ (await idb.get(this.store, encodeKey(key)))
    if (v && v.constructor !== Uint8Array) { // @todo is there a better way to check for cryptokey?
      return /** @type {any} */ (new common.CryptoKeyValue(/** @type {any} */ (v)))
    }
    return v == null ? null : /** @type {any} */ (this.V.decode(decoding.createDecoder(v)))
  }

  /**
   * @param {KEY} key
   */
  remove (key) {
    const encodedKey = encodeKey(key)
    if (!object.isEmpty(this.indexes)) {
      idb.get(this.store, encodedKey).then(v => {
        const value = v == null ? null : this.V.decode(decoding.createDecoder(/** @type {Uint8Array} */ (v)))
        for (const indexname in this.indexes) {
          const indexTable = this.indexes[indexname]
          indexTable.t.remove(indexTable.indexDef.mapper(key, value))
        }
      })
    }
    idb.del(this.store, encodeKey(key))
  }

  /**
   * @param {common.RangeOption<KEY>} range
   * @param {function(common.ICursor<KEY,VALUE,undefined>):void|Promise<void>} f
   * @return {Promise<void>}
   */
  async iterate (range, f) {
    let cnt = 0
    let stopped = false
    const stop = () => {
      stopped = true
    }
    const lrange = toNativeRange(range)
    await idb.iterate(this.store, lrange, async (value, key) => {
      await f({
        stop,
        value: /** @type {VALUE} */ (this.V.decode(decoding.createDecoder(value))),
        key: /** @type {KEY} */ (this._dK(key)),
        fkey: undefined
      })
      if (stopped || (range.limit != null && ++cnt >= range.limit)) {
        return false
      }
    }, range.reverse ? 'prev' : 'next')
  }

  /**
   * @param {common.RangeOption<KEY>} range
   * @return {Promise<Array<{ key: KEY, value: VALUE, fkey: undefined }>>}
   */
  async getEntries (range = {}) {
    const entries = await idb.getAllKeysValues(this.store, toNativeRange(range) || undefined, range.limit)
    return entries.map(entry => ({
      value: /** @type {VALUE} */ (this.V.decode(decoding.createDecoder(entry.v))),
      key: /** @type {KEY} */ (this._dK(entry.k)),
      fkey: undefined
    }))
  }

  /**
   * @param {common.RangeOption<KEY>} range
   * @return {Promise<Array<VALUE>>}
   */
  async getValues (range = {}) {
    const values = await idb.getAll(this.store, toNativeRange(range) || undefined, range.limit)
    return values.map(value =>
      /** @type {VALUE} */ (this.V.decode(decoding.createDecoder(value)))
    )
  }

  /**
   * @param {common.RangeOption<KEY>} range
   * @return {Promise<Array<KEY>>}
   */
  async getKeys (range = {}) {
    const keys = await idb.getAllKeys(this.store, toNativeRange(range) || undefined, range.limit)
    return keys.map(key =>
      /** @type {KEY} */ (this._dK(key))
    )
  }

  /**
   * @param {KEY} key
   * @param {VALUE} value
   */
  set (key, value) {
    if (value.constructor !== this.V || key.constructor !== this.K) {
      throw common.unexpectedContentTypeException
    }
    idb.put(this.store, /** @type {any} */ (encodeValue(value)), encodeKey(key))
    for (const indexname in this.indexes) {
      const indexTable = this.indexes[indexname]
      indexTable.t.set(indexTable.indexDef.mapper(key, value), key)
    }
  }

  /**
   * Only works with AutoKey
   * @todo make sure all puts are finished before running the next get or write request
   * This might already be handled everywhere but here.
   *
   * @param {VALUE} value
   * @return {Promise<KEY>}
   */
  async add (value) {
    /**
     * @type {typeof common.AutoKey}
     */
    const K = /** @type {any} */ (this.K)
    if (K !== common.AutoKey) {
      throw error.create('Expected key to be an AutoKey')
    }
    if (value.constructor !== this.V) {
      throw common.unexpectedContentTypeException
    }
    const key = await idb.put(this.store, /** @type {any} */ (encodeValue(value))).then(k => /** @type {any} */ (new K(k)))
    for (const indexname in this.indexes) {
      const indexTable = this.indexes[indexname]
      indexTable.t.set(indexTable.indexDef.mapper(key, value), key)
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
     * @type {{ [Tablename in keyof DEF["tables"]]: common.ITable<InstanceType<NonNullable<DEF["tables"]>[Tablename]["key"]>,InstanceType<NonNullable<DEF["tables"]>[Tablename]["value"]>,common.Defined<NonNullable<DEF["tables"]>[Tablename]["indexes"]>,undefined> }}
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
  }

  /**
   * @todo Implement forceflush in idb https://developer.mozilla.org/en-US/docs/Web/API/IndexedDB_API/Using_IndexedDB?retiredLocale=de#adding_retrieving_and_removing_data
   * @template T
   * @param {function(common.ITransaction<DEF>): Promise<T>} f
   * @return {Promise<T>}
   */
  transact (f) {
    /**
     * @type {common.ITransaction<DEF>}
     */
    const tr = new Transaction(this)
    return f(tr)
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
    if (value.constructor !== this.odef[key]) {
      throw common.unexpectedContentTypeException
    }
    idb.put(this.store, /** @type {any} */ (encodeValue(value)), /** @type {string} */ (key))
  }

  /**
   * @template {keyof ODef} Key
   * @param {Key} key
   */
  remove (key) {
    idb.del(this.store, /** @type {string} */ (key))
  }
}
