import assert from 'node:assert/strict'
import test from 'node:test'
import { apply } from '../src/index.js'

test('host entry does not register routes or access mutation services', () => {
  apply(new Proxy({}, { get() { throw new Error('Host access is forbidden') } }))
  assert.ok(true)
})
