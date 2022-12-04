import * as t from 'lib0/testing'

/**
 * @type {Array<import('../src/node.js') | import('../src/browser.js')>}
 */
const isoImpls = []

/**
 * @param {import('../src/node.js') | import('../src/browser.js')} iso
 */
export const addIsoImpls = iso => {
  isoImpls.push(iso)
}

/**
 * @param {string} testname
 */
const getDbName = testname => '.test_dbs/' + testname

/**
 * @param {t.TestCase} tc
 */
export const testIterator = async tc => {
  for (const iso of isoImpls) {
    await t.groupAsync(iso.name, async () => {
      await iso.deleteDB(getDbName(tc.testName))
      const def = { abc: { key: iso.StringKey, value: iso.AnyValue }, auto: { key: iso.AutoKey, value: iso.AnyValue } }
      const db = await iso.openDB(getDbName(tc.testName), def)
      db.transact(tr => {
        for (let i = 1; i < 30; i++) {
          tr.tables.auto.add(new iso.AnyValue({ i }))
        }
      })
      await db.transact(async tr => {
        /**
         * @type {Array<number>}
         */
        const read = []
        await tr.tables.auto.iterate({}, (cursor) => {
          const k = cursor.key
          const v = cursor.value
          t.compare({ i: k.id }, v.v)
          read.push(k.id)
          if (k.id === 27) {
            cursor.stop()
          }
        })
        t.assert(read.length === 27 && read.every((v, index) => v === index + 1))
      })
      await db.transact(async tr => {
        /**
         * @type {Array<number>}
         */
        const read = []
        await tr.tables.auto.iterate({ start: new iso.AutoKey(2) }, (cursor) => {
          const k = cursor.key
          const v = cursor.value
          t.compare({ i: k.id }, v.v)
          read.push(k.id)
        })
        t.assert(read.length === 28 && read.every((v, index) => v === index + 2))
      })
      await db.transact(async tr => {
        /**
         * @type {Array<number>}
         */
        const read = []
        await tr.tables.auto.iterate({ start: new iso.AutoKey(2), end: new iso.AutoKey(3) }, (cursor) => {
          const k = cursor.key
          const v = cursor.value
          t.compare({ i: k.id }, v.v)
          read.push(k.id)
        })
        t.assert(read.length === 1 && read.every((v, index) => v === index + 2))
      })
    })
  }
}

/**
 * @param {t.TestCase} tc
 */
export const testTransactionsAreExecutedOneAfterAnother = async tc => {
  for (const iso of isoImpls) {
    await t.groupAsync(iso.name, async () => {
      await iso.deleteDB(getDbName(tc.testName))
      const def = { abc: { key: iso.StringKey, value: iso.AnyValue }, xyz: { key: iso.AutoKey, value: iso.AnyValue } }
      const db = await iso.openDB(getDbName(tc.testName), def)
      /**
       * @type {Array<string>}
       */
      const logs = []
      const t1 = db.transact(async tr => {
        const testValue = new iso.AnyValue({ test: 'someVal' })
        const abcTable = tr.tables.abc
        const xyzTable = tr.tables.xyz
        abcTable.set(new iso.StringKey('test'), testValue)
        logs.push('x1')
        const vv = await abcTable.get(new iso.StringKey('test'))
        logs.push('x2')
        t.compare(vv.v, testValue.v)
        const key = await xyzTable.add(new iso.AnyValue({ test: 'someVal' }))
        logs.push('x3')
        const v = await xyzTable.get(key)
        logs.push('x4')
        t.compare(v.v, { test: 'someVal' }, 'checked someval')
      })
      const t2 = db.transact(async tr => {
        const testValue = new iso.AnyValue({ test: 'someVal' })
        const abcTable = tr.tables.abc
        const xyzTable = tr.tables.xyz
        abcTable.set(new iso.StringKey('test'), testValue)
        const vv = await abcTable.get(new iso.StringKey('test'))
        logs.push('y2')
        t.compare(vv.v, testValue.v)
        const key = await xyzTable.add(new iso.AnyValue({ test: 'someVal' }))
        logs.push('y3')
        const v = await xyzTable.get(key)
        logs.push('y4')
        t.compare(v.v, { test: 'someVal' }, 'checked someval')
      })
      await Promise.all([t1, t2])
      t.compareArrays(logs, ['x1', 'x2', 'x3', 'x4', 'y2', 'y3', 'y4'])
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
      const db = await iso.openDB(getDbName(tc.testName), def)
      await db.transact(async tr => {
        const testValue = new iso.AnyValue({ test: 'someVal' })
        const abcTable = tr.tables.abc
        const xyzTable = tr.tables.xyz
        abcTable.set(new iso.StringKey('test'), testValue)
        const vv = await abcTable.get(new iso.StringKey('test'))
        t.compare(vv.v, testValue.v)
        const key = await xyzTable.add(new iso.AnyValue({ test: 'someVal' }))
        const v = await xyzTable.get(key)
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
        const db = await iso.openDB(getDbName(tc.testName), def)
        await db.transact(async tr => {
          const abcTable = tr.tables.abc
          for (let i = 0; i < n; i++) {
            const testValue = new iso.AnyValue({ test: 'someVal' + i })
            abcTable.set(new iso.StringKey('key' + i), testValue)
          }
        })
      })
      await t.measureTimeAsync(`${iso.name}: Time to retrieve ${n} elements`, async () => {
        const db = await iso.openDB(getDbName(tc.testName), def)
        await db.transact(async tr => {
          const abcTable = tr.tables.abc
          for (let i = 0; i < n; i++) {
            const v = await abcTable.get(new iso.StringKey('key' + i))
            t.compare(v.v, { test: 'someVal' + i })
          }
        })
      })
      /**
       * @type {Array<import('../src/common.js').AutoKey>}
       */
      const keys = []
      await t.measureTimeAsync(`${iso.name}: Time to insert ${n} elements (autokey))`, async () => {
        const db = await iso.openDB(getDbName(tc.testName), def)
        await db.transact(async tr => {
          const autoTable = tr.tables.auto
          for (let i = 0; i < n; i++) {
            const testValue = new iso.AnyValue({ test: 'someVal' + i })
            const key = await autoTable.add(testValue)
            keys.push(key)
          }
        })
      })
      await t.measureTimeAsync(`${iso.name}: Time to retrieve ${n} elements (autokey))`, async () => {
        const db = await iso.openDB(getDbName(tc.testName), def)
        await db.transact(async tr => {
          const autoTable = tr.tables.auto
          for (let i = 0; i < keys.length; i++) {
            const v = await autoTable.get(keys[i])
            t.compare(v.v, { test: 'someVal' + i })
          }
        })
      })
    })
  }
}
