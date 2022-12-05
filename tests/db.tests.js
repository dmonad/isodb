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
      const def = { strings: { key: iso.StringKey, value: iso.AnyValue }, auto: { key: iso.AutoKey, value: iso.AnyValue } }
      const db = await iso.openDB(getDbName(tc.testName), def)
      db.transact(tr => {
        for (let i = 1; i < 30; i++) {
          tr.tables.auto.add(new iso.AnyValue({ i }))
        }
        for (let i = 1; i < 9; i++) {
          tr.tables.strings.set(new iso.StringKey(i + ''), new iso.AnyValue(i + ''))
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
        t.assert(read.length === 2 && read.every((v, index) => v === index + 2))
      })
      await db.transact(async tr => {
        /**
         * @type {Array<number>}
         */
        const read = []
        await tr.tables.auto.iterate({ start: new iso.AutoKey(2), end: new iso.AutoKey(3), startExclusive: true }, (cursor) => {
          const k = cursor.key
          const v = cursor.value
          t.compare({ i: k.id }, v.v)
          read.push(k.id)
        })
        t.assert(read.length === 1 && read.every((v, index) => v === index + 3))
      })
      await db.transact(async tr => {
        /**
         * @type {Array<number>}
         */
        const read = []
        await tr.tables.auto.iterate({ start: new iso.AutoKey(2), end: new iso.AutoKey(3), endExclusive: true }, (cursor) => {
          const k = cursor.key
          const v = cursor.value
          t.compare({ i: k.id }, v.v)
          read.push(k.id)
        })
        t.assert(read.length === 1 && read.every((v, index) => v === index + 2))
      })
      await db.transact(async tr => {
        /**
         * @type {Array<number>}
         */
        const read = []
        await tr.tables.auto.iterate({ start: new iso.AutoKey(2), startExclusive: true }, (cursor) => {
          const k = cursor.key
          const v = cursor.value
          t.compare({ i: k.id }, v.v)
          read.push(k.id)
        })
        t.assert(read.length === 27 && read.every((v, index) => v === index + 3))
      })
      await db.transact(async tr => {
        /**
         * @type {Array<number>}
         */
        const read = []
        await tr.tables.auto.iterate({ end: new iso.AutoKey(3), endExclusive: true }, (cursor) => {
          const k = cursor.key
          const v = cursor.value
          t.compare({ i: k.id }, v.v)
          read.push(k.id)
        })
        t.assert(read.length === 2 && read.every((v, index) => v === index + 1))
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
        await tr.tables.auto.iterate({ end: new iso.AutoKey(3) }, (cursor) => {
          const k = cursor.key
          const v = cursor.value
          t.compare({ i: k.id }, v.v)
          read.push(k.id)
        })
        t.assert(read.length === 3 && read.every((v, index) => v === index + 1))
      })
      // working on strings
      await db.transact(async tr => {
        /**
         * @type {Array<string>}
         */
        const read = []
        await tr.tables.strings.iterate({ start: new iso.StringKey('1'), end: new iso.StringKey('3') }, (cursor) => {
          const k = cursor.key
          const v = cursor.value
          t.compare(k.id, v.v)
          read.push(k.id)
        })
        t.assert(read.length === 3 && read.every((v, index) => v === '' + (index + 1)))
      })
      await db.transact(async tr => {
        /**
         * @type {Array<string>}
         */
        const read = []
        await tr.tables.strings.iterate({ start: new iso.StringKey('1'), end: new iso.StringKey('3'), startExclusive: true, endExclusive: true }, (cursor) => {
          const k = cursor.key
          const v = cursor.value
          t.compare(k.id, v.v)
          read.push(k.id)
        })
        t.assert(read.length === 1 && read.every((v, index) => v === '' + (index + 2)))
      })
      // range limit
      await db.transact(async tr => {
        /**
         * @type {Array<string>}
         */
        const read = []
        await tr.tables.strings.iterate({ start: new iso.StringKey('1'), startExclusive: true, limit: 5 }, (cursor) => {
          const k = cursor.key
          const v = cursor.value
          t.compare(k.id, v.v)
          read.push(k.id)
        })
        t.assert(read.length === 5 && read.every((v, index) => v === '' + (index + 2)))
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
export const testBasics = async tc => {
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
export const testRetrieval = async tc => {
  for (const iso of isoImpls) {
    await t.groupAsync(iso.name, async () => {
      await iso.deleteDB(getDbName(tc.testName))
      const def = { auto: { key: iso.AutoKey, value: iso.AnyValue } }
      const db = await iso.openDB(getDbName(tc.testName), def)
      await db.transact(async tr => {
        for (let i = 1; i <= 10; i++) {
          await tr.tables.auto.add(new iso.AnyValue(i))
        }
        // Keys
        const limitNorangeKeys = await tr.tables.auto.getKeys({ limit: 3 })
        t.assert(limitNorangeKeys.length === 3 && limitNorangeKeys[0].id === 1)
        const limitRangedKeys = await tr.tables.auto.getKeys({ limit: 3, start: new iso.AutoKey(3) })
        t.assert(limitRangedKeys.length === 3 && limitRangedKeys[0].id === 3)
        // Vals
        const limitNorangeVals = await tr.tables.auto.getValues({ limit: 3 })
        t.assert(limitNorangeVals.length === 3 && limitNorangeVals[0].v === 1)
        const limitRangedVals = await tr.tables.auto.getValues({ limit: 3, start: new iso.AutoKey(3) })
        t.assert(limitRangedVals.length === 3 && limitRangedVals[0].v === 3)
        // Entries
        const limitNorangeEntries = await tr.tables.auto.getEntries({ limit: 3 })
        t.assert(limitNorangeEntries.length === 3 && limitNorangeEntries[0].key.id === 1)
        const limitRangedEntries = await tr.tables.auto.getEntries({ limit: 3, start: new iso.AutoKey(3) })
        t.assert(limitRangedEntries.length === 3 && limitRangedEntries[0].key.id === 3)
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
      const n = 1000
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
      await t.measureTimeAsync(`${iso.name}: Time to iterate ${n} elements`, async () => {
        const db = await iso.openDB(getDbName(tc.testName), def)
        await db.transact(async tr => {
          const abcTable = tr.tables.abc
          let retrieved = 0
          await abcTable.iterate({}, _cursor => {
            retrieved++
          })
          t.assert(retrieved === n)
        })
      })
      await t.measureTimeAsync(`${iso.name}: Time to get ${n} entries`, async () => {
        const db = await iso.openDB(getDbName(tc.testName), def)
        await db.transact(async tr => {
          const entries = await tr.tables.abc.getEntries({})
          t.assert(entries.length === n)
        })
      })
      await t.measureTimeAsync(`${iso.name}: Time to get ${n} keys`, async () => {
        const db = await iso.openDB(getDbName(tc.testName), def)
        await db.transact(async tr => {
          const keys = await tr.tables.abc.getKeys({})
          t.assert(keys.length === n)
        })
      })
      await t.measureTimeAsync(`${iso.name}: Time to get ${n} values`, async () => {
        const db = await iso.openDB(getDbName(tc.testName), def)
        await db.transact(async tr => {
          const values = await tr.tables.abc.getValues({})
          t.assert(values.length === n)
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
      await t.measureTimeAsync(`${iso.name}: Time to iterate ${n} elements (autokey))`, async () => {
        const db = await iso.openDB(getDbName(tc.testName), def)
        await db.transact(async tr => {
          const autoTable = tr.tables.auto
          let retrieved = 0
          await autoTable.iterate({}, cursor => {
            t.compare(cursor.value.v, { test: 'someVal' + (cursor.key.id - 1) })
            retrieved++
          })
          t.assert(retrieved === n)
        })
      })
      await t.measureTimeAsync(`${iso.name}: Time to get ${n} entries (autokey))`, async () => {
        const db = await iso.openDB(getDbName(tc.testName), def)
        await db.transact(async tr => {
          const entries = await tr.tables.auto.getEntries({})
          t.assert(entries.length === n)
        })
      })
      await t.measureTimeAsync(`${iso.name}: Time to get ${n} keys (autokey))`, async () => {
        const db = await iso.openDB(getDbName(tc.testName), def)
        await db.transact(async tr => {
          const keys = await tr.tables.auto.getKeys({})
          t.assert(keys.length === n)
        })
      })
      await t.measureTimeAsync(`${iso.name}: Time to get ${n} values (autokey))`, async () => {
        const db = await iso.openDB(getDbName(tc.testName), def)
        await db.transact(async tr => {
          const values = await tr.tables.auto.getValues({})
          t.assert(values.length === n)
        })
      })
    })
  }
}
