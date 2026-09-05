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

test('workspace pin state is separate from session pins and keeps insertion order', async () => {
  let definition
  globalThis.localStorage = new MemoryStorage()
  globalThis.window = {
    __ModuleLoader__: {
      load(value) {
        definition = value
      },
    },
    dispatchEvent() {
      return true
    },
  }

  await import(`../lib/client.js?workspace-test=${Date.now()}`)
  const exports = definition.factory(() => {
    throw new Error('the bridge bundle should not import runtime modules')
  })
  exports.apply({})

  const bridge = window.__dshSessionContextMenu
  assert.equal(bridge.toggleWorkspacePin('workspace-b'), true)
  assert.equal(bridge.isWorkspacePinned('workspace-b'), true)
  assert.deepEqual(
    bridge.sortPinnedWorkspaces(['workspace-a', 'workspace-b', 'workspace-c']),
    ['workspace-b', 'workspace-a', 'workspace-c'],
  )
  assert.equal(bridge.toggleWorkspacePin('workspace-b'), false)
  assert.equal(bridge.isWorkspacePinned('workspace-b'), false)
  assert.deepEqual(
    bridge.sortPinnedWorkspaces(['workspace-a', 'workspace-b', 'workspace-c']),
    ['workspace-a', 'workspace-b', 'workspace-c'],
  )
  assert.deepEqual(bridge.listPinned(), [])
})


test('workspace actions call the DSH workspace service with stable IDs', async () => {
  let definition
  const calls = []
  globalThis.localStorage = new MemoryStorage()
  globalThis.window = {
    __ModuleLoader__: {
      load(value) {
        definition = value
      },
    },
    dispatchEvent() {
      return true
    },
  }

  await import(`../lib/client.js?actions-test=${Date.now()}`)
  const workspace = {
    workspaceId: 'workspace-1',
    title: 'Project',
    path: 'D:/repo',
    sessionIds: ['session-1', 'session-2'],
  }
  const ctx = {
    workspaces: {
      list: {
        getSnapshot: () => ({ items: [workspace], archivedSessionIds: ['session-2'] }),
      },
      insertBefore: async (...args) => calls.push(['insertBefore', ...args]),
      insertSessionBefore: async (...args) => calls.push(['insertSessionBefore', ...args]),
    },
    uiWorkspace: {
      archiveSession: async (...args) => calls.push(['archiveSession', ...args]),
    },
    sessions: {
      list: {
        getSnapshot: () => ({ items: [], byId: {} }),
      },
    },
  }
  const exports = definition.factory(() => {
    throw new Error('the bundle must not import legacy browser packages')
  })
  exports.apply(ctx)

  const bridge = window.__dshSessionContextMenu
  assert.equal(await bridge.pinWorkspace('workspace-1'), true)
  assert.equal(await bridge.pinSession('workspace-1', 'session-2'), true)
  assert.deepEqual(await bridge.archiveWorkspace('workspace-1'), { archived: 1 })
  assert.deepEqual(calls, [
    ['insertSessionBefore', 'workspace-1', 'session-2', 'session-1'],
    ['archiveSession', 'session-1'],
  ])
})
