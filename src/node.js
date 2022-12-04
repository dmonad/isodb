import * as common from './common.js'
import * as encoding from 'lib0/encoding'
import * as decoding from 'lib0/decoding'
import * as promise from 'lib0/promise'
import * as error from 'lib0/error'
import lmdb from 'lmdb'
import fs from 'node:fs/promises'
import path from 'node:path'

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
 * @param {common.IValue} value
 */
const encodeValue = value => {
  const encoder = encoding.createEncoder()
  value.encode(encoder)
  return encoding.toUint8Array(encoder)
}

/**
 * @param {common.IKey} key
 * @param {boolean} increment
 * @return {Uint8Array|string|number}
 */
const encodeKey = (key, increment) => {
  switch (key.constructor) {
    case common.AutoKey:
      return /** @type {common.AutoKey} */ (key).id + (increment ? 1 : 0)
    case common.StringKey:
      return /** @type {common.StringKey} */ (key).id + (increment ? ' ' : '')
  }
  const encoder = encoding.createEncoder()
  key.encode(encoder)
  if (increment) {
    encoding.writeUint8(encoder, 0)
  }
  return encoding.toUint8Array(encoder)
}

/**
 * @param {typeof common.IKey} keytype
 * @return {function(any):common.IKey | null}
 */
const getKeyDecoder = (keytype) => {
  switch (keytype) {
    case common.AutoKey:
      return id => id == null ? null : new common.AutoKey(id)
    case common.StringKey:
      return id => id == null ? null : new common.StringKey(id)
    default:
      return id => id == null ? null : keytype.decode(decoding.createDecoder(id))
  }
}

/**
 * @template {common.IKey} KEY
 * @template {common.IValue} VALUE
 * @implements common.ITable<KEY, VALUE>
 */
class Table {
  /**
   * @param {lmdb.Database} t
   * @param {typeof common.IKey} keytype
   * @param {typeof common.IValue} valuetype
   */
  constructor (t, keytype, valuetype) {
    this.t = t
    this.K = keytype
    this.V = valuetype
    // decode key
    this._dK = getKeyDecoder(keytype)
  }

  /**
   * @param {KEY} key
   * @return {Promise<VALUE>}
   */
  async get (key) {
    const buf = this.t.getBinaryFast(encodeKey(key, false))
    return buf ? /** @type {any} */ (this.V.decode(decoding.createDecoder(buf))) : undefined
  }

  /**
   * @param {KEY} key
   * @param {VALUE} value
   */
  set (key, value) {
    this.t.put(encodeKey(key, false), encodeValue(value))
  }

  /**
   * Only works with AutoKey
   *
   * @param {VALUE} value
   * @return {Promise<KEY>}
   */
  async add (value) {
    if (/** @type {any} */ (this.K) !== common.AutoKey) {
      throw error.create('Expected key to be an AutoKey')
    }
    const [lastKey] = this.t.getKeys({ reverse: true, limit: 1 }).asArray
    const key = lastKey == null ? 1 : /** @type {number} */ (lastKey) + 1
    await this.t.put(key, encodeValue(value))
    return /** @type {any} */ (new common.AutoKey(key))
  }

  /**
   * @param {common.RangeOption<KEY>} range
   * @param {function(common.ICursor<KEY,VALUE>):void} f
   * @return {Promise<void>}
   */
  iterate (range, f) {
    let stopped = false
    const stop = () => {
      stopped = true
    }
    /**
     * @type {any}
     */
    const lrange = {}
    if (range.start) {
      lrange.start = encodeKey(range.start, range.startExclusive === true)
    }
    if (range.end) {
      lrange.end = encodeKey(range.end, range.endExclusive !== true)
    }
    if (lrange.reverse) {
      lrange.reverse = range.reverse
    }
    for (const { key, value } of this.t.getRange(lrange)) {
      f({ stop, key: /** @type {KEY} */ (this._dK(key)), value: /** @type {VALUE} */ (this.V.decode(decoding.createDecoder(value))) })
      if (stopped) {
        break
      }
    }
    return promise.resolve()
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
    this.tables = db.tables
  }
}

/**
 * @template {common.IDbDef} DEF
 * @implements common.IDB<DEF>
 */
class DB {
  /**
   * @param {lmdb.RootDatabase} env
*  * @param {DEF} def
   */
  constructor (env, def) {
    this.def = def
    this.env = env
    /**
     * @type {{ [Tablename in keyof DEF]: Table<InstanceType<DEF[Tablename]["key"]>, InstanceType<DEF[Tablename]["value"]>> }}
     */
    this.tables = /** @type {any} */ ({})
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
      this.tables[dbname] = new Table(env.openDB(conf), /** @type {typeof common.IKey} */ (d.key), /** @type {typeof common.IValue} */ (d.value))
    }
  }

  /**
   * @template T
   * @param {function(common.ITransaction<DEF>): Promise<T>} f
   * @return {Promise<T>}
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
    this.env.close()
  }
}

/**
 * @template {common.IDbDef} DEF
 *
 * @param {string} location
 * @param {DEF} def
 * @return {Promise<common.IDB<DEF>>}
 */
export const openDB = async (location, def) => {
  await fs.mkdir(path.dirname(location), { recursive: true })
  const env = lmdb.open({
    path: location,
    maxDbs: Object.keys(def).length
    // compression: true // @todo add an option to enable compression when available
  })
  return new DB(env, def)
}

/**
 * @param {string} path
 * @return {Promise<void>}
 */
export const deleteDB = (path) => fs.rm(path, { recursive: true, force: true })
