import * as t from 'lib0/testing'
import * as ecdsa from 'lib0/crypto/ecdsa'
import * as rsa from 'lib0/crypto/rsa-oaep'
import * as aes from 'lib0/crypto/aes-gcm'
import * as encoding from 'lib0/encoding'
import * as decoding from 'lib0/decoding'
import { StringKey, BinaryKey } from '../src/common.js'

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
 * @implements IEncodable
 */
class CustomKeyValue {
  /**
   * @param {string} v
   */
  constructor (v) {
    this.v = v
  }

  /**
   * @param {encoding.Encoder} encoder
   */
  encode (encoder) {
    encoding.writeVarString(encoder, this.v)
  }

  /**
   * @param {decoding.Decoder} decoder
   * @return {CustomKeyValue}
   */
  static decode (decoder) {
    return new this(decoding.readVarString(decoder))
  }
}

/**
 * @implements IEncodable
 */
class MultipleArgsParam {
  /**
   * @param {string} v
   * @param {number} n
   */
  constructor (v, n) {
    this.v = v
    this.n = n
  }

  /**
   * @param {encoding.Encoder} encoder
   */
  encode (encoder) {
    encoding.writeVarString(encoder, this.v)
    encoding.writeVarUint(encoder, this.n)
  }

  /**
   * @param {decoding.Decoder} decoder
   * @return {CustomKeyValue}
   */
  static decode (decoder) {
    return new this(decoding.readVarString(decoder), decoding.readVarUint(decoder))
  }
}

/**
 * @param {t.TestCase} tc
 */
export const testIterator = async tc => {
  for (const iso of isoImpls) {
    await t.groupAsync(iso.name, async () => {
      await iso.deleteDB(getDbName(tc.testName))
      const def = { tables: { strings: { key: iso.StringKey, value: iso.AnyValue }, auto: { key: iso.AutoKey, value: iso.AnyValue }, bin: { key: CustomKeyValue, value: iso.AnyValue } } }
      const db = await iso.openDB(getDbName(tc.testName), def)
      await db.transact(tr => {
        for (let i = 1; i < 30; i++) {
          tr.tables.auto.add(new iso.AnyValue({ i }))
        }
        // testing nested transaction
        db.transact(tr => {
          for (let i = 1; i < 9; i++) {
            tr.tables.strings.set(new iso.StringKey(i + ''), new iso.AnyValue(i + ''))
          }
        })
        // testing nested transaction (2)
        db.transact(tr => {
          for (let i = 1; i < 9; i++) {
            tr.tables.bin.set(new CustomKeyValue(i + ''), new iso.AnyValue(i + ''))
          }
        })
      })
      await db.transactReadonly(async tr => {
        /**
         * @type {Array<number>}
         */
        const read = []
        await tr.tables.auto.iterate({}, (cursor) => {
          const k = cursor.key
          const v = cursor.value
          t.compare({ i: k.v }, v.v)
          read.push(k.v)
          if (k.v === 27) {
            cursor.stop()
          }
        })
        t.assert(read.length === 27 && read.every((v, index) => v === index + 1))
      })
      await db.transactReadonly(async tr => {
        /**
         * @type {Array<number>}
         */
        const read = []
        await tr.tables.auto.iterate({ start: new iso.AutoKey(2) }, (cursor) => {
          const k = cursor.key
          const v = cursor.value
          t.compare({ i: k.v }, v.v)
          read.push(k.v)
        })
        t.assert(read.length === 28 && read.every((v, index) => v === index + 2))
      })
      await db.transactReadonly(async tr => {
        /**
         * @type {Array<number>}
         */
        const read = []
        await tr.tables.auto.iterate({ start: new iso.AutoKey(2), end: new iso.AutoKey(3) }, (cursor) => {
          const k = cursor.key
          const v = cursor.value
          t.compare({ i: k.v }, v.v)
          read.push(k.v)
        })
        t.assert(read.length === 2 && read.every((v, index) => v === index + 2))
      })
      await db.transactReadonly(async tr => {
        /**
         * @type {Array<number>}
         */
        const read = []
        await tr.tables.auto.iterate({ start: new iso.AutoKey(2), end: new iso.AutoKey(3), startExclusive: true }, (cursor) => {
          const k = cursor.key
          const v = cursor.value
          t.compare({ i: k.v }, v.v)
          read.push(k.v)
        })
        t.assert(read.length === 1 && read.every((v, index) => v === index + 3))
      })
      await db.transactReadonly(async tr => {
        /**
         * @type {Array<number>}
         */
        const read = []
        await tr.tables.auto.iterate({ start: new iso.AutoKey(2), end: new iso.AutoKey(3), endExclusive: true }, (cursor) => {
          const k = cursor.key
          const v = cursor.value
          t.compare({ i: k.v }, v.v)
          read.push(k.v)
        })
        t.assert(read.length === 1 && read.every((v, index) => v === index + 2))
      })
      await db.transactReadonly(async tr => {
        /**
         * @type {Array<number>}
         */
        const read = []
        await tr.tables.auto.iterate({ start: new iso.AutoKey(2), startExclusive: true }, (cursor) => {
          const k = cursor.key
          const v = cursor.value
          t.compare({ i: k.v }, v.v)
          read.push(k.v)
        })
        t.assert(read.length === 27 && read.every((v, index) => v === index + 3))
      })
      await db.transactReadonly(async tr => {
        /**
         * @type {Array<number>}
         */
        const read = []
        await tr.tables.auto.iterate({ end: new iso.AutoKey(3), endExclusive: true }, (cursor) => {
          const k = cursor.key
          const v = cursor.value
          t.compare({ i: k.v }, v.v)
          read.push(k.v)
        })
        t.assert(read.length === 2 && read.every((v, index) => v === index + 1))
      })
      await db.transactReadonly(async tr => {
        /**
         * @type {Array<number>}
         */
        const read = []
        await tr.tables.auto.iterate({ start: new iso.AutoKey(2) }, (cursor) => {
          const k = cursor.key
          const v = cursor.value
          t.compare({ i: k.v }, v.v)
          read.push(k.v)
        })
        t.assert(read.length === 28 && read.every((v, index) => v === index + 2))
      })
      await db.transactReadonly(async tr => {
        /**
         * @type {Array<number>}
         */
        const read = []
        await tr.tables.auto.iterate({ end: new iso.AutoKey(3) }, (cursor) => {
          const k = cursor.key
          const v = cursor.value
          t.compare({ i: k.v }, v.v)
          read.push(k.v)
        })
        t.assert(read.length === 3 && read.every((v, index) => v === index + 1))
      })
      // working on strings
      await db.transactReadonly(async tr => {
        /**
         * @type {Array<string>}
         */
        const read = []
        // iterate without explicit wrapper
        await tr.tables.strings.iterate({ start: '1', end: '3' }, (cursor) => {
          const k = cursor.key
          const v = cursor.value
          /* c8 ignore next 2 */
          t.compare(k.v, v.v)
          read.push(k.v)
        })
        t.assert(read.length === 3 && read.every((v, index) => v === '' + (index + 1)))
      })
      await db.transactReadonly(async tr => {
        /**
         * @type {Array<string>}
         */
        const read = []
        await tr.tables.strings.iterate({ start: new iso.StringKey('1'), end: new iso.StringKey('3'), startExclusive: true, endExclusive: true }, (cursor) => {
          const k = cursor.key
          const v = cursor.value
          t.compare(k.v, v.v)
          read.push(k.v)
        })
        t.assert(read.length === 1 && read.every((v, index) => v === '' + (index + 2)))
      })
      // range limit
      await db.transactReadonly(async tr => {
        /**
         * @type {Array<string>}
         */
        const read = []
        await tr.tables.strings.iterate({ start: new iso.StringKey('1'), startExclusive: true, limit: 5 }, (cursor) => {
          const k = cursor.key
          const v = cursor.value
          t.compare(k.v, v.v)
          read.push(k.v)
        })
        t.assert(read.length === 5 && read.every((v, index) => v === '' + (index + 2)))
      })
      // range limit reversed
      await db.transactReadonly(async tr => {
        /**
         * @type {Array<string>}
         */
        const read = []
        await tr.tables.strings.iterate({ start: new iso.StringKey('6'), startExclusive: true, limit: 5, reverse: true }, (cursor) => {
          const k = cursor.key
          const v = cursor.value
          t.compare(k.v, v.v)
          read.push(k.v)
        })
        t.assert(read.length === 5 && read.every((v, index) => v === '' + (5 - index)))
      })
      // Custom Keys
      await db.transactReadonly(async tr => {
        /**
         * @type {Array<string>}
         */
        const read = []
        await tr.tables.bin.iterate({ start: new CustomKeyValue('6'), startExclusive: true, limit: 5, reverse: true }, (cursor) => {
          const k = cursor.key
          const v = cursor.value
          t.compare(k.v, v.v)
          read.push(k.v)
        })
        t.assert(read.length === 5 && read.every((v, index) => v === '' + (5 - index)))
      })
      await db.transactReadonly(async tr => {
        /**
         * @type {Array<string>}
         */
        const read = []
        await tr.tables.bin.iterate({ start: new CustomKeyValue('6'), startExclusive: false, end: new CustomKeyValue('7'), endExclusive: false }, (cursor) => {
          const k = cursor.key
          const v = cursor.value
          t.compare(k.v, v.v)
          read.push(k.v)
        })
        t.assert(read.length === 2 && read.every((v, index) => v === '' + (index + 6)))
      })
      await db.transact(async tr => {
        tr.tables.bin.set(new CustomKeyValue(''), new iso.AnyValue(''))
        /**
         * @type {Array<string>}
         */
        const read = []
        await tr.tables.bin.iterate({ start: new CustomKeyValue(''), startExclusive: false, end: new CustomKeyValue(''), endExclusive: false }, (cursor) => {
          const k = cursor.key
          const v = cursor.value
          t.compare(k.v, v.v)
          read.push(k.v)
        })
        t.assert(read.length === 1 && read.every((v, _index) => v === ''))
      })
      await db.transact(async tr => {
        tr.tables.bin.set(new CustomKeyValue(''), new iso.AnyValue(''))
        /**
         * @type {Array<string>}
         */
        const read = []
        await tr.tables.bin.iterate({ start: new CustomKeyValue(''), startExclusive: false, end: new CustomKeyValue(''), endExclusive: false, reverse: true }, (cursor) => {
          const k = cursor.key
          const v = cursor.value
          t.compare(k.v, v.v)
          read.push(k.v)
        })
        t.assert(read.length === 1 && read.every((v, _index) => v === ''))
      })
    })
  }
}

/**
 * @param {t.TestCase} tc
 */
export const testArgMagic = async tc => {
  for (const iso of isoImpls) {
    await t.groupAsync(iso.name, async () => {
      await iso.deleteDB(getDbName(tc.testName))
      const def = { tables: { multiarg: { key: MultipleArgsParam, value: iso.AnyValue }, singlearg: { key: iso.AutoKey, value: iso.AnyValue } } }
      const db = await iso.openDB(getDbName(tc.testName), def)
      db.transact(tr => {
        /**
         * @type {function(MultipleArgsParam):any}
         */
        const _mf = tr.tables.multiarg.get
        /**
         * @type {function(MultipleArgsParam|string):any}
         */
        // @ts-expect-error
        const _mf2 = tr.tables.multiarg.get
        /**
         * @type {function(number):any}
         */
        const _sf = tr.tables.singlearg.get
        console.log(_mf, _mf2, _sf)
      })
    })
  }
}

/**
 * @param {t.TestCase} tc
 */
export const testUintKey = async tc => {
  for (const iso of isoImpls) {
    await t.groupAsync(iso.name, async () => {
      await iso.deleteDB(getDbName(tc.testName))
      const def = { tables: { uint: { key: iso.Uint32Key, value: iso.AnyValue } } }
      const db = await iso.openDB(getDbName(tc.testName), def)
      const N = 1000
      await db.transact(tr => {
        for (let i = 0; i < N; i++) {
          if (i % 2) {
            tr.tables.uint.set(new iso.Uint32Key(i), new iso.AnyValue(i))
          } else {
            tr.tables.uint.set(i, i)
          }
        }
      })
      // check that this is ordered correctly
      await db.transactReadonly(async tr => {
        /**
         * @type {Array<number>}
         */
        const read = []
        await tr.tables.uint.iterate({}, (cursor) => {
          const k = cursor.key
          const v = cursor.value
          t.compare(k.v, v.v)
          read.push(k.v)
        })
        t.assert(read.length === N && read.every((v, index) => v === index))
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
      const def = { tables: { abc: { key: iso.StringKey, value: iso.AnyValue }, xyz: { key: iso.AutoKey, value: iso.AnyValue } } }
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
        t.compare(vv && vv.v, testValue.v)
        const key = await xyzTable.add(new iso.AnyValue({ test: 'someVal' }))
        logs.push('x3')
        const v = await xyzTable.get(key)
        logs.push('x4')
        t.compare(v && v.v, { test: 'someVal' }, 'checked someval')
      })
      const t2 = db.transact(async tr => {
        const testValue = new iso.AnyValue({ test: 'someVal' })
        const abcTable = tr.tables.abc
        const xyzTable = tr.tables.xyz
        abcTable.set(new iso.StringKey('test'), testValue)
        const vv = await abcTable.get(new iso.StringKey('test'))
        logs.push('y2')
        t.compare(vv && vv.v, testValue.v)
        const key = await xyzTable.add(new iso.AnyValue({ test: 'someVal' }))
        logs.push('y3')
        const v = await xyzTable.get(key)
        logs.push('y4')
        t.compare(v && v.v, { test: 'someVal' }, 'checked someval')
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
      const def = { tables: { abc: { key: iso.StringKey, value: iso.AnyValue }, xyz: { key: iso.AutoKey, value: iso.AnyValue } } }
      const db = await iso.openDB(getDbName(tc.testName), def)
      await db.transact(async tr => {
        const testValue = new iso.AnyValue({ test: 'someVal' })
        const abcTable = tr.tables.abc
        const xyzTable = tr.tables.xyz
        abcTable.set(new iso.StringKey('test'), testValue)
        const vv = await abcTable.get(new iso.StringKey('test'))
        t.compare(vv && vv.v, testValue.v)
        const key = await xyzTable.add(new iso.AnyValue({ test: 'someVal' }))
        const v = await xyzTable.get(key)
        t.compare(v && v.v, { test: 'someVal' }, 'checked someval')
        await t.failsAsync(() => abcTable.add(new iso.AnyValue({ test: 'testval' })))
      })
      await db.destroy()
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
      const def = { tables: { auto: { key: iso.AutoKey, value: iso.AnyValue } } }
      const db = await iso.openDB(getDbName(tc.testName), def)
      await db.transact(async tr => {
        for (let i = 1; i <= 10; i++) {
          await tr.tables.auto.add(new iso.AnyValue(i))
        }
        // Keys
        const limitNorangeKeys = await tr.tables.auto.getKeys({ limit: 3 })
        t.assert(limitNorangeKeys.length === 3 && limitNorangeKeys[0].v === 1)
        const limitRangedKeys = await tr.tables.auto.getKeys({ limit: 3, start: new iso.AutoKey(3) })
        t.assert(limitRangedKeys.length === 3 && limitRangedKeys[0].v === 3)
        // Vals
        const limitNorangeVals = await tr.tables.auto.getValues({ limit: 3 })
        t.assert(limitNorangeVals.length === 3 && limitNorangeVals[0].v === 1)
        const limitRangedVals = await tr.tables.auto.getValues({ limit: 3, start: new iso.AutoKey(3) })
        t.assert(limitRangedVals.length === 3 && limitRangedVals[0].v === 3)
        // Entries
        const limitNorangeEntries = await tr.tables.auto.getEntries({ limit: 3 })
        t.assert(limitNorangeEntries.length === 3 && limitNorangeEntries[0].key.v === 1)
        const limitRangedEntries = await tr.tables.auto.getEntries({ limit: 3, start: new iso.AutoKey(3) })
        t.assert(limitRangedEntries.length === 3 && limitRangedEntries[0].key.v === 3)
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
      const n = 2000
      const def = { tables: { abc: { key: iso.StringKey, value: iso.AnyValue }, auto: { key: iso.AutoKey, value: iso.AnyValue } } }
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
        await db.transactReadonly(async tr => {
          const abcTable = tr.tables.abc
          for (let i = 0; i < n; i++) {
            const v = await abcTable.get(new iso.StringKey('key' + i))
            t.compare(v && v.v, { test: 'someVal' + i })
          }
        })
      })
      await t.measureTimeAsync(`${iso.name}: Time to iterate ${n} elements`, async () => {
        const db = await iso.openDB(getDbName(tc.testName), def)
        await db.transactReadonly(async tr => {
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
        await db.transactReadonly(async tr => {
          const entries = await tr.tables.abc.getEntries({})
          t.assert(entries.length === n)
        })
      })
      await t.measureTimeAsync(`${iso.name}: Time to get ${n} keys`, async () => {
        const db = await iso.openDB(getDbName(tc.testName), def)
        await db.transactReadonly(async tr => {
          const keys = await tr.tables.abc.getKeys({})
          t.assert(keys.length === n)
        })
      })
      await t.measureTimeAsync(`${iso.name}: Time to get ${n} values`, async () => {
        const db = await iso.openDB(getDbName(tc.testName), def)
        await db.transactReadonly(async tr => {
          const values = await tr.tables.abc.getValues({})
          t.assert(values.length === n)
        })
      })
      await t.measureTimeAsync(`${iso.name}: Time to delete range of ${n} values - without range`, async () => {
        const db = await iso.openDB(getDbName(tc.testName), def)
        await db.transact(async tr => {
          await tr.tables.abc.removeRange({})
          const values = await tr.tables.auto.getValues({})
          t.assert(values.length === 0)
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
        await db.transactReadonly(async tr => {
          const autoTable = tr.tables.auto
          for (let i = 0; i < keys.length; i++) {
            const v = await autoTable.get(keys[i])
            t.compare(v && v.v, { test: 'someVal' + i })
          }
        })
      })
      await t.measureTimeAsync(`${iso.name}: Time to iterate ${n} elements (autokey))`, async () => {
        const db = await iso.openDB(getDbName(tc.testName), def)
        await db.transactReadonly(async tr => {
          const autoTable = tr.tables.auto
          let retrieved = 0
          await autoTable.iterate({}, cursor => {
            t.compare(cursor.value.v, { test: 'someVal' + (cursor.key.v - 1) })
            retrieved++
          })
          t.assert(retrieved === n)
        })
      })
      await t.measureTimeAsync(`${iso.name}: Time to get ${n} entries (autokey))`, async () => {
        const db = await iso.openDB(getDbName(tc.testName), def)
        await db.transactReadonly(async tr => {
          const entries = await tr.tables.auto.getEntries({})
          t.assert(entries.length === n)
        })
      })
      await t.measureTimeAsync(`${iso.name}: Time to get ${n} keys (autokey))`, async () => {
        const db = await iso.openDB(getDbName(tc.testName), def)
        await db.transactReadonly(async tr => {
          const keys = await tr.tables.auto.getKeys({})
          t.assert(keys.length === n)
        })
      })
      await t.measureTimeAsync(`${iso.name}: Time to get ${n} values (autokey))`, async () => {
        const db = await iso.openDB(getDbName(tc.testName), def)
        await db.transactReadonly(async tr => {
          const values = await tr.tables.auto.getValues({})
          t.assert(values.length === n)
        })
      })
      await t.measureTimeAsync(`${iso.name}: Time to delete range of ${n} values (autokey))`, async () => {
        const db = await iso.openDB(getDbName(tc.testName), def)
        await db.transact(async tr => {
          await tr.tables.auto.removeRange({ start: 0, end: n })
          const values = await tr.tables.auto.getValues({})
          t.assert(values.length === 0)
        })
      })
    })
  }
}

/**
 * @param {t.TestCase} tc
 */
export const testIndexing = async tc => {
  const n = 9
  for (const iso of isoImpls) {
    await iso.deleteDB(getDbName(tc.testName))
    const db = await iso.openDB(getDbName(tc.testName), {
      tables: {
        auto: {
          key: iso.AutoKey,
          value: iso.AnyValue,
          indexes: {
            stringified: {
              key: iso.StringKey,
              mapper: (k, _v) => new iso.StringKey(k.v + '')
            },
            partially: {
              key: iso.AutoKey,
              mapper: (k, _v) => k.v === 1 ? k.v : null
            }
          }
        },
        named: {
          key: iso.StringKey,
          value: iso.StringValue,
          indexes: {
            reversed: {
              key: iso.StringKey,
              mapper: (k, _v) => new iso.StringKey(k.v.split('').reverse().join(''))
            }
          }
        }
      }
    })
    await t.measureTimeAsync(`${iso.name}: 'Init ${n} elements`, async () => {
      await db.transact(async tr => {
        const autoTable = tr.tables.auto
        for (let i = 0; i < n; i++) {
          const testValue = new iso.AnyValue({ test: 'someVal' + i })
          autoTable.add(testValue)
        }
      })
    })
    await t.measureTimeAsync(`${iso.name}: 'check filtered index`, async () => {
      await db.transact(async tr => {
        const autoTable = tr.tables.auto
        const keys = await autoTable.indexes.partially.getKeys({})
        t.assert(keys.length === 1 && keys[0].v === 1)
      })
    })
    await t.groupAsync(`${iso.name}: Using stringified index`, async () => {
      await db.transactReadonly(async tr => {
        await t.groupAsync('getKeys', async () => {
          const keys = await tr.tables.auto.indexes.stringified.getKeys({})
          t.assert(keys.length === n && keys.every((key, index) => key.v === ('' + (index + 1))))
        })
        await t.groupAsync('getValues', async () => {
          const values = await tr.tables.auto.indexes.stringified.getValues({})
          t.assert(values.length === n)
          values.forEach((value, index) => {
            t.compare(value.v, { test: 'someVal' + index })
          })
        })
        await t.groupAsync('getEntries', async () => {
          const entries = await tr.tables.auto.indexes.stringified.getEntries({})
          t.assert(entries.length === n)
          entries.forEach((entry, index) => {
            t.compare(entry.value.v, { test: 'someVal' + index })
            t.compare(entry.fkey.v, index + 1)
          })
        })
        await t.groupAsync('iterate', async () => {
          let index = 0
          await tr.tables.auto.indexes.stringified.iterate({ limit: 5 }, async cursor => {
            t.compare(cursor.value.v, { test: 'someVal' + index })
            t.compare(cursor.fkey.v, index + 1)
            index++
          })
          t.assert(index === 5)
        })
      })
      await db.transact(async tr => {
        await t.groupAsync('remove entry', async () => {
          let index = 1
          const dkey = new iso.AutoKey(1)
          tr.tables.auto.remove(dkey)
          t.assert((await tr.tables.auto.get(dkey)) === null)
          await tr.tables.auto.indexes.stringified.iterate({ limit: 5 }, async cursor => {
            t.compare(cursor.value.v, { test: 'someVal' + index })
            t.compare(cursor.fkey.v, index + 1)
            index++
          })
          t.assert(index === 6)
        })
        await t.groupAsync('remove entry from index', async () => {
          await tr.tables.auto.indexes.stringified.remove(new iso.StringKey('2'))
          t.assert((await tr.tables.auto.get(new iso.AutoKey(2))) === null)
          t.assert((await tr.tables.auto.indexes.stringified.get(new iso.StringKey('2'))) === null)
        })
        await t.groupAsync('remove entry range', async () => {
          let index = 4
          await tr.tables.auto.removeRange({ end: index })
          t.assert((await tr.tables.auto.get(new iso.AutoKey(index - 1))) === null)
          await tr.tables.auto.indexes.stringified.iterate({}, async cursor => {
            t.compare(cursor.value.v, { test: 'someVal' + index })
            t.compare(cursor.fkey.v, index + 1)
            index++
          })
          t.assert(index === n)
        })
        await t.groupAsync('remove entry range from index', async () => {
          let index = 5
          await tr.tables.auto.indexes.stringified.removeRange({ end: index + '' })
          t.assert((await tr.tables.auto.get(new iso.AutoKey(index - 1))) === null)
          t.assert((await tr.tables.auto.indexes.stringified.get(new iso.StringKey('' + (index - 1)))) === null)
          await tr.tables.auto.indexes.stringified.iterate({}, async cursor => {
            t.compare(cursor.value.v, { test: 'someVal' + index })
            t.compare(cursor.fkey.v, index + 1)
            index++
          })
          t.assert(index === n)
        })
        await t.groupAsync('remove all entries', async () => {
          let index = -1
          await tr.tables.auto.removeRange({})
          t.assert((await tr.tables.auto.get(new iso.AutoKey(6))) === null)
          await tr.tables.auto.indexes.stringified.iterate({}, async _cursor => {
            index++
          })
          t.assert(index === -1)
        })
      })
    })
    await t.groupAsync(`${iso.name}: named indexing`, async () => {
      await db.transact(async tr => {
        tr.tables.named.set(new iso.StringKey('key'), new iso.StringValue('val1'))
        tr.tables.named.set(new iso.StringKey('key'), new iso.StringValue('val2'))
        tr.tables.named.set(new iso.StringKey('key'), new iso.StringValue('val3'))
        t.assert(/** @type {import('../src/common.js').StringValue} */ (await tr.tables.named.indexes.reversed.get(new iso.StringKey('yek'))).v === 'val3')
        t.assert((await tr.tables.named.indexes.reversed.get(new iso.StringKey('key'))) === null)
        tr.tables.named.remove(new iso.StringKey('key'))
        t.assert((await tr.tables.named.indexes.reversed.get(new iso.StringKey('yek'))) === null)
      })
    })
  }
}

/**
 * @param {t.TestCase} tc
 */
export const testCrypto = async tc => {
  for (const iso of isoImpls) {
    await t.groupAsync(iso.name, async () => {
      await iso.deleteDB(getDbName(tc.testName))
      const db = await iso.openDB(getDbName(tc.testName), {
        tables: {
          ecdsa: {
            key: iso.AutoKey,
            value: iso.CryptoKeyValue
          }
        },
        objects: {
          ecdsa: {
            key: iso.CryptoKeyValue
          }
        }
      })
      const keyPair1 = await ecdsa.generateKeyPair({ extractable: false })
      const key3 = await aes.deriveKey('secret', 'salt', { extractable: false })
      const keyPair2 = await rsa.generateKeyPair({ extractable: false })
      t.assert(keyPair1.privateKey.extractable === false)
      t.assert(keyPair2.privateKey.extractable === false)
      t.assert(key3.extractable === false)
      await db.transact(async tr => {
        const k1 = await tr.tables.ecdsa.add(new iso.CryptoKeyValue(keyPair1.privateKey))
        const retrievedKey1 = await tr.tables.ecdsa.get(k1)
        t.assert(retrievedKey1)
        const k2 = await tr.tables.ecdsa.add(new iso.CryptoKeyValue(keyPair2.privateKey))
        const retrievedKey2 = await tr.tables.ecdsa.get(k2)
        t.assert(retrievedKey2)
        const k3 = await tr.tables.ecdsa.add(new iso.CryptoKeyValue(key3))
        const retrievedKey3 = await tr.tables.ecdsa.get(k3)
        t.assert(retrievedKey3)
        tr.objects.ecdsa.set('key', new iso.CryptoKeyValue(key3))
        const k4 = await tr.objects.ecdsa.get('key')
        t.assert(k4)
        tr.objects.ecdsa.remove('key')
        const k5 = await tr.objects.ecdsa.get('key')
        t.assert(k5 == null)
      })
      await t.failsAsync(async () => {
        await ecdsa.exportKeyJwk(keyPair1.privateKey)
      })
    })
  }
}

/**
 * @typedef {import('../src/common.js').IEncodable} IEncodable
 */

/**
 * @param {t.TestCase} tc
 */
export const testCustomKeyValue = async tc => {
  for (const iso of isoImpls) {
    await t.groupAsync(iso.name, async () => {
      await iso.deleteDB(getDbName(tc.testName))
      const db = await iso.openDB(getDbName(tc.testName), {
        tables: {
          custom: {
            key: CustomKeyValue,
            value: CustomKeyValue
          }
        }
      })
      await db.transact(async tr => {
        t.assert((await tr.tables.custom.get(new CustomKeyValue('key'))) === null)
        tr.tables.custom.set(new CustomKeyValue('key'), new CustomKeyValue('value'))
        t.assert(/** @type {CustomKeyValue} */ (await tr.tables.custom.get('key')).v === 'value')
        tr.tables.custom.set('key2', 'value2')
        t.assert(/** @type {CustomKeyValue} */ (await tr.tables.custom.get(new CustomKeyValue('key2'))).v === 'value2')
      })
    })
  }
}

/**
 * @param {t.TestCase} tc
 */
export const testObjectStorage = async tc => {
  for (const iso of isoImpls) {
    await iso.deleteDB(getDbName(tc.testName))
    const db = await iso.openDB(getDbName(tc.testName), {
      objects: {
        obj1: {
          val1: iso.StringValue
        }
      }
    })
    await db.transact(async tr => {
      const res1 = await tr.objects.obj1.get('val1')
      t.assert(res1 === null)
      tr.objects.obj1.set('val1', new iso.StringValue('test1'))
      const res2 = await tr.objects.obj1.get('val1')
      t.assert(res2 && res2.v === 'test1')
      tr.objects.obj1.set('val1', 'test2')
      const res3 = await tr.objects.obj1.get('val1')
      t.assert(res3 && res3.v === 'test2')
      tr.objects.obj1.remove('val1')
      const res4 = await tr.objects.obj1.get('val1')
      t.assert(res4 === null)
      // @ts-ignore
      await t.failsAsync(() => tr.objects.obj1.set('key3', new iso.StringValue('test')))
      // @ts-ignore
      await t.failsAsync(() => tr.objects.obj1.set('key1', new iso.StringValue('test')))
    })
  }
}

/**
 * @param {t.TestCase} tc
 */
export const testConcurrentTransactionBehavior = async tc => {
  for (const iso of isoImpls) {
    await t.groupAsync(iso.name, async () => {
      await iso.deleteDB(getDbName(tc.testName))
      const db = await iso.openDB(getDbName(tc.testName), {
        objects: {
          obj1: {
            val1: iso.StringValue
          }
        }
      })
      /**
       * @type {Array<number>}
       */
      const events = []
      db.transact(async tr => {
        events.push(1)
        tr.objects.obj1.set('val1', '1')
        events.push(2)
      })
      db.transact(async tr => {
        events.push(3)
        tr.objects.obj1.set('val1', '2')
        events.push(4)
      })
      await db.transact(async tr => {
        events.push(5)
        tr.objects.obj1.set('val1', '1')
        db.transact(async tr => {
          events.push(7)
          const v = await tr.objects.obj1.get('val1')
          t.assert(v?.v === '3')
          events.push(8)
        })
        tr.objects.obj1.set('val1', '3')
        events.push(6)
      })
      await db.transact(async tr => {
        events.push(9)
        const v = await tr.objects.obj1.get('val1')
        t.assert(v?.v === '3')
        events.push(10)
      })
      t.compare(events, [1, 2, 3, 4, 5, 6, 7, 8, 9, 10])
    })
  }
}

/**
 * @param {t.TestCase} tc
 */
export const testConsecutiveTransactionBehavior = async tc => {
  for (const iso of isoImpls) {
    await iso.deleteDB(getDbName(tc.testName))
    const db = await iso.openDB(getDbName(tc.testName), {
      objects: {
        obj1: {
          val1: iso.StringValue
        }
      }
    })
    /**
     * @type {Array<number>}
     */
    const events = []
    await db.transact(async tr => {
      events.push(1)
      tr.objects.obj1.set('val1', '1')
      events.push(2)
    })
    await db.transact(async tr => {
      events.push(3)
      tr.objects.obj1.set('val1', '2')
      events.push(4)
    })
    await db.transact(async tr => {
      events.push(5)
      const v = await tr.objects.obj1.get('val1')
      t.assert(v?.v === '2')
      events.push(6)
    })
    t.compare(events, [1, 2, 3, 4, 5, 6])
  }
}

class CustomStringKey extends StringKey { }
class CustomBinaryKey extends BinaryKey { }

/**
 * @param {t.TestCase} tc
 */
export const testPrefix = async tc => {
  for (const iso of isoImpls) {
    await t.groupAsync(iso.name, async () => {
      await iso.deleteDB(getDbName(tc.testName))
      const def = {
        tables: {
          strings: { key: iso.StringKey, value: iso.NoValue },
          cstrings: { key: CustomStringKey, value: iso.NoValue }, // testing the polyfill
          bin: { key: iso.BinaryKey, value: iso.NoValue },
          cbin: { key: CustomBinaryKey, value: iso.NoValue } // testing the polyfill
        }
      }
      const db = await iso.openDB(getDbName(tc.testName), def)
      await t.groupAsync('tables.strings', () => db.transact(async tr => {
        const table = tr.tables.strings
        const ordered = [
          '',
          'a',
          'a\0',
          'aa',
          'ab',
          'aba',
          'ac',
          'aca'
        ]
        for (let i = ordered.length - 1; i >= 0; i--) {
          table.set(ordered[i], null)
        }
        const keys1_ = await table.getKeys()
        const keys1 = keys1_.map(k => k.v)
        t.compare(ordered, keys1)
        const keys2 = await table.getKeys({ prefix: '' }).then(ks => ks.map(k => k.v))
        t.compare(ordered, keys2)
        const keys3 = await table.getKeys({ prefix: 'a' }).then(ks => ks.map(k => k.v))
        t.compare(keys3, ordered.slice(1))
        const keys4 = await table.getKeys({ prefix: 'ab' }).then(ks => ks.map(k => k.v))
        t.compare(keys4, ordered.slice(4, -2))
      }))
      await t.groupAsync('tables.cstrings', () => db.transact(async tr => {
        // same as above
        const table = tr.tables.cstrings
        const ordered = [
          '',
          'a',
          'a\0',
          'aa',
          'ab',
          'aba',
          'ac',
          'aca'
        ]
        for (let i = ordered.length - 1; i >= 0; i--) {
          table.set(ordered[i], null)
        }
        const keys1_ = await table.getKeys()
        const keys1 = keys1_.map(k => k.v)
        t.compare(ordered, keys1)
        const keys2 = await table.getKeys({ prefix: '' }).then(ks => ks.map(k => k.v))
        t.compare(ordered, keys2)
        const keys3 = await table.getKeys({ prefix: 'a' }).then(ks => ks.map(k => k.v))
        t.compare(keys3, ordered.slice(1))
        const keys4 = await table.getKeys({ prefix: 'ab' }).then(ks => ks.map(k => k.v))
        t.compare(keys4, ordered.slice(4, -2))
      }))
      await t.groupAsync('tables.bin', () => db.transact(async tr => {
        // same as above
        const table = tr.tables.bin
        const ordered = [
          new Uint8Array([0]),
          new Uint8Array([0, 1]),
          new Uint8Array([1]),
          new Uint8Array([1, 0, 0]),
          new Uint8Array([1, 0, 1]),
          new Uint8Array([2])
        ]
        for (let i = ordered.length - 1; i >= 0; i--) {
          table.set(ordered[i], null)
        }
        const keys1_ = await table.getKeys()
        const keys1 = keys1_.map(k => new Uint8Array(k.v))
        t.compare(ordered, keys1)
        const keys2 = await table.getKeys({ prefix: new Uint8Array([]) }).then(ks => ks.map(k => new Uint8Array(k.v)))
        t.compare(ordered, keys2)
        const keys3 = await table.getKeys({ prefix: new Uint8Array([1]) }).then(ks => ks.map(k => new Uint8Array(k.v)))
        t.compare(keys3, ordered.slice(2, -1))
        const keys4 = await table.getKeys({ prefix: new Uint8Array([1, 0]) }).then(ks => ks.map(k => new Uint8Array(k.v)))
        t.compare(keys4, ordered.slice(3, -1))
      }))
      await t.groupAsync('tables.cbin', () => db.transact(async tr => {
        // same as above
        const table = tr.tables.cbin
        const ordered = [
          new Uint8Array([0]),
          new Uint8Array([0, 1]),
          new Uint8Array([1]),
          new Uint8Array([1, 0, 0]),
          new Uint8Array([1, 0, 1]),
          new Uint8Array([2])
        ]
        for (let i = ordered.length - 1; i >= 0; i--) {
          table.set(ordered[i], null)
        }
        const keys1_ = await table.getKeys()
        const keys1 = keys1_.map(k => k.v)
        t.compare(ordered, keys1)
        const keys2 = await table.getKeys({ prefix: new Uint8Array([]) }).then(ks => ks.map(k => k.v))
        t.compare(ordered, keys2)
        const keys3 = await table.getKeys({ prefix: new Uint8Array([1]) }).then(ks => ks.map(k => k.v))
        t.compare(keys3, ordered.slice(2, -1))
        const keys4 = await table.getKeys({ prefix: new Uint8Array([1, 0]) }).then(ks => ks.map(k => k.v))
        t.compare(keys4, ordered.slice(3, -1))
      }))
    })
  }
}

/**
 * @param {t.TestCase} tc
 */
export const testDataTypes = async tc => {
  for (const iso of isoImpls) {
    await t.groupAsync(iso.name, async () => {
      await iso.deleteDB(getDbName(tc.testName))
      const def = {
        tables: {
          jwt: { key: iso.AutoKey, value: /** @type {typeof iso.JwtValue<{ iat: number, rss: string }>} */ (iso.JwtValue) }
        }
      }
      const db = await iso.openDB(getDbName(tc.testName), def)
      await t.groupAsync('tables.strings', () => db.transact(async tr => {
        const table = tr.tables.jwt
        const key = await table.add(new iso.JwtValue('not working'))
        const jwtVal = await table.get(key)
        const keypair = await ecdsa.generateKeyPair()
        await t.failsAsync(async () => {
          await jwtVal?.verify(keypair.publicKey)
        })
        t.fails(() => {
          jwtVal?.unsafeDecode()
        })
      }))
    })
  }
}

/**
 * @param {t.TestCase} tc
 */
export const testPerf = async tc => {
  for (const iso of isoImpls) {
    await t.groupAsync(iso.name, async () => {
      await iso.deleteDB(getDbName(tc.testName))
      const db = await iso.openDB(getDbName(tc.testName), {
        tables: {
          vals: { key: iso.AutoKey, value: iso.StringValue }
        }
      })
      const N = 100_000
      await t.measureTimeAsync(`add ${N} keys`, async () => {
        await db.transact(async tr => {
          const table = tr.tables.vals
          for (let i = 0; i < N; i++) {
            await table.add(new iso.StringValue(i + ''))
          }
        })
      })
      await t.measureTimeAsync(`read ${N} values`, async () => {
        await db.transact(async tr => {
          const table = tr.tables.vals
          for (let i = 1; i < N + 1; i++) {
            const v = await table.get(i)
            t.assert(v?.v === (i - 1) + '')
          }
        })
      })
    })
  }
}
