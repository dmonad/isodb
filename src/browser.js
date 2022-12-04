
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
 * @template {common.IKey} KEY
 * @template {common.IValue} VALUE
 */
export class IsoTable {
  /**
   * @param {IDBObjectStore} store
   * @param {typeof common.IKey} K
   * @param {typeof common.IValue} V
   */
  constructor (store, K, V) {
    this.store = store
    this.K = K
    this.V = V
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
   * @return {Promise<void>}
   */
  set (key, value) {
    return idb.put(this.store, encodeValue(value), encodeKey(key))
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
}

/**
 * @template {{[key: string]: common.ITableDef}} DEF
 * @implements common.ITransaction<DEF>
 */
export class Transaction {
  /**
   * @param {IsoDB<DEF>} db
   */
  constructor (db) {
    this.db = db
    const dbKeys = object.keys(db.def)
    const stores = idb.transact(db.db, dbKeys, 'readwrite')
    /**
     * @type {{ [Tablename in keyof DEF]: common.IIsoTable<InstanceType<DEF[Tablename]["key"]>, InstanceType<DEF[Tablename]["value"]>> }}
     */
    this.tables = /** @type {any} */ ({})
    const tables = /** @type {any} */ (this.tables)
    dbKeys.forEach((key, i) => {
      const d = db.def[key]
      tables[key] = new IsoTable(stores[i], d.key, d.value)
    })
  }
}

/**
 * @template {common.IDbDef} DEF
 * @implements common.IIsoDB<DEF>
 */
export class IsoDB {
  /**
   * @param {IDBDatabase} db
*  * @param {DEF} def
   */
  constructor (db, def) {
    this.db = db
    this.def = def
  }

  /**
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
 * @return {Promise<common.IIsoDB<DEF>>}
 */
export const openDB = (name, def) =>
  idb.openDB(name, db => {
    const stores = []
    for (const key in def) {
      const autoIncrement = def[key].key === /** @type {any} */ (common.AutoKey)
      stores.push([key, { autoIncrement }])
    }
    idb.createStores(db, stores)
  }).then(db => new IsoDB(db, def))

/**
 * @param {string} name
 */
export const deleteDB = (name) => idb.deleteDB(name)
