import * as common from './common.js'
import * as encoding from 'lib0/encoding'
import * as decoding from 'lib0/decoding'
import * as error from 'lib0/error'
import lmdb from 'lmdb'
// @ts-ignore
import fs from 'node:fs/promises'
import path from 'node:path'
import { Buffer } from 'node:buffer'

export * from './common.js'

export const name = 'isodb-lmdb'

/**
 * @param {typeof common.IKey} keytype
 * @return {'binary'|'uint32'|'ordered-binary'}
 */
const getLmdbKeyType = keytype => {
  switch (/** @type {any} */ (keytype)) {
    case common.AutoKey:
      return 'uint32'
    case common.StringKey:
      return 'ordered-binary'
    default:
      return 'binary'
  }
}

/**
 * @param {encoding.Encoder} encoder
 */
const encoderToBuffer = (encoder) => {
  const arr = encoding.toUint8Array(encoder)
  return Buffer.from(arr.buffer, arr.byteOffset, arr.byteLength)
}

/**
 * @param {common.IValue} value
 * @return {Buffer}
 */
const encodeValue = value => {
  const encoder = encoding.createEncoder()
  value.encode(encoder)
  return encoderToBuffer(encoder)
}

/**
 * @param {common.IKey} key
 * @return {Buffer|string|number}
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
  return encoderToBuffer(encoder)
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
    const dbi = this.db.dbis[/** @type {string} */ (table)]
    const buf = dbi.getBinaryFast(encodeKey(key))
    return buf ? /** @type {any} */ (V.decode(decoding.createDecoder(buf))) : undefined
  }

  /**
   * @template {keyof DEF} TABLE
   *
   * @param {TABLE} table
   * @param {InstanceType<DEF[TABLE]["key"]>} key
   * @param {InstanceType<DEF[TABLE]["value"]>} value
   * @return {Promise<void>}
   */
  async set (table, key, value) {
    const dbi = this.db.dbis[/** @type {string} */ (table)]
    await dbi.put(encodeKey(key), encodeValue(value))
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
    const [lastKey] = dbi.getKeys({ reverse: true, limit: 1 }).asArray
    const key = lastKey == null ? 0 : /** @type {number} */ (lastKey) + 1
    await dbi.put(key, encodeValue(value))
    return /** @type {any} */ (new common.AutoKey(key))
  }
}

/**
 * @template {common.IDbDef} DEF
 */
export class IsoDB {
  /**
   * @param {lmdb.RootDatabase} env
*  * @param {DEF} def
   */
  constructor (env, def) {
    this.def = def
    this.env = env
    /**
     * @type {{[key: string]: lmdb.Database}}
     */
    this.dbis = {}
    for (const dbname in def) {
      const d = def[dbname]
      /**
       * @type {lmdb.DatabaseOptions & { name: string }}
       */
      const conf = {
        name: dbname,
        encoding: 'binary',
        keyEncoding: getLmdbKeyType(d.key)
      }
      this.dbis[dbname] = env.openDB(conf)
    }
  }

  /**
   * @todo make sure that transactions are executed one after another
   *
   * @param {function(Transaction<DEF>): Promise<void>} f
   */
  async transact (f) {
    return this.env.transaction(() => {
      /**
       * @type {Transaction<DEF>}
       */
      const tr = new Transaction(this)
      return f(tr)
    })
  }

  destroy () {
    for (const key in this.dbis) {
      this.dbis[key].close()
    }
    this.env.close()
  }
}

/**
 * @param {string} location
 * @param {common.IDbDef} def
 */
export const openDB = async (location, def) => {
  await fs.mkdir(path.dirname(location), { recursive: true })
  const env = lmdb.open({
    path: location,
    maxDbs: Object.keys(def).length
    // compression: true // @todo add an option to enable compression when available
  })
  return new IsoDB(env, def)
}

/**
 * @param {string} path
 * @return {Promise<void>}
 */
export const deleteDB = (path) => fs.rm(path, { recursive: true, force: true })
