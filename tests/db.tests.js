
import * as t from 'lib0/testing'

/**
 * @type {Array<import('../src/browser.js') | import('../src/node.js')>}
 */
const isoImpls = []

/**
 * @param {Array<import('../src/browser.js') | import('../src/node.js')>} iso
 */
export const addIsoImpls = iso => {
  isoImpls.push(iso)
}

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

/**
 * @param {t.TestCase} tc
 */
export const testBenchmark = async tc => {
  for (const iso of isoImpls) {
    await t.groupAsync(iso.name, async () => {
      await iso.deleteDB(tc.testName)
      const n = 5000
      const def = { abc: { key: iso.StringKey, value: iso.AnyValue }, auto: { key: iso.AutoKey, value: iso.AnyValue } }
      await t.measureTimeAsync(`${iso.name}: Time to insert ${n} elements`, async () => {
        /**
         * @type {iso.IsoDB<typeof def>}
         */
        const db = await iso.openDB(tc.testName, def)
        await db.transact(async tr => {
          for (let i = 0; i < n; i++) {
            const testValue = new iso.AnyValue({ test: 'someVal' + i })
            await tr.set('abc', new iso.StringKey('key' + i), testValue)
          }
        })
      })
      await t.measureTimeAsync(`${iso.name}: Time to retrieve ${n} elements`, async () => {
        /**
         * @type {iso.IsoDB<typeof def>}
         */
        const db = await iso.openDB(tc.testName, def)
        await db.transact(async tr => {
          for (let i = 0; i < n; i++) {
            const v = await tr.get('abc', new iso.StringKey('key' + i))
            t.assert(v.v.test === 'someVal' + i)
          }
        })
      })

      const keys = []
      await t.measureTimeAsync(`${iso.name}: Time to insert ${n} elements (autokey))`, async () => {
        /**
         * @type {iso.IsoDB<typeof def>}
         */
        const db = await iso.openDB(tc.testName, def)
        await db.transact(async tr => {
          for (let i = 0; i < n; i++) {
            const testValue = new iso.AnyValue({ test: 'someVal' + i })
            const key = await tr.add('auto', testValue)
            keys.push(key)
          }
        })
      })
      await t.measureTimeAsync(`${iso.name}: Time to retrieve ${n} elements (autokey))`, async () => {
        /**
         * @type {iso.IsoDB<typeof def>}
         */
        const db = await iso.openDB(tc.testName, def)
        await db.transact(async tr => {
          for (let i = 0; i < keys.length; i++) {
            const v = await tr.get('auto', keys[i])
            t.assert(v.v.test === 'someVal' + i)
          }
        })
      })
    })
  }
}
