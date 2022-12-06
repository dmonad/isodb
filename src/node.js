import * as common from './common.js'
import * as encoding from 'lib0/encoding'
import * as decoding from 'lib0/decoding'
import * as error from 'lib0/error'
import * as math from 'lib0/math'
import * as object from 'lib0/object'
import lmdb from 'lmdb'
import fs from 'node:fs/promises'
import path from 'node:path'

export * from './common.js'

export const name = 'isodb-lmdb'

/**
 * @param {typeof common.IEncodable} keytype
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
 * @template {common.IEncodable} KEY
 * @param {common.RangeOption<KEY>} range
 */
const toNativeRange = range => {
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
  if (range.reverse) {
    lrange.reverse = range.reverse
  }
  if (range.limit != null) {
    lrange.limit = range.limit
  }
  return lrange
}

/**
 * @param {common.IEncodable} value
 */
const encodeValue = value => {
  const encoder = encoding.createEncoder()
  value.encode(encoder)
  return encoding.toUint8Array(encoder)
}

/**
 * @param {common.IEncodable} key
 * @param {boolean} increment
 * @return {Uint8Array|string|number}
 */
const encodeKey = (key, increment) => {
  switch (key.constructor) {
    case common.AutoKey:
      return /** @type {common.AutoKey} */ (key).v + (increment ? 1 : 0)
    case common.StringKey:
      return /** @type {common.StringKey} */ (key).v + (increment ? ' ' : '')
  }
  const encoder = encoding.createEncoder()
  key.encode(encoder)
  if (increment) {
    encoding.writeUint8(encoder, 0)
  }
  return encoding.toUint8Array(encoder)
}

/**
 * @param {typeof common.IEncodable} keytype
 * @return {function(any):common.IEncodable| null}
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
 * @template {common.IEncodable} KEY
 * @template {common.IEncodable} VALUE
 * @template {{[key: string]: common.ITableIndex<any, any, any>}} INDEX
 *
 * @implements common.ITable<KEY,VALUE,INDEX,undefined>
 */
class Table {
  /**
   * @param {lmdb.Database} t
   * @param {typeof common.IEncodable} keytype
   * @param {typeof common.IEncodable} valuetype
   */
  constructor (t, keytype, valuetype) {
    this.t = t
    this.K = keytype
    this.V = valuetype
    // decode key
    this._dK = getKeyDecoder(keytype)
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
    const buf = this.t.getBinaryFast(encodeKey(key, false))
    return buf ? /** @type {any} */ (this.V.decode(decoding.createDecoder(buf))) : undefined
  }

  /**
   * @todo rename entries
   * @param {common.RangeOption<KEY>} range
   * @return {Promise<Array<{ key: KEY, value: VALUE, fkey: undefined }>>}
   */
  getEntries (range) {
    return Promise.resolve(this.t.getRange(toNativeRange(range)).map(entry => ({
      key: /** @type {KEY} */ (this._dK(entry.key)),
      value: /** @type {VALUE} */ (this.V.decode(decoding.createDecoder(entry.value))),
      fkey: undefined
    })).asArray)
  }

  /**
   * @todo rename entries
   * @param {common.RangeOption<KEY>} range
   * @return {Promise<Array<KEY>>}
   */
  getKeys (range) {
    return Promise.resolve(this.t.getRange(toNativeRange(range)).map(entry =>
      /** @type {KEY} */ (this._dK(entry.key))
    ).asArray)
  }

  /**
   * @todo rename entries
   * @param {common.RangeOption<KEY>} range
   * @return {Promise<Array<VALUE>>}
   */
  getValues (range) {
    return Promise.resolve(this.t.getRange(toNativeRange(range)).map(entry =>
      /** @type {VALUE} */ (this.V.decode(decoding.createDecoder(entry.value)))
    ).asArray)
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
    for (const { key, value } of this.t.getRange(toNativeRange(range))) {
      await f({
        stop,
        key: /** @type {KEY} */ (this._dK(key)),
        value: /** @type {VALUE} */ (this.V.decode(decoding.createDecoder(value))),
        fkey: undefined
      })
      if (stopped || (range.limit != null && ++cnt >= range.limit)) {
        break
      }
    }
  }

  /**
   * @param {KEY} key
   * @param {VALUE} value
   */
  set (key, value) {
    this.t.put(encodeKey(key, false), encodeValue(value))
    for (const indexname in this.indexes) {
      const indexTable = this.indexes[indexname]
      indexTable.t.set(indexTable.indexDef.mapper(indexname, value), key)
    }
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
    /**
     * @type {KEY}
     */
    const key = /** @type {any} */ (new common.AutoKey(lastKey == null ? 1 : /** @type {number} */ (lastKey) + 1))
    this.t.put(key.v, encodeValue(value))
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
     * @type {{ [Tablename in keyof DEF]: Table<InstanceType<DEF[Tablename]["key"]>, InstanceType<DEF[Tablename]["value"]>, common.Defined<DEF[Tablename]["indexes"]>> }}
     */
    this.tables = /** @type {any} */ ({})
    for (const dbname in def) {
      const d = def[dbname]
      const conf = {
        name: dbname,
        encoding: /** @type {'binary'} */ ('binary'),
        keyEncoding: getLmdbKeyType(d.key)
      }
      const table = new Table(env.openDB(conf), d.key, d.value)
      this.tables[dbname] = /** @type {any} */ (table)
      for (const indexname in d.indexes) {
        const idxDef = d.indexes[indexname]
        const conf = {
          name: dbname + '#' + indexname,
          encoding: /** @type {'binary'} */ ('binary'),
          keyEncoding: getLmdbKeyType(idxDef.key)
        }
        const t = new Table(env.openDB(conf), idxDef.key, d.key)
        const idxTable = new common.IndexedTable(t, table, idxDef)
        table.indexes[indexname] = idxTable
      }
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

  /**
   * @template T
   * @param {function(common.ITransactionReadonly<DEF>): Promise<T>} f
   * @return {Promise<T>}
   */
  async transactReadonly (f) {
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
  const maxDbs = object.map(def, d => object.length(d.indexes || {}) + 1).reduce(math.add, 0)
  const env = lmdb.open({
    path: location,
    maxDbs,
    cache: true
    // compression: true // @todo add an option to enable compression when available
  })
  return new DB(env, def)
}

/**
 * @param {string} path
 * @return {Promise<void>}
 */
export const deleteDB = (path) => fs.rm(path, { recursive: true, force: true })
