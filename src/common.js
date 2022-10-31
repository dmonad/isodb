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
 * @template {IKey} K
 * @implements {IValue}
 */
export class AnyValue {
  /**
   * @param {V} v
   */
  constructor (v) {
    /**
     * @type {K|null}
     */
    this.key = null
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
   * @return {AnyValue<any,any>}
   */
  static decode (decoder) {
    return new AnyValue(decoding.readAny(decoder))
  }
}

/**
 * @interface
 */
export class IValue {
  constructor () {
    /**
     * Is null if this item has not been added yet.
     *
     * @type {IKey|null}
     */
    this.key = null
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

//
