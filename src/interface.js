import * as error from 'lib0/error'
import * as common from './common.js' // eslint-disable-line
export * from './common.js'

/**
 * @template {common.IDbDef} DEF
 *
 * @param {string} _location
 * @param {DEF} _def
 * @return {Promise<common.IDB<DEF>>}
 */
export const openDB = async (_location, _def) => {
  error.methodUnimplemented()
}

/**
 * @param {string} _path
 * @return {Promise<void>}
 */
export const deleteDB = (_path) => error.methodUnimplemented()
