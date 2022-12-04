
import * as common from './common.js'
import * as idb from 'lib0/indexeddb'
import * as object from 'lib0/object'
import * as encoding from 'lib0/encoding'
import * as decoding from 'lib0/decoding'
import * as error from 'lib0/error'

export const name = 'isodb-indexeddb'

export * from './common.js'

/**
 * @param {common.IValue} value
 * @return {Uint8Array}
 */
const encodeValue = value => {
  const encoder = encoding.createEncoder()
  value.encode(encoder)
  return encoding.toUint8Array(encoder)
}

/**
 * @param {common.IKey} key
 * @return {Uint8Array|string|number}
 */
const encodeKey = key => {
  switch (key.constructor) {
    case common.AutoKey:
      return /** @type {common.AutoKey} */ (key).id
    case common.StringKey:
      return /** @type {common.StringKey} */ (key).id
  }
  const encoder = encoding.createEncoder()
  key.encode(encoder)
  return encoding.toUint8Array(encoder)
}

/**
 * @param {typeof common.IKey} keytype
 * @return {function(any):common.IKey | null}
 */
const getKeyDecoder = (keytype) => {
  switch (keytype) {
    case common.AutoKey:
      return id => id ? new common.AutoKey(id) : null
    case common.StringKey:
      return id => id ? new common.StringKey(id) : null
    default:
      return id => id ? keytype.decode(decoding.createDecoder(id)) : null
  }
}

/**
 * @param {common.IKey | null} start
 * @param {common.IKey | null} end
 */
const _createIdbKeyRangeBound = (start, end) => {
  if (start && end) {
    return idb.createIDBKeyRangeBound(encodeKey(start), encodeKey(end), false, true)
  }
  if (start) {
    return idb.createIDBKeyRangeLowerBound(encodeKey(start), false)
  }
  if (end) {
    return idb.createIDBKeyRangeUpperBound(encodeKey(end), true)
  }
  return null
}

/**
 * @template {common.IKey} KEY
 * @template {common.IValue} VALUE
 */
class Table {
  /**
   * @param {IDBObjectStore} store
   * @param {typeof common.IKey} K
   * @param {typeof common.IValue} V
   */
  constructor (store, K, V) {
    this.store = store
    this.K = K
    this.V = V
    // decode key
    this._dK = getKeyDecoder(K)
  }

  /**
   * @param {KEY} key
   * @return {Promise<VALUE>}
   */
  async get (key) {
    const v = /** @type {Uint8Array} */ (await idb.get(this.store, encodeKey(key)))
    return /** @type {any} */ (this.V.decode(decoding.createDecoder(v)))
  }

  /**
   * @param {KEY} key
   * @param {VALUE} value
   */
  set (key, value) {
    idb.put(this.store, encodeValue(value), encodeKey(key))
  }

  /**
   * Only works with AutoKey
   *
   * @param {VALUE} value
   * @return {Promise<KEY>}
   */
  async add (value) {
    if (this.K !== common.AutoKey) {
      throw error.create('Expected key to be an AutoKey')
    }
    return idb.put(this.store, encodeValue(value)).then(k => /** @type {any} */ (new this.K(k)))
  }

  /**
   * @param {common.RangeOption<KEY>} range
   * @param {function(common.ICursor<KEY,VALUE>):void} f
   * @return {Promise<void>}
   */
  async iterate (range, f) {
    let stopped = false
    const stop = () => {
      stopped = true
    }
    const lrange = _createIdbKeyRangeBound(range.start || null, range.end || null)
    await idb.iterate(this.store, lrange, (value, key) => {
      f({ stop, value: /** @type {VALUE} */ (this.V.decode(decoding.createDecoder(value))), key: /** @type {KEY} */ (this._dK(key)) })
      if (stopped) {
        return false
      }
    }, range.reverse ? 'prev' : 'next')
  }
}

/**
 * @template {{[key: string]: common.ITableDef}} DEF
 * @implements common.ITransaction<DEF>
 */
class Transaction {
  /**
   * @param {DB<DEF>} db
   */
  constructor (db) {
    this.db = db
    const dbKeys = object.keys(db.def)
    const stores = idb.transact(db.db, dbKeys, 'readwrite')
    /**
     * @type {{ [Tablename in keyof DEF]: common.ITable<InstanceType<DEF[Tablename]["key"]>, InstanceType<DEF[Tablename]["value"]>> }}
     */
    this.tables = /** @type {any} */ ({})
    const tables = /** @type {any} */ (this.tables)
    dbKeys.forEach((key, i) => {
      const d = db.def[key]
      tables[key] = new Table(stores[i], d.key, d.value)
    })
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

  destroy () {
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
    for (const key in def) {
      const autoIncrement = def[key].key === /** @type {any} */ (common.AutoKey)
      stores.push([key, { autoIncrement }])
    }
    idb.createStores(db, stores)
  }).then(db => new DB(db, def))

/**
 * @param {string} name
 */
export const deleteDB = (name) => idb.deleteDB(name)
