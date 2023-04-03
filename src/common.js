import * as error from 'lib0/error'
import * as decoding from 'lib0/decoding'
import * as encoding from 'lib0/encoding'
import * as promise from 'lib0/promise'
import * as ecdsa from 'lib0/crypto/ecdsa'
import * as aes from 'lib0/crypto/aes-gcm'
import * as rsa from 'lib0/crypto/rsa-oaep'

/**
 * @template {Object | undefined} T
 * @typedef {T & {}} Defined
 */

/**
 * @typedef {string|number|bigint|boolean|_IAnyArray|Uint8Array|{[key: string]: IAny}|null|undefined} IAny
 */

/**
 * @interface
 * @typedef {IAny[]} _IAnyArray
 */
export class IEncodable {
  /* c8 ignore next 6 */
  /**
   * @param {encoding.Encoder} _encoder
   */
  encode (_encoder) {
    error.methodUnimplemented()
  }

  /* c8 ignore next 7 */
  /**
   * @param {decoding.Decoder} _decoder
   * @return {IEncodable}
   */
  static decode (_decoder) {
    error.methodUnimplemented()
  }
}

/**
 * @template {IAny} V
 * @implements IEncodable
 */
export class AnyValue {
  /**
   * @param {V} v
   */
  constructor (v) {
    this.v = v
  }

  /**
   * @param {encoding.Encoder} encoder
   */
  encode (encoder) {
    encoding.writeAny(encoder, this.v)
  }

  /**
   * @param {decoding.Decoder} decoder
   * @return {AnyValue<any>}
   */
  static decode (decoder) {
    return new this(decoding.readAny(decoder))
  }
}

/**
 * @implements IEncodable
 */
export class CryptoKeyValue {
  /**
   * @param {CryptoKey} key
   */
  constructor (key) {
    this.key = key
  }

  /* c8 ignore next 8 */
  /**
   * @param {encoding.Encoder} _encoder
   */
  encode (_encoder) {
    // CryptoKey encoding is handled by the specific database adapter.
    // This method should not be called.
    error.unexpectedCase()
  }

  /**
   * @param {decoding.Decoder} decoder
   * @return {Promise<CryptoKeyValue>}
   */
  static async decode (decoder) {
    const jwk = decoding.readAny(decoder)
    switch (jwk.kty) {
      case 'RSA':
        return new CryptoKeyValue(await rsa.importKey(jwk))
      case 'EC':
        return new CryptoKeyValue(await ecdsa.importKey(jwk))
      case 'oct':
        return new CryptoKeyValue(await aes.importKey(jwk))
    }
    /* c8 ignore next */
    error.unexpectedCase()
  }
}

/**
 * @implements IEncodable
 */
export class AutoKey {
  /**
   * @param {number} v
   */
  constructor (v) {
    this.v = v
  }

  /**
   * @param {encoding.Encoder} encoder
   */
  encode (encoder) {
    encoding.writeUint32BigEndian(encoder, this.v)
  }

  /**
   * @param {decoding.Decoder} decoder
   * @return {IEncodable}
   */
  static decode (decoder) {
    return new this(decoding.readUint32BigEndian(decoder))
  }
}

/**
 * @implements IEncodable
 */
export class Uint32Key {
  /**
   * @param {number} v
   */
  constructor (v) {
    this.v = v
  }

  /**
   * @param {encoding.Encoder} encoder
   */
  encode (encoder) {
    encoding.writeUint32BigEndian(encoder, this.v)
  }

  /**
   * @param {decoding.Decoder} decoder
   * @return {IEncodable}
   */
  static decode (decoder) {
    return new this(decoding.readUint32BigEndian(decoder))
  }
}

/**
 * @implements IEncodable
 */
export class StringKey {
  /**
   * @param {string} v
   */
  constructor (v) {
    this.v = v
  }

  /**
   * @param {encoding.Encoder} encoder
   */
  encode (encoder) {
    encoding.writeVarString(encoder, this.v)
  }

  /**
   * @param {decoding.Decoder} decoder
   * @return {IEncodable}
   */
  static decode (decoder) {
    return new this(decoding.readVarString(decoder))
  }
}

/**
 * @implements IEncodable
 */
export class StringValue {
  /**
   * @param {string} v
   */
  constructor (v) {
    this.v = v
  }

  /**
   * @param {encoding.Encoder} encoder
   */
  encode (encoder) {
    encoding.writeVarString(encoder, this.v)
  }

  /**
   * @param {decoding.Decoder} decoder
   * @return {IEncodable}
   */
  static decode (decoder) {
    return new this(decoding.readVarString(decoder))
  }
}

/**
 * @template {IEncodable} KEY
 * @template {IEncodable} VALUE
 * @template {typeof IEncodable} MKEY
 *
 * @typedef {Object} ITableIndex
 * @property {MKEY} ITableIndex.key
 * @property {function(KEY,VALUE):InstanceType<MKEY>} ITableIndex.mapper
 */

/**
 * @template {typeof IEncodable} KEY
 * @template {typeof IEncodable} VALUE
 *
 * @typedef {Object} ITableDef
 * @property {KEY} ITableDef.key
 * @property {VALUE} ITableDef.value
 * @property {{[key: string]: ITableIndex<InstanceType<KEY>,InstanceType<VALUE>,any>}} [ITableDef.indexes]
 */

/**
 * @template {typeof IEncodable} VAL
 *
 * @typedef {{ [key: string]: VAL }} IObjectDef
 */

/**
 * @typedef {Object} IDbDef
 * @property {{ [key: string]: ITableDef<any,any> }} [IDbDef.tables]
 * @property {{ [key: string]: IObjectDef<any> }} [IDbDef.objects]
 */

/**
 * @template {IEncodable} KEY
 *
 * @typedef {Object} RangeOption
 * @property {KEY} [RangeOption.start]
 * @property {boolean} [RangeOption.startExclusive]
 * @property {KEY} [RangeOption.end]
 * @property {boolean} [RangeOption.endExclusive]
 * @property {boolean} [RangeOption.reverse]
 * @property {number} [RangeOption.limit] Number of items to receive
 */

/**
 * @template {IEncodable} KEY
 * @template {IEncodable} VALUE
 * @template {IEncodable|undefined} FKEY
 *
 * @interface
 * @typedef {Object} ICursor
 * @property {KEY} RangeOption.key
 * @property {VALUE} RangeOption.value
 * @property {FKEY} RangeOption.fkey
 * @property {function():void} stop
 */

/* c8 ignore start */
/**
 * @template {IEncodable} KEY
 * @template {IEncodable} VALUE
 * @template {{[key: string]: ITableIndex<any, any, any>}} INDEX
 * @template {IEncodable | undefined} FKEY
 *
 * @interface
 */
export class ITableReadonly {
  constructor () {
    /**
     * @type {{ [Indexname in keyof INDEX]: ITableReadonly<InstanceType<INDEX[Indexname]["key"]>, VALUE, {}, KEY> }}
     */
    this.indexes = /** @type {any} */ ({})
  }

  /**
   * @param {KEY} _key
   * @return {Promise<VALUE|null>}
   */
  get (_key) {
    error.methodUnimplemented()
  }

  /**
   * @param {RangeOption<KEY>} [_range]
   * @return {Promise<Array<{ key: KEY, value: VALUE, fkey: FKEY }>>}
   */
  getEntries (_range) {
    error.methodUnimplemented()
  }

  /**
   * @param {RangeOption<KEY>} [_range]
   * @return {Promise<Array<VALUE>>}
   */
  getValues (_range) {
    error.methodUnimplemented()
  }

  /**
   * @param {RangeOption<KEY>} [_range]
   * @return {Promise<Array<KEY>>}
   */
  getKeys (_range) {
    error.methodUnimplemented()
  }

  /**
   * @param {RangeOption<KEY>} _range
   * @param {function(ICursor<KEY,VALUE,FKEY>):void|Promise<void>} _f
   * @return {Promise<void>}
   */
  iterate (_range, _f) {
    error.methodUnimplemented()
  }
}
/* c8 ignore stop */

/* c8 ignore start */
/**
 * @template {IEncodable} KEY
 * @template {IEncodable} VALUE
 * @template {{[key: string]: ITableIndex<KEY,VALUE,any>}} INDEX
 * @template {IEncodable|undefined} FKEY
 *
 * @interface
 * @extends ITableReadonly<KEY,VALUE,INDEX,FKEY>
 */
export class ITable extends ITableReadonly {
  /**
   * @param {KEY} _key
   * @param {VALUE} _value
   */
  set (_key, _value) {
    error.methodUnimplemented()
  }

  /**
   * Only works with AutoKey
   *
   * @param {VALUE} _value
   * @return {Promise<KEY>}
   */
  add (_value) {
    error.methodUnimplemented()
  }

  /**
   * @param {KEY} _key
   */
  remove (_key) {
    error.methodUnimplemented()
  }
}
/* c8 ignore stop */

/**
 * @todo move to utils. dont export via common
 * @todo rename MKEY to FKEY and change the order
 *
 * @template {IEncodable} KEY
 * @template {IEncodable} VALUE
 * @template {IEncodable} MKEY
 * @template {{[key: string]: ITableIndex<any, any, any>}} INDEX
 *
 * @implements ITableReadonly<MKEY,VALUE,INDEX,KEY>
 */
export class IndexedTable {
  /**
   * @param {ITable<MKEY,KEY,INDEX,undefined>} t
   * @param {ITable<KEY,VALUE,INDEX,undefined>} source
   * @param {ITableIndex<any,any,any>} def
   */
  constructor (t, source, def) {
    this.t = t
    this.source = source
    this.indexDef = def
    /**
     * @type {{ [Indexname in keyof INDEX]: ITableReadonly<InstanceType<INDEX[Indexname]["key"]>,VALUE,{},MKEY> }}
     */
    this.indexes = /** @type {any} */ ({})
  }

  /**
   * @param {MKEY} mkey
   * @return {Promise<VALUE|null>}
   */
  async get (mkey) {
    const key = await this.t.get(mkey)
    return key && this.source.get(key)
  }

  /**
   * @param {RangeOption<MKEY>} range
   * @return {Promise<Array<{ key: MKEY, value: VALUE, fkey: KEY }>>}
   */
  async getEntries (range) {
    const entries = await this.t.getEntries(range)
    const vals = await promise.all(entries.map(entry => /** @type {Promise<VALUE>} */ (this.source.get(entry.value))))
    return entries.map((entry, i) => ({ key: entry.key, value: vals[i], fkey: entry.value }))
  }

  /**
   * @param {RangeOption<MKEY>} range
   * @return {Promise<Array<VALUE>>}
   */
  async getValues (range) {
    const values = await this.t.getValues(range)
    return await promise.all(values.map(value => /** @type {Promise<VALUE>} */ (this.source.get(value))))
  }

  /**
   * @param {RangeOption<MKEY>} range
   * @return {Promise<Array<MKEY>>}
   */
  getKeys (range) {
    return this.t.getKeys(range)
  }

  /**
   * @param {RangeOption<MKEY>} range
   * @param {function(ICursor<MKEY,VALUE,KEY>):void} f
   * @return {Promise<void>}
   */
  iterate (range, f) {
    return this.t.iterate(range, async cursor => {
      const value = /** @type {VALUE} */ (await this.source.get(cursor.value))
      f({
        key: cursor.key,
        value,
        fkey: cursor.value,
        stop: cursor.stop
      })
    })
  }
}

/* c8 ignore start */
/**
 * @template {IObjectDef<any>} ODef
 *
 * @interface
 */
export class IObjectReadonly {
  /**
   * @template {keyof ODef} Key
   * @param {Key} _key
   * @return {Promise<InstanceType<ODef[Key]>|null>}
   */
  get (_key) {
    error.methodUnimplemented()
  }
}
/* c8 ignore stop */

/* c8 ignore start */
/**
 * @template {IObjectDef<any>} ODef
 *
 * @interface
 * @extends IObjectReadonly<ODef>
 */
export class IObject extends IObjectReadonly {
  /**
   * @template {keyof ODef} Key
   * @param {Key} _key
   * @param {InstanceType<ODef[Key]>} _value
   */
  set (_key, _value) {
    error.methodUnimplemented()
  }

  /**
   * @template {keyof ODef} Key
   * @param {Key} _key
   */
  remove (_key) {
    error.methodUnimplemented()
  }
}
/* c8 ignore stop */

/* c8 ignore start */
/**
 * @template {IDbDef} DEF
 *
 * @interface
 */
export class ITransaction {
  /**
   * @param {IDB<DEF>} _db
   */
  constructor (_db) {
    /**
     * @type {{ [Tablename in keyof DEF["tables"]]: ITable<InstanceType<NonNullable<DEF["tables"]>[Tablename]["key"]>,InstanceType<NonNullable<DEF["tables"]>[Tablename]["value"]>,Defined<NonNullable<DEF["tables"]>[Tablename]["indexes"]>,undefined> }}
     */
    this.tables = /** @type {any} */ ({})
    /**
     * @type {{ [Objectname in keyof DEF["objects"]]: IObject<NonNullable<DEF["objects"][Objectname]>> }}
     */
    this.objects = /** @type {any} */ ({})
  }
}
/* c8 ignore stop */

/* c8 ignore start */
/**
 * @template {IDbDef} DEF
 *
 * @interface
 */
export class ITransactionReadonly {
  /**
   * @param {IDB<DEF>} _db
   */
  constructor (_db) {
    /**
     * @type {{ [Tablename in keyof DEF["tables"]]:ITableReadonly<InstanceType<NonNullable<DEF["tables"]>[Tablename]["key"]>,InstanceType<NonNullable<DEF["tables"]>[Tablename]["value"]>,Defined<NonNullable<DEF["tables"]>[Tablename]["indexes"]>,undefined> }}
     */
    this.tables = /** @type {any} */ ({})
  }
}
/* c8 ignore stop */

/* c8 ignore start */
/**
 * @template {IDbDef} DEF
 *
.* @interface
 */
export class IDB {
  /**
   * @template T
   * @param {function(ITransaction<DEF>): Promise<T>|T} _f
   * @return {Promise<T>}
   */
  async transact (_f) {
    error.methodUnimplemented()
  }

  /**
   * @template T
   * @param {function(ITransactionReadonly<DEF>): Promise<T>|T} _f
   * @return {Promise<T>}
   */
  async transactReadonly (_f) {
    error.methodUnimplemented()
  }

  /**
   * @return {Promise<void>}
   */
  destroy () {
    error.methodUnimplemented()
  }
}
/* c8 ignore stop */

/**
 * Note that inheritance is not supported by intention.
 */
export const unexpectedContentTypeException = error.create('Value or key-type does not match schema.')
