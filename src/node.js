import * as common from './common.js'
import * as encoding from 'lib0/encoding'
import * as decoding from 'lib0/decoding'
import * as error from 'lib0/error'
import lmdb from 'node-lmdb'
// @ts-ignore
import fs from 'node:fs/promises'

export * from './common.js'

export const name = 'isodb-lmdb'

/**
 * @param {typeof common.IKey} keytype
 * @return {any}
 */
const getLmdbKeyType = keytype => {
  switch (/** @type {any} */ (keytype)) {
    case common.AutoKey:
      return { keyIsUint32: true }
    case common.StringKey:
      return { keyIsString: true }
  }
  return { keyIsBuffer: true }
}

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
    this.tr = db.env.beginTxn()
  }

  _done () {
    this.tr.commit()
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
    const buf = this.tr.getBinaryUnsafe(this.db.dbis[/** @type {string} */ (table)], encodeKey(key))
    const res = /** @type {any} */ (V.decode(decoding.createDecoder(buf)))
    this.db.env.detachBuffer(buf)
    return res
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
    this.tr.putBinary(this.db.dbis[/** @type {string} */ (table)], encodeValue(value), encodeKey(key))
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
    const dbi = this.db.dbis[/** @type {string} */ (table)]
    /**
     * @type {lmdb.Cursor<number>}
     */
    const cursor = new lmdb.Cursor(this.tr, dbi, getLmdbKeyType(KeyType))
    const lastKey = cursor.goToLast()
    const key = lastKey === null ? 0 : lastKey + 1
    this.tr.putBinary(this.db.dbis[/** @type {string} */ (table)], encodeValue(value), key)
    return /** @type {any} */ (new common.AutoKey(key))
  }
}

/**
 * @template {common.IDbDef} DEF
 */
export class IsoDB {
  /**
   * @param {lmdb.Env} env
*  * @param {DEF} def
   */
  constructor (env, def) {
    this.def = def
    this.env = env
    /**
     * @type {{[key: string]: lmdb.Dbi}}
     */
    this.dbis = {}
    for (const dbname in def) {
      this.dbis[dbname] = env.openDbi({
        name: dbname,
        create: true
      })
    }
  }

  /**
   * @param {function(Transaction<DEF>): Promise<void>} f
   */
  transact (f) {
    /**
     * @type {Transaction<DEF>}
     */
    const tr = new Transaction(this)
    const res = f(tr)
    tr._done()
    return res
  }

  destroy () {
    for (const key in this.dbis) {
      this.dbis[key].close()
    }
    this.env.close()
  }
}

/**
 * @param {string} path
 * @param {common.IDbDef} def
 */
export const openDB = async (path, def) => {
  await fs.mkdir(path, { recursive: true })
  const env = new lmdb.Env()
  env.open({
    path,
    mapSize: 2 * 1024 * 1024 * 1024, // maximum database size
    maxDbs: Object.keys(def).length
  })
  return new IsoDB(env, def)
}

/**
 * @param {string} path
 * @return {Promise<void>}
 */
export const deleteDB = (path) => fs.rm(path, { recursive: true, force: true })
