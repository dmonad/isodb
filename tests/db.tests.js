
import * as t from 'lib0/testing'
import * as logging from 'lib0/logging'

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

const getDbName = testname => '.test_dbs/' + testname

/**
 * @param {t.TestCase} tc
 */
export const testAsyncs = async tc => {
  const async1 = async () => {
    let res = await 'x1'
    console.log(res)
    res = await 'x2'
    console.log(res)
  }
  const async2 = async () => {
    let res = await 'y1'
    console.log(res)
    res = await 'y2'
    console.log(res)
  }
  await Promise.all([async1(), async2()])
}

/**
 * @param {t.TestCase} tc
 */
export const testTransactionsAreExecutedOneAfterAnother = async tc => {
  for (const iso of isoImpls) {
    await t.groupAsync(iso.name, async () => {
      await iso.deleteDB(getDbName(tc.testName))
      const def = { abc: { key: iso.StringKey, value: iso.AnyValue }, xyz: { key: iso.AutoKey, value: iso.AnyValue } }
      /**
       * @type {import("../src/browser.js").IsoDB<typeof def>}
       */
      const db = await iso.openDB(getDbName(tc.testName), def)
      /**
       * @type {Array<string>}
       */
      const logs = []
      const t1 = db.transact(async tr => {
        const testValue = new iso.AnyValue({ test: 'someVal' })
        await tr.set('xyz', new iso.StringKey('test'), testValue)
        logs.push('x1')
        const vv = await tr.get('abc', new iso.StringKey('test'))
        logs.push('x2')
        t.compare(vv.v, testValue.v)
        const key = await tr.add('xyz', new iso.AnyValue({ test: 'someVal' }))
        logs.push('x3')
        const v = await tr.get('xyz', key)
        logs.push('x4')
        t.compare(v.v, { test: 'someVal' }, 'checked someval')
      })
      const t2 = db.transact(async tr => {
        const testValue = new iso.AnyValue({ test: 'someVal' })
        await tr.set('abc', new iso.StringKey('test'), testValue)
        logs.push('y1')
        const vv = await tr.get('abc', new iso.StringKey('test'))
        logs.push('y2')
        t.compare(vv.v, testValue.v)
        const key = await tr.add('xyz', new iso.AnyValue({ test: 'someVal' }))
        logs.push('y3')
        const v = await tr.get('xyz', key)
        logs.push('y4')
        t.compare(v.v, { test: 'someVal' }, 'checked someval')
      })
      await Promise.all([t1, t2])
      logging.print(logs)
      t.compareArrays(logs, ['x1', 'x2', 'x3', 'x4', 'y1', 'y2', 'y3', 'y4'])
    })
  }
}

/**
 * @param {t.TestCase} tc
 */
export const testSomething = async tc => {
  for (const iso of isoImpls) {
    await t.groupAsync(iso.name, async () => {
      await iso.deleteDB(getDbName(tc.testName))
      const def = { abc: { key: iso.StringKey, value: iso.AnyValue }, xyz: { key: iso.AutoKey, value: iso.AnyValue } }
      /**
       * @type {iso.IsoDB<typeof def>}
       */
      const db = await iso.openDB(getDbName(tc.testName), def)
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
      await iso.deleteDB(getDbName(tc.testName))
      const n = 5000
      const def = { abc: { key: iso.StringKey, value: iso.AnyValue }, auto: { key: iso.AutoKey, value: iso.AnyValue } }
      await t.measureTimeAsync(`${iso.name}: Time to insert ${n} elements`, async () => {
        /**
         * @type {iso.IsoDB<typeof def>}
         */
        const db = await iso.openDB(getDbName(tc.testName), def)
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
        const db = await iso.openDB(getDbName(tc.testName), def)
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
        const db = await iso.openDB(getDbName(tc.testName), def)
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
        const db = await iso.openDB(getDbName(tc.testName), def)
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
