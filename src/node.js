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
 * @template {typeof common.IEncodable} KEY
 * @param {KEY} K
 * @param {common.RangeOption<KEY>} range
 */
const toNativeRange = (K, range) => {
  /**
   * @type {any}
   */
  const lrange = {}
  if (range.start) {
    lrange.start = encodeKey(K, range.start, range.startExclusive === true ? (range.reverse ? -1 : 1) : 0)
  }
  if (range.end) {
    lrange.end = encodeKey(K, range.end, range.endExclusive === true ? 0 : (range.reverse ? -1 : 1))
  }
  if (range.reverse) {
    lrange.reverse = range.reverse
  }
  if (range.limit != null && range.limit > 0) {
    lrange.limit = range.limit
  }
  return lrange
}

/**
 * @param {typeof common.IEncodable} V
 * @param {common.IEncodable} value
 */
const encodeValue = (V, value) => {
  if (value == null || /** @type {any} */ (value).constructor !== V) {
    value = new V(value)
  }
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
 * @param {typeof common.IEncodable} K
 * @param {common.IEncodable} key
 * @param {1|0|-1} increment
 * @return {Uint8Array|string|number}
 */
const encodeKey = (K, key, increment) => {
  if (key == null || /** @type {any} */ (key).constructor !== K) {
    key = new K(key)
  }
  switch (K) {
    case common.AutoKey:
      return /** @type {common.AutoKey} */ (key).v + increment
    case common.StringKey: {
      const k = /** @type {common.StringKey} */ (key).v + (increment === 1 ? ' ' : '')
      if (increment < 0 && k.length > 0) {
        return k.slice(0, k.length - 1) + String.fromCharCode(k.charCodeAt(k.length - 1) - 1)
      }
      return k
    }
  }
  const encoder = encoding.createEncoder()
  key.encode(encoder)
  if (increment > 0) {
    encoding.writeUint8(encoder, 0)
  }
  const buf = encoding.toUint8Array(encoder)
  if (increment < 0) {
    const lastPos = buf.byteLength - 1
    const lastByte = buf[lastPos]
    if (lastByte === 0) {
      return buf.slice(0, lastPos)
    }
    buf[lastPos]--
  }
  return buf
}

/**
 * @param {typeof common.IEncodable} keytype
 * @return {function(any):common.IEncodable| null}
 */
const getKeyDecoder = (keytype) => {
  switch (/** @type {any} */ (keytype)) {
    case common.AutoKey:
      /* c8 ignore next */
      return id => id == null ? null : new common.AutoKey(id)
    case common.StringKey:
      /* c8 ignore next */
      return id => id == null ? null : new common.StringKey(id)
    default:
      /* c8 ignore next */
      return id => id == null ? null : keytype.decode(decoding.createDecoder(id))
  }
}

/**
 * @template {typeof common.IEncodable} KEY
 * @template {typeof common.IEncodable} VALUE
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
   * @param {InstanceType<KEY>|common.FirstKeyParam<KEY>} key
   * @return {Promise<InstanceType<VALUE>|null>}
   */
  async get (key) {
    const buf = this.t.getBinary(encodeKey(this.K, key, 0)) // @todo experiment with getBinaryFast
    return buf == null ? null : /** @type {InstanceType<VALUE>} */ (this.V.decode(decoding.createDecoder(buf)))
  }

  /**
   * @todo rename entries
   * @param {common.RangeOption<KEY>} range
   * @return {Promise<Array<{ key: InstanceType<KEY>, value: InstanceType<VALUE>, fkey: undefined }>>}
   */
  getEntries (range = {}) {
    return promise.resolveWith(this.t.getRange(toNativeRange(this.K, range)).map(entry => ({
      key: /** @type {InstanceType<KEY>} */ (this._dK(entry.key)),
      value: /** @type {InstanceType<VALUE>} */ (this.V.decode(decoding.createDecoder(entry.value))),
      fkey: undefined
    })).asArray)
  }

  /**
   * @todo rename entries
   * @param {common.RangeOption<KEY>} range
   * @return {Promise<Array<InstanceType<KEY>>>}
   */
  getKeys (range = {}) {
    return promise.resolveWith(this.t.getRange(toNativeRange(this.K, range)).map(entry =>
      /** @type {InstanceType<KEY>} */ (this._dK(entry.key))
    ).asArray)
  }

  /**
   * @todo rename entries
   * @param {common.RangeOption<KEY>} range
   * @return {Promise<Array<InstanceType<VALUE>>>}
   */
  getValues (range = {}) {
    return promise.resolveWith(this.t.getRange(toNativeRange(this.K, range)).map(entry =>
      /** @type {InstanceType<VALUE>} */ (this.V.decode(decoding.createDecoder(entry.value)))
    ).asArray)
  }

  /**
   * @param {common.RangeOption<KEY>} range
   * @param {function(common.ICursor<InstanceType<KEY>,InstanceType<VALUE>,undefined>):void|Promise<void>} f
   * @return {Promise<void>}
   */
  async iterate (range, f) {
    let cnt = 0
    let stopped = false
    const stop = () => {
      stopped = true
    }
    for (const { key, value } of this.t.getRange(toNativeRange(this.K, range))) {
      await f({
        stop,
        key: /** @type {InstanceType<KEY>} */ (this._dK(key)),
        value: /** @type {InstanceType<VALUE>} */ (this.V.decode(decoding.createDecoder(value))),
        fkey: undefined
      })
      if (stopped || (range.limit != null && ++cnt >= range.limit)) {
        break
      }
    }
  }

  /**
   * @param {InstanceType<KEY>|common.FirstKeyParam<KEY>} key
   * @param {InstanceType<VALUE>|common.FirstKeyParam<VALUE>[0]} value
   */
  set (key, value) {
    this.t.put(encodeKey(this.K, key, 0), encodeValue(this.V, value))
    for (const indexname in this.indexes) {
      const indexTable = this.indexes[indexname]
      const mappedKey = indexTable.indexDef.mapper(key, value)
      mappedKey !== null && indexTable.t.set(mappedKey, key)
    }
  }

  /**
   * Only works with AutoKey
   *
   * @param {InstanceType<VALUE>|common.FirstKeyParam<VALUE>[0]} value
   * @return {Promise<InstanceType<KEY>>}
   */
  async add (value) {
    if (/** @type {any} */ (this.K) !== common.AutoKey) {
      throw error.create('Expected key to be an AutoKey')
    }
    const [lastKey] = this.t.getKeys({ reverse: true, limit: 1 }).asArray
    /**
     * @type {InstanceType<KEY> & common.AutoKey}
     */
    const key = /** @type {any} */ (new common.AutoKey(lastKey == null ? 1 : /** @type {number} */ (lastKey) + 1))
    this.t.put(key.v, encodeValue(this.V, value))
    for (const indexname in this.indexes) {
      const indexTable = this.indexes[indexname]
      const mappedKey = indexTable.indexDef.mapper(key, value)
      mappedKey !== null && indexTable.t.set(mappedKey, key)
    }
    return key
  }

  /**
   * @param {InstanceType<KEY>|common.FirstKeyParam<KEY>} key
   */
  remove (key) {
    const encodedKey = encodeKey(this.K, key, 0)
    /**
     * @type {Array<Promise<any>>}
     */
    const ps = []
    if (!object.isEmpty(this.indexes)) {
      const buf = this.t.getBinary(encodedKey) // @todo experiment with getBinaryFast (doesn't work because readVarUint8 doesn't copy)
      /* c8 ignore next */
      const value = buf ? /** @type {InstanceType<VALUE>} */ (this.V.decode(decoding.createDecoder(buf))) : null
      ps.push(promise.all(object.map(this.indexes, indexTable => {
        const mappedKey = indexTable.indexDef.mapper(key, value)
        /* c8 ignore next */
        return mappedKey === null ? null : indexTable.t.remove(mappedKey)
      })))
    }
    ps.push(this.t.remove(encodedKey))
    return promise.all(ps).then(() => {})
  }

  /**
   * @param {common.RangeOption<KEY>} range
   */
  async removeRange (range) {
    const nrange = toNativeRange(this.K, range)
    if (nrange.start == null && nrange.end == null) {
      // clear everything
      return promise.all([this.t.clearAsync(), ...object.map(this.indexes, indexTable =>
        /** @type {Table<any,any,any>} */ (indexTable.t).t.clearAsync()
      )]).then(() => {})
    }
    // delete all indexed k-v pairs manually
    return promise.all(this.t.getRange(nrange).map(({ key, value }) => {
      const kk = this._dK(key)
      /* c8 ignore next */
      const val = value == null ? null : this.V.decode(decoding.createDecoder(/** @type {Uint8Array} */ (value)))
      return promise.all([this.t.remove(key), ...object.map(this.indexes, indexTable => {
        const mappedKey = indexTable.indexDef.mapper(kk, val)
        return mappedKey === null ? null : indexTable.t.remove(mappedKey)
      })])
    })).then(() => {})
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
    this.t.put(key, encodeValue(this.odef[key], value))
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
     * @type {Transaction<DEF>?}
     */
    this._tr = null
    /**
     * @type {{ [Tablename in keyof DEF["tables"]]: Table<NonNullable<DEF["tables"]>[Tablename]["key"], NonNullable<DEF["tables"]>[Tablename]["value"], common.Defined<NonNullable<DEF["tables"]>[Tablename]["indexes"]>> }}
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
    if (this._tr) return f(this._tr)
    return this.env.transaction(async () => {
      this._tr = new Transaction(this)
      let res
      try {
        res = await f(this._tr)
      } finally {
        this._tr = null
      }
      return res
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
