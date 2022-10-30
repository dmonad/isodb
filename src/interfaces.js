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
 * @implements {IValue}
 */
export class AnyValue {
  /**
   * @param {V} v
   */
  constructor (v) {
    this.v = v
  }

  /**
   * @return {Uint8Array}
   */
  toBuf () {
    const encoder = encoding.createEncoder()
    encoding.writeAny(encoder, this.v)
    return encoding.toUint8Array(encoder)
  }

  /**
   * @param {decoding.Decoder} decoder
   * @return {AnyValue<any>}
   */
  static fromBuf (decoder) {
    return new AnyValue(decoding.readAny(decoder))
  }
}

/**
 * @interface
 */
export class IValue {
  /**
   * @return {Uint8Array}
   */
  toBuf () {
    error.methodUnimplemented()
  }

  /**
   * @param {decoding.Decoder} _decoder
*  * @return {IValue}
   */
  static fromBuf (_decoder) {
    error.methodUnimplemented()
  }
}

/**
 * @interface
 */
export class IKey {
  /**
   * @return {Uint8Array|number|string} May return buffer or 32bit int
   */
  toBuf () {
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
  static fromBuf (_decoder) {
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

  toBuf () {
    return this.id
  }

  /**
   * @param {decoding.Decoder} _decoder
   */
  static fromBuf (_decoder) {
    error.methodUnimplemented()
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

  toBuf () {
    return this.id
  }

  /**
   * @param {decoding.Decoder} _decoder
   */
  static fromBuf (_decoder) {
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
