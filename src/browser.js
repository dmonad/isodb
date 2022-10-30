
import * as interfaces from './interfaces.js'
import * as idb from 'lib0/indexeddb'
import * as object from 'lib0/object'
import * as decoding from 'lib0/decoding'
import * as error from 'lib0/error'

export * from './interfaces.js'

export class Keyy {
  get () {}
}

export class SuperKey extends Keyy {
  dtrn () {}
}

/**
 * @template {{[key: string]: interfaces.ITableDef}} DEF
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
    const v = /** @type {Uint8Array} */ (await idb.get(st, key.toBuf()))
    return /** @type {any} */ (V.fromBuf(decoding.createDecoder(v)))
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
    // @ts-ignore
    return idb.put(this.strs[table], value.toBuf(), key.toBuf())
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
  add (table, value) {
    const KeyType = /** @type {any} */ (this.db.def[table].key)
    if (KeyType !== interfaces.AutoKey) {
      throw error.create('Expected key to be an AutoKey')
    }
    return idb.put(this.strs[table], value.toBuf()).then(k => new KeyType(k))
  }
}

/**
 * @template {interfaces.IDbDef} DEF
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
 * @param {interfaces.IDbDef} def
 */
export const openDB = (name, def) =>
  idb.openDB(name, db => {
    const stores = []
    for (const key in def) {
      // @ts-ignore
      const autoIncrement = def[key].key === interfaces.AutoKey
      stores.push([key, { autoIncrement }])
    }
    idb.createStores(db, stores)
  }).then(db => new IsoDB(db, def))

/**
 * @param {string} name
 */
export const deleteDB = (name) => idb.deleteDB(name)
