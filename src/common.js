import * as error from 'lib0/error'
import * as decoding from 'lib0/decoding' // eslint-disable-line
import * as encoding from 'lib0/encoding' // eslint-disable-line

/**
 * @typedef {string|number|bigint|boolean|_IAnyArray|Uint8Array|{[key: string]: IAny}|null|undefined} IAny
 */

/**
 * @typedef {IAny[]} _IAnyArray
 */

/**
 * @template {IAny} V
 * @implements IValue
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
    return new AnyValue(decoding.readAny(decoder))
  }
}

/**
 * @interface
 */
export class IValue {
  /**
   * @param {any} v
   */
  constructor (v) {
    this.v = v
  }

  /**
   * @param {encoding.Encoder} _encoder
   */
  encode (_encoder) {
    error.methodUnimplemented()
  }

  /**
   * @param {decoding.Decoder} _decoder
*  * @return {IValue}
   */
  static decode (_decoder) {
    error.methodUnimplemented()
  }
}

/**
 * @interface
 */
export class IKey {
  /**
   * @param {any} id
   */
  constructor (id) {
    this.id = id
  }

  /**
   * @param {encoding.Encoder} _encoder
   */
  encode (_encoder) {
    error.methodUnimplemented()
  }

  /**
*  * If the key is a number, then this method will not be called.
*  * Instead, the class will be initialized with only the key as
*  * a parameter.
*  *
   * @param {decoding.Decoder} _decoder
*  * @return {IKey}
   */
  static decode (_decoder) {
    error.methodUnimplemented()
  }
}

/**
 * @implements IKey
 */
export class AutoKey {
  /**
   * @param {number} id
   */
  constructor (id) {
    this.id = id
  }

  /**
   * @param {encoding.Encoder} encoder
   */
  encode (encoder) {
    encoding.writeUint32(encoder, this.id)
  }

  /**
   * @param {decoding.Decoder} decoder
   */
  static decode (decoder) {
    return new AutoKey(decoding.readUint32(decoder))
  }
}

/**
 * @implements IKey
 */
export class StringKey {
  /**
   * @param {string} id
   */
  constructor (id) {
    this.id = id
  }

  /**
   * @param {encoding.Encoder} _encoder
   */
  encode (_encoder) {
    error.methodUnimplemented()
  }

  /**
   * @param {decoding.Decoder} _decoder
   * @return {IKey}
   */
  static decode (_decoder) {
    error.methodUnimplemented()
  }
}

/**
 * @typedef {Object} ITableDef
 * @property {typeof IKey} ITableDef.key
 * @property {typeof IValue} ITableDef.value
 */

/**
 * @typedef {{ [key: string]: ITableDef }} IDbDef
 */

/**
 * @template {IKey} KEY
 * @template {IValue} VALUE
 */
export class IIsoTable {
  /**
   * @param {KEY} _key
   * @return {Promise<VALUE>}
   */
  async get (_key) {
    error.methodUnimplemented()
  }

  /**
   * @param {KEY} _key
   * @param {VALUE} _value
   * @return {Promise<void>}
   */
  async set (_key, _value) {
    error.methodUnimplemented()
  }

  /**
   * Only works with AutoKey
   *
   * @param {VALUE} _value
   * @return {Promise<KEY>}
   */
  async add (_value) {
    error.methodUnimplemented()
  }
}

/**
 * @template {{[key: string]: ITableDef}} DEF
 */
export class ITransaction {
  /**
   * @param {IIsoDB<DEF>} db
   */
  constructor (db) {
    this.db = db
    /**
     * @type {{ [Tablename in keyof DEF]: IIsoTable<InstanceType<DEF[Tablename]["key"]>, InstanceType<DEF[Tablename]["value"]>> }}
     */
    this.tables = /** @type {any} */ ({})
  }
}

/**
 * @template {IDbDef} DEF
 */
export class IIsoDB {
  /**
   * @template T
   * @param {function(ITransaction<DEF>): Promise<T>} _f
   * @return {Promise<T>}
   */
  async transact (_f) {
    error.methodUnimplemented()
  }

  destroy () {
  }
}
