import * as common from './common.js'
import * as encoding from 'lib0/encoding'
import * as decoding from 'lib0/decoding'
import * as promise from 'lib0/promise'
import * as error from 'lib0/error'
import * as math from 'lib0/math'
import * as object from 'lib0/object'
import { KeyObject } from 'node:crypto'
import * as lmdb from 'lmdb'
import * as fs from 'node:fs/promises'
import * as path from 'node:path'

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
  switch (value.constructor) {
    case common.CryptoKeyValue: {
      const key = /** @type {common.CryptoKeyValue} */ (value).key
      const jwk = KeyObject.from(key).export({
        format: 'jwk'
      })
      jwk.key_ops = key.usages
      encoding.writeAny(encoder, jwk)
      break
    }
    default:
      value.encode(encoder)
  }
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
  switch (/** @type {any} */ (keytype)) {
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
   * @return {Promise<VALUE|null>}
   */
  async get (key) {
    const buf = this.t.getBinary(encodeKey(key, false)) // @todo experiment with getBinaryFast
    return buf == null ? null : /** @type {VALUE} */ (this.V.decode(decoding.createDecoder(buf)))
  }

  /**
   * @todo rename entries
   * @param {common.RangeOption<KEY>} range
   * @return {Promise<Array<{ key: KEY, value: VALUE, fkey: undefined }>>}
   */
  getEntries (range = {}) {
    return promise.resolveWith(this.t.getRange(toNativeRange(range)).map(entry => ({
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
  getKeys (range = {}) {
    return promise.resolveWith(this.t.getRange(toNativeRange(range)).map(entry =>
      /** @type {KEY} */ (this._dK(entry.key))
    ).asArray)
  }

  /**
   * @todo rename entries
   * @param {common.RangeOption<KEY>} range
   * @return {Promise<Array<VALUE>>}
   */
  getValues (range = {}) {
    return promise.resolveWith(this.t.getRange(toNativeRange(range)).map(entry =>
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
    if (value.constructor !== this.V || key.constructor !== this.K) {
      throw common.unexpectedContentTypeException
    }
    this.t.put(encodeKey(key, false), encodeValue(value))
    for (const indexname in this.indexes) {
      const indexTable = this.indexes[indexname]
      indexTable.t.set(indexTable.indexDef.mapper(key, value), key)
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
    if (value.constructor !== this.V) {
      throw common.unexpectedContentTypeException
    }
    const [lastKey] = this.t.getKeys({ reverse: true, limit: 1 }).asArray
    /**
     * @type {KEY & common.AutoKey}
     */
    const key = /** @type {any} */ (new common.AutoKey(lastKey == null ? 1 : /** @type {number} */ (lastKey) + 1))
    this.t.put(key.v, encodeValue(value))
    for (const indexname in this.indexes) {
      const indexTable = this.indexes[indexname]
      indexTable.t.set(indexTable.indexDef.mapper(key, value), key)
    }
    return key
  }

  /**
   * @param {KEY} key
   */
  remove (key) {
    const encodedKey = encodeKey(key, false)
    if (!object.isEmpty(this.indexes)) {
      const buf = this.t.getBinary(encodedKey) // @todo experiment with getBinaryFast (doesn't work because readVarUint8 doesn't copy)
      const value = buf ? /** @type {VALUE} */ (this.V.decode(decoding.createDecoder(buf))) : null
      for (const indexname in this.indexes) {
        const indexTable = this.indexes[indexname]
        indexTable.t.remove(indexTable.indexDef.mapper(key, value))
      }
    }
    this.t.remove(encodedKey)
  }
}

/**
 * @template {common.IObjectDef<any>} ODef
 *
 * @implements common.IObject<ODef>
 */
export class ObjectStore {
  /**
   * @param {lmdb.Database} t
   * @param {ODef} odef
   */
  constructor (t, odef) {
    this.t = t
    this.odef = odef
  }

  /**
   * @template {keyof ODef} Key
   * @param {Key} key
   * @return {Promise<InstanceType<ODef[Key]>|null>}
   */
  async get (key) {
    const buf = this.t.getBinary(key)
    return buf == null ? null : /** @type {ODef[Key]} */ (this.odef[key].decode(decoding.createDecoder(buf)))
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
    this.t.put(key, encodeValue(value))
  }

  /**
   * @template {keyof ODef} Key
   * @param {Key} key
   */
  remove (key) {
    this.t.remove(key)
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
    this.objects = db.objects
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
     * @type {{ [Tablename in keyof DEF["tables"]]: Table<InstanceType<NonNullable<DEF["tables"]>[Tablename]["key"]>, InstanceType<NonNullable<DEF["tables"]>[Tablename]["value"]>, common.Defined<NonNullable<DEF["tables"]>[Tablename]["indexes"]>> }}
     */
    this.tables = /** @type {any} */ ({})
    for (const dbname in def.tables) {
      const d = def.tables[dbname]
      const conf = {
        name: dbname,
        encoding: /** @type {'binary'} */ ('binary'),
        keyEncoding: getLmdbKeyType(d.key)
      }
      const table = new Table(env.openDB(conf), d.key, d.value)
      ;/** @type {any} */ (this.tables)[dbname] = /** @type {any} */ (table)
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
    /**
     * @type {{ [Objectname in keyof DEF["objects"]]: common.IObject<NonNullable<DEF["objects"][Objectname]>> }}
     */
    this.objects = /** @type {any} */ ({})
    for (const dbname in def.objects) {
      const d = def.objects[dbname]
      const conf = {
        name: dbname,
        encoding: /** @type {'binary'} */ ('binary'),
        keyEncoding: /** @type {'ordered-binary'} */ ('ordered-binary')
      }
      const store = new ObjectStore(env.openDB(conf), d)
      ;/** @type {any} */ (this.objects)[dbname] = store
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
    return this.env.close()
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
  const maxDbs = object.map(def.tables || {}, d => object.length(d.indexes || {}) + 1).reduce(math.add, 0) + object.length(def.objects || {})
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
