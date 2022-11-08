
import * as t from 'lib0/testing'
import * as isoIdb from '../src/browser.js'
import * as isoLmdb from '../src/node.js'

const isoImpls = [isoIdb, isoLmdb]

/**
 * @param {t.TestCase} tc
 */
export const testSomething = async tc => {
  for (const iso of isoImpls) {
    await t.groupAsync(iso.name, async () => {
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
    })
  }
}
