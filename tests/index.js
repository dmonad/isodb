import { runTests } from 'lib0/testing.js'
import { isBrowser, isNode } from 'lib0/environment.js'
import * as log from 'lib0/logging'
import * as db from './db.tests.js'
import 'fake-indexeddb/auto'

/* istanbul ignore if */
if (isBrowser) {
  log.createVConsole(document.body)
}

runTests({
  db
}).then(success => {
  /* istanbul ignore next */
  if (isNode) {
    process.exit(success ? 0 : 1)
  }
})
