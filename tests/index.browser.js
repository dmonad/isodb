import { runTests } from 'lib0/testing.js'
import { isBrowser, isNode } from 'lib0/environment.js'
import * as log from 'lib0/logging'
import * as db from './db.tests.js'
import * as isoIdb from '../src/browser.js'

db.addIsoImpls(isoIdb)

/* c8 ignore if 3 */
if (isBrowser) {
  log.createVConsole(document.body)
}

runTests(/** @type {any} */ ({
  db
})).then(success => {
  /* c8 ignore next 3 */
  if (isNode) {
    process.exit(success ? 0 : 1)
  }
})
