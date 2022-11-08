
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
 * @template {{[key: string]: common.ITableDef}} DEF
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
     * @type {any}
     */
    this.strs = {}
    dbKeys.forEach((key, i) => { this.strs[key] = stores[i] })
  }

  /**
   * @template {keyof DEF} TABLE
   *
   * @param {TABLE} table
   * @param {InstanceType<DEF[TABLE]["key"]>} key
   * @return {Promise<InstanceType<DEF[TABLE]["value"]>>}
   */
  async get (table, key) {
    const V = this.db.def[table].value
    const st = this.strs[table]
    const v = /** @type {Uint8Array} */ (await idb.get(st, encodeKey(key)))
    return /** @type {any} */ (V.decode(decoding.createDecoder(v)))
  }

  /**
   * @template {keyof DEF} TABLE
   *
   * @param {TABLE} table
   * @param {InstanceType<DEF[TABLE]["key"]>} key
   * @param {InstanceType<DEF[TABLE]["value"]>} value
   * @return {Promise<void>|void}
   */
  set (table, key, value) {
    return idb.put(this.strs[table], encodeValue(value), encodeKey(key))
  }

  /**
   * Only works with AutoKey
   *
   * @template {keyof DEF} TABLE
   *
   * @param {TABLE} table
   * @param {InstanceType<DEF[TABLE]["value"]>} value
   * @return {Promise<InstanceType<DEF[TABLE]["key"]>>}
   */
  async add (table, value) {
    const KeyType = /** @type {any} */ (this.db.def[table].key)
    if (KeyType !== common.AutoKey) {
      throw error.create('Expected key to be an AutoKey')
    }
    return idb.put(this.strs[table], encodeValue(value)).then(k => new KeyType(k))
  }
}

/**
 * @template {common.IDbDef} DEF
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
   * @param {function(Transaction<DEF>): Promise<void>} f
   */
  transact (f) {
    /**
     * @type {Transaction<DEF>}
     */
    const tr = new Transaction(this)
    return f(tr)
  }
}

/**
 * @param {string} name
 * @param {common.IDbDef} def
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
