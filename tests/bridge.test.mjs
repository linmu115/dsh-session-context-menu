import assert from 'node:assert/strict'
import test from 'node:test'

class MemoryStorage {
  #values = new Map()

  getItem(key) {
    return this.#values.has(key) ? this.#values.get(key) : null
  }

  setItem(key, value) {
    this.#values.set(key, String(value))
  }
}

test('pin state is ID-based, persistent, and reversible without disturbing normal order', async () => {
  let definition
  const events = []
  globalThis.localStorage = new MemoryStorage()
  globalThis.window = {
    __ModuleLoader__: {
      load(value) {
        definition = value
      },
    },
    dispatchEvent(event) {
      events.push(event.type)
      return true
    },
  }

  await import(`../lib/client.js?test=${Date.now()}`)
  const exports = definition.factory(() => {
    throw new Error('the bridge bundle should not import runtime modules')
  })
  exports.apply({})

  const bridge = window.__dshSessionContextMenu
  assert.deepEqual(bridge.sortPinned(['a', 'b', 'c']), ['a', 'b', 'c'])
  assert.equal(bridge.togglePin('b'), true)
  assert.equal(bridge.isPinned('b'), true)
  assert.deepEqual(bridge.sortPinned(['a', 'b', 'c']), ['b', 'a', 'c'])
  assert.equal(bridge.togglePin('b'), false)
  assert.equal(bridge.isPinned('b'), false)
  assert.deepEqual(bridge.sortPinned(['a', 'b', 'c']), ['a', 'b', 'c'])
  assert.ok(events.includes('dsh-session-context-menu:change'))
})
