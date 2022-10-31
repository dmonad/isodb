
import * as t from 'lib0/testing'
import * as iso from '../src/browser.js'

/**
 * @template {{[k: string]: any}} D
 */
class KV {
  /**
   * @param {D} kv
   */
  constructor (kv) {
    this.kv = kv
  }

  /**
   * @template {keyof D} K
   * @param {K} k
   * @return {D[K]}
   */
  get (k) {
    return this.kv[k]
  }

  /**
   * @template {keyof D} K
   * @param {K} k
   * @param {D[K]} v
   */
  set (k, v) {
    this.kv[k] = v
  }
}

const def = { a: { key: 4, x: 55 }, b: { key: 'test2' } }

/**
 * @type {KV<typeof def>}
 */
const kv = new KV(def)
const x = kv.get('a')
console.log(x)

/**
 * @param {t.TestCase} tc
 */
export const testSomething = async tc => {
  await iso.deleteDB(tc.testName)
  const def = { abc: { key: iso.StringKey, value: iso.AnyValue }, xyz: { key: iso.AutoKey, value: iso.AnyValue } }
  /**
   * @type {iso.IsoDB<typeof def>}
   */
  const db = await iso.openDB(tc.testName, def)
  await db.transact(async tr => {
    const testValue = new iso.AnyValue({ test: 'someVal' })
    await tr.set('abc', new iso.StringKey('test'), testValue)
    const vv = await tr.get('abc', new iso.StringKey('test'))
    t.compare(vv.v, testValue.v)
    const key = await tr.add('xyz', new iso.AnyValue({ test: 'someVal' }))
    const v = await tr.get('xyz', key)
    t.compare(v.v, { test: 'someVal' }, 'checked someval')
  })
}
