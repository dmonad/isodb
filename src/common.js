import * as error from 'lib0/error'
import * as decoding from 'lib0/decoding'
import * as encoding from 'lib0/encoding'
import * as promise from 'lib0/promise'
import * as ecdsa from 'lib0/crypto/ecdsa'
import * as aes from 'lib0/crypto/aes-gcm'
import * as rsa from 'lib0/crypto/rsa-oaep'
import * as string from 'lib0/string'
import * as jwt from 'lib0/crypto/jwt'

/**
 * @template {Object | undefined} T
 * @typedef {T & {}} Defined
 */

/**
 * @typedef {string|number|bigint|boolean|_IAnyArray|Uint8Array|{[key: string]: IAny}|null|undefined} IAny
 */

/**
 * @template {new (...args: any)=>any} T
 * @typedef {T extends abstract new (arg: infer P) => any ? P : never} FirstKeyParam
 */

/**
 * @template {any} T
 * @typedef {T extends { prefix: (arg: infer P) => Uint8Array } ? P : Uint8Array} KeyPrefixArg
 */

/**
 * @todo move this to utils.js
 *
 * @param {any} K
 * @param {any} prefix
 * @return Uint8Array
 */
export const encodePrefix = (K, prefix) => {
  /* c8 ignore start */
  if (K.prefix == null) {
    if (prefix && prefix.constructor === Uint8Array) {
      return prefix
    }
    // expected either that prefix method is defined or that specified prefix is a buffer
    error.unexpectedCase()
  }
  /* c8 ignore stop */
  if (K === StringKey || K === BinaryKey) {
    return prefix
  }
  return K.prefix(prefix)
}

/* c8 ignore start */
/**
 * @interface
 * @typedef {IAny[]} _IAnyArray
 */
export class IEncodable {
  /**
   * @param {...any} _args
   */
  constructor (..._args) { } // eslint-disable-line

  /**
   * @param {encoding.Encoder} _encoder
   */
  encode (_encoder) {
    error.methodUnimplemented()
  }

  /**
   * @param {decoding.Decoder} _decoder
   * @return {IEncodable}
   */
  static decode (_decoder) {
    error.methodUnimplemented()
  }
}
/* c8 ignore stop */

/**
 * @typedef {IEncodable} IEncodableKey
 * @property {function(...any):Uint8Array} [prefix]
 */

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
export class NoValue {
  /**
   * @param {null} v
   */
  constructor (v) {
    this.v = v
  }

  /**
   * @param {encoding.Encoder} _encoder
   */
  encode (_encoder) { }

  /**
   * @param {decoding.Decoder} _decoder
   * @return {NoValue}
   */
  /* c8 ignore next 3 */
  static decode (_decoder) {
    return new this(null)
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
        return new CryptoKeyValue(await rsa.importKeyJwk(jwk))
      case 'EC':
        return new CryptoKeyValue(await ecdsa.importKeyJwk(jwk))
      case 'oct':
        return new CryptoKeyValue(await aes.importKeyJwk(jwk))
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
 * Note that this implementation should be polyfilled by node.js/browser.js. This is just an
 * implementation that works exactly like the native implementation (however, it's quite
 * inefficient).
 *
 * @implements IEncodableKey
 */
export class BinaryKey {
  /**
   * @param {Uint8Array} v
   */
  constructor (v) {
    this.v = v
  }

  /**
   * @param {encoding.Encoder} encoder
   */
  encode (encoder) {
    encoding.writeTerminatedUint8Array(encoder, this.v)
  }

  /**
   * @param {decoding.Decoder} decoder
   * @return {IEncodable}
   */
  static decode (decoder) {
    return new this(decoding.readTerminatedUint8Array(decoder))
  }

  /**
   * @param {Uint8Array} prefix
   */
  static prefix (prefix) {
    return encoding.encode(encoder => encoding.writeTerminatedUint8Array(encoder, prefix)).slice(0, -1) // remove terminating character
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
    encoding.writeTerminatedString(encoder, this.v)
  }

  /**
   * @param {decoding.Decoder} decoder
   * @return {IEncodable}
   */
  static decode (decoder) {
    return new this(decoding.readTerminatedString(decoder))
  }

  /**
   * @param {string} prefix
   */
  static prefix (prefix) {
    return string.encodeUtf8(prefix)
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
 * @template { { iat: number } } PAYLOAD
 * @template {any} [HEADER=any]
 *
 * @todo could implement check verifying that this is indeed a jwt string. If so, we can use binary
 * encoding and also support hashes.
 * @implements IEncodable
 */
export class JwtValue extends StringValue {
  /**
   * @param {CryptoKey} publicKey
   * @return {Promise<{ header: HEADER, payload: PAYLOAD }>}
   */
  verify (publicKey) {
    return jwt.verifyJwt(publicKey, this.v)
  }

  /**
   * Decode the value without verifying it.
   * @return { { header: HEADER, payload: PAYLOAD } }
   */
  unsafeDecode () {
    return jwt.unsafeDecode(this.v)
  }
}

/**
 * @template {typeof IEncodable} KEY
 * @template {typeof IEncodable} VALUE
 * @template {typeof IEncodable} MKEY
 *
 * @typedef {Object} ITableIndex
 * @property {MKEY} ITableIndex.key
 * @property {function(InstanceType<KEY>,InstanceType<VALUE>):InstanceType<MKEY>} ITableIndex.mapper
 */

/**
 * @template {typeof IEncodable} KEY
 * @template {typeof IEncodable} VALUE
 *
 * @typedef {Object} ITableDef
 * @property {KEY} ITableDef.key
 * @property {VALUE} ITableDef.value
 * @property {{[key: string]: ITableIndex<KEY,VALUE,any>}} [ITableDef.indexes]
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
 * @template {typeof IEncodable} KEY
 *
 * @typedef {Object} StartEndRangeOption
 * @property {InstanceType<KEY>|FirstKeyParam<KEY>} [start]
 * @property {boolean} [startExclusive]
 * @property {InstanceType<KEY>|FirstKeyParam<KEY>} [end]
 * @property {boolean} [endExclusive]
 * @property {boolean} [reverse]
 * @property {number} [limit] Number of items to receive
 */

/**
 * @template {typeof IEncodable} KEY
 *
 * @typedef {Object} PrefixedRangeOption
 * @property {KeyPrefixArg<KEY>} PrefixedRangeOption.prefix
 * @property {boolean} [reverse]
 * @property {number} [limit] Number of items to receive
 */

/**
 * @template {typeof IEncodable} KEY
 *
 * @typedef {PrefixedRangeOption<KEY>|StartEndRangeOption<KEY>} RangeOption
 */

/**
 * @template {IEncodable} KEY
 * @template {IEncodable} VALUE
 * @template {IEncodable|undefined} FKEY
 *
 * @interface
 * @typedef {Object} ICursor
 * @property {KEY} ICursor.key
 * @property {VALUE} ICursor.value
 * @property {FKEY} ICursor.fkey
 * @property {function():void} stop
 */

/* c8 ignore start */
/**
 * @template {typeof IEncodable} KEY
 * @template {typeof IEncodable} VALUE
 * @template {{[key: string]: ITableIndex<any, any, any>}} INDEX
 * @template {IEncodable | undefined} FKEY
 *
 * @interface
 */
export class ITableReadonly {
  constructor () {
    /**
     * @type {{ [Indexname in keyof INDEX]: IndexedTableReadonly<INDEX[Indexname]["key"], VALUE, KEY, {}> }}
     */
    this.indexes = /** @type {any} */ ({})
  }

  /**
   * @param {InstanceType<KEY>|FirstKeyParam<KEY>} _key
   * @return {Promise<InstanceType<VALUE>|null>}
   */
  get (_key) {
    error.methodUnimplemented()
  }

  /**
   * @param {RangeOption<KEY>} [_range]
   * @return {Promise<Array<{ key: InstanceType<KEY>, value: InstanceType<VALUE>, fkey: FKEY }>>}
   */
  getEntries (_range) {
    error.methodUnimplemented()
  }

  /**
   * @param {RangeOption<KEY>} [_range]
   * @return {Promise<Array<InstanceType<VALUE>>>}
   */
  getValues (_range) {
    error.methodUnimplemented()
  }

  /**
   * @param {RangeOption<KEY>} [_range]
   * @return {Promise<Array<InstanceType<KEY>>>}
   */
  getKeys (_range) {
    error.methodUnimplemented()
  }

  /**
   * @param {RangeOption<KEY>} _range
   * @param {function(ICursor<InstanceType<KEY>,InstanceType<VALUE>,FKEY>):void|Promise<void>} _f
   * @return {Promise<void>}
   */
  iterate (_range, _f) {
    error.methodUnimplemented()
  }
}
/* c8 ignore stop */

/* c8 ignore start */
/**
 * @template {typeof IEncodable} KEY
 * @template {typeof IEncodable} VALUE
 * @template {{[key: string]: ITableIndex<KEY,VALUE,any>}} INDEX
 * @template {IEncodable|undefined} FKEY
 *
 * @interface
 * @extends ITableReadonly<KEY,VALUE,INDEX,FKEY>
 */
export class ITable extends ITableReadonly {
  constructor () {
    super()
    /**
     * @type {{ [Indexname in keyof INDEX]: IndexedTable<INDEX[Indexname]["key"], VALUE, KEY, {}> }}
     */
    this.indexes = /** @type {any} */ ({})
  }

  /**
   * @param {InstanceType<KEY>|FirstKeyParam<KEY>} _key
   * @param {InstanceType<VALUE>|FirstKeyParam<VALUE>} _value
   */
  set (_key, _value) {
    error.methodUnimplemented()
  }

  /**
   * Only works with AutoKey
   *
   * @param {InstanceType<VALUE>|FirstKeyParam<VALUE>} _value
   * @return {Promise<InstanceType<KEY>>}
   */
  add (_value) {
    error.methodUnimplemented()
  }

  /**
   * @param {InstanceType<KEY>|FirstKeyParam<KEY>} _key
   * @return {Promise<void>}
   */
  remove (_key) {
    error.methodUnimplemented()
  }

  /**
   * @param {RangeOption<KEY>} _range
   * @return {Promise<void>}
   */
  removeRange (_range) {
    error.methodUnimplemented()
  }
}
/* c8 ignore stop */

/**
 * @todo move to utils. dont export via common
 * @todo rename MKEY to FKEY and change the order
 *
 * @template {typeof IEncodable} MKEY
 * @template {typeof IEncodable} VALUE
 * @template {typeof IEncodable} KEY
 * @template {{[key: string]: ITableIndex<any, any, any>}} INDEX
 *
 * @implements ITableReadonly<MKEY,VALUE,INDEX,InstanceType<KEY>>
 */
export class IndexedTableReadonly {
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
     * @type {{ [Indexname in keyof INDEX]: IndexedTableReadonly<INDEX[Indexname]["key"],VALUE,MKEY,{}> }}
     */
    this.indexes = /** @type {any} */ ({})
  }

  /**
   * @param {InstanceType<MKEY>|FirstKeyParam<MKEY>} mkey
   * @return {Promise<InstanceType<VALUE>|null>}
   */
  async get (mkey) {
    const key = await this.t.get(mkey)
    return key && this.source.get(key)
  }

  /**
   * @param {RangeOption<MKEY>} [range]
   * @return {Promise<Array<{ key: InstanceType<MKEY>, value: InstanceType<VALUE>, fkey: InstanceType<KEY>}>>}
   */
  async getEntries (range) {
    const entries = await this.t.getEntries(range)
    const vals = await promise.all(entries.map(entry => /** @type {Promise<InstanceType<VALUE>>} */ (this.source.get(entry.value))))
    return entries.map((entry, i) => ({ key: entry.key, value: vals[i], fkey: entry.value }))
  }

  /**
   * @param {RangeOption<MKEY>} [range]
   * @return {Promise<Array<InstanceType<VALUE>>>}
   */
  async getValues (range) {
    const values = await this.t.getValues(range)
    return await promise.all(values.map(value => /** @type {Promise<InstanceType<VALUE>>} */ (this.source.get(value))))
  }

  /**
   * @param {RangeOption<MKEY>} [range]
   * @return {Promise<Array<InstanceType<MKEY>>>}
   */
  getKeys (range) {
    return this.t.getKeys(range)
  }

  /**
   * @param {RangeOption<MKEY>} range
   * @param {function(ICursor<InstanceType<MKEY>,InstanceType<VALUE>,InstanceType<KEY>>):void} f
   * @return {Promise<void>}
   */
  iterate (range, f) {
    return this.t.iterate(range, async cursor => {
      const value = /** @type {InstanceType<VALUE>} */ (await this.source.get(cursor.value))
      f({
        key: cursor.key,
        value,
        fkey: cursor.value,
        stop: cursor.stop
      })
    })
  }
}

/**
 * @todo move to utils. dont export via common
 * @todo rename MKEY to FKEY and change the order
 *
 * @template {typeof IEncodable} KEY
 * @template {typeof IEncodable} VALUE
 * @template {typeof IEncodable} MKEY
 * @template {{[key: string]: ITableIndex<any, any, any>}} INDEX
 *
 * @extends IndexedTableReadonly<KEY, VALUE, MKEY, INDEX>
 */
export class IndexedTable extends IndexedTableReadonly {
  /**
   * @param {InstanceType<KEY>|FirstKeyParam<KEY>} key
   * @return {Promise<void>}
   */
  async remove (key) {
    const fkey = await this.t.get(key)
    if (fkey) {
      await this.source.remove(fkey)
    }
  }

  /**
   * @param {RangeOption<KEY>} range
   * @return {Promise<void>}
   */
  async removeRange (range) {
    const keys = await this.t.getValues(range)
    await promise.all(keys.map(key => this.source.remove(key)))
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
   * @param {InstanceType<ODef[Key]>|FirstKeyParam<ODef[Key]>} _value
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
     * @type {{ [Tablename in keyof DEF["tables"]]: ITable<NonNullable<DEF["tables"]>[Tablename]["key"],NonNullable<DEF["tables"]>[Tablename]["value"],Defined<NonNullable<DEF["tables"]>[Tablename]["indexes"]>,undefined> }}
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
     * @type {{ [Tablename in keyof DEF["tables"]]:ITableReadonly<NonNullable<DEF["tables"]>[Tablename]["key"],NonNullable<DEF["tables"]>[Tablename]["value"],Defined<NonNullable<DEF["tables"]>[Tablename]["indexes"]>,undefined> }}
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
