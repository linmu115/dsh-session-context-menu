import assert from 'node:assert/strict'
import test from 'node:test'
import { parseHTML } from 'linkedom'
import { createBridge, uniqueByTitle, resolveRow, nativeMenuButton, deleteMaintenanceSession,
  showEnhancementMenu, installDomIntegration } from '../src/client.js'

function fixture({ duplicate = false } = {}) {
  const { window, document } = parseHTML('<html><head></head><body></body></html>')
  Object.assign(globalThis, { window, document, Element: window.Element, Node: window.Node,
    MutationObserver: window.MutationObserver, CustomEvent: window.CustomEvent })
  const values = new Map()
  globalThis.localStorage = { getItem: key => values.get(key) ?? null, setItem: (key, value) => values.set(key, value) }
  window.innerWidth = 1200
  window.innerHeight = 800
  const workspace = { workspaceId: 'w1', title: 'Project', path: 'D:/project', sessionIds: ['s1', 's2'] }
  const byId = {
    s1: { id: 's1', title: 'First' },
    s2: { id: 's2', title: duplicate ? 'First' : 'Second' },
  }
  const calls = []
  const listeners = new Set()
  const subscribe = fn => { listeners.add(fn); return () => listeners.delete(fn) }
  const snapshot = { items: [workspace], archivedSessionIds: [] }
  const ctx = {
    workspaces: {
      list: { getSnapshot: () => snapshot, subscribe },
      insertBefore: async (...args) => calls.push(['workspaceOrder', ...args]),
      insertSessionBefore: async (...args) => calls.push(['sessionOrder', ...args]),
    },
    sessions: { list: { getSnapshot: () => ({ byId, current }), subscribe } },
    uiWorkspace: { archiveSession: async id => { calls.push(['archive', id]); snapshot.archivedSessionIds.push(id) } },
  }
  document.body.innerHTML = `
    <section class="rc1_groupSection">
      <div role="treeitem" class="rc1_projectRow">
        <span class="rc1_title">Project</span><span class="rc1_rowActions">
          <button aria-label="Workspace actions for Project"></button>
          <button aria-label="New session in Project"></button>
        </span>
      </div>
      <div role="treeitem" class="rc1_sessionRow">
        <span class="rc1_title">First</span><span class="rc1_rowActions">
          <button aria-label="Session actions for First"></button>
        </span>
      </div>
    </section>`
  const rows = document.querySelectorAll('[role="treeitem"]')
  const row = rows[1]
  let current
  const select = id => { current = id; row.setAttribute('aria-selected', String(id === 's1')) }
  row.addEventListener('click', event => { if (event.target === row) select('s1') })
  const bridge = createBridge(ctx)
  const lifetime = { busy: false, disposed: false }
  const open = async (target = row) => {
    assert.equal(await showEnhancementMenu(ctx, bridge, target, { clientX: 100, clientY: 100 }, () => {}, lifetime), true)
    return [...document.querySelector('.dsh-context-menu').querySelectorAll('button')]
  }
  return { ctx, calls, snapshot, workspace, byId, bridge, row, projectRow: rows[0], open, document, window, listeners, select }
}

test.afterEach(() => { delete globalThis.document })
const tick = () => new Promise(resolve => setImmediate(resolve))

test('right-click enhancement delegates to the exact official row button', async () => {
  const f = fixture()
  nativeMenuButton(f.row).addEventListener('click', () => f.calls.push(['official']))
  const items = await f.open()
  assert.deepEqual(items.map(item => item.textContent),
    ['官方会话操作…', '置顶', '删除会话'])
  items[0].click()
  await tick()
  assert.deepEqual(f.calls, [['official']])
  assert.equal(document.querySelector('.dsh-context-menu'), null)
  assert.equal(f.bridge.renameWorkspace, undefined)
  assert.equal(f.bridge.removeWorkspace, undefined)
  assert.equal(f.bridge.createWorktree, undefined)
})

test('same-title sessions resolve through official selected ID, ignoring stale dataset IDs', async () => {
  const f = fixture({ duplicate: true })
  f.row.dataset.dshSessionId = 'stale-id'
  assert.equal(resolveRow(f.ctx, f.row).session, undefined)
  const items = await f.open()
  assert.equal(items[0].disabled, false)
  assert.equal(items[1].disabled, false)
  assert.equal(items[2].disabled, false)
  assert.equal(resolveRow(f.ctx, f.row).session.id, 's1')
  assert.equal(uniqueByTitle([{ title: 'X' }, { title: 'X' }], 'X', item => item.title), undefined)
})

test('workspace titles constrain resolution; missing titles never use positional fallback', () => {
  const f = fixture()
  f.byId.s3 = { id: 's3', title: 'First' }
  f.snapshot.items.push({ workspaceId: 'w2', title: 'Elsewhere', sessionIds: ['s3'] })
  assert.equal(resolveRow(f.ctx, f.row).session.id, 's1')
  f.row.querySelector('.rc1_title').textContent = 'Not a session'
  assert.equal(resolveRow(f.ctx, f.row).session, undefined)
})

test('Ungrouped new-session button and unknown DOM are never clicked as a menu', async () => {
  const f = fixture()
  nativeMenuButton(f.projectRow).remove()
  assert.equal(nativeMenuButton(f.projectRow), undefined)
  assert.equal(await showEnhancementMenu(f.ctx, f.bridge, f.projectRow, {}, () => {}, {}), false)
})

test('pinning uses official order APIs; failure leaves local marker unchanged', async () => {
  const f = fixture()
  await f.bridge.pinSession('w1', 's2')
  assert.deepEqual(f.calls, [['sessionOrder', 'w1', 's2', 's1']])
  assert.equal(f.bridge.isPinned('s2'), true)
  f.ctx.workspaces.insertSessionBefore = async () => { throw new Error('offline') }
  await assert.rejects(f.bridge.pinSession('w1', 's1'), /offline/)
  assert.equal(f.bridge.isPinned('s1'), false)
  await assert.rejects(f.bridge.pinSession('wrong', 's1'), /归属/)
})

test('batch archive calls official UI service and excludes archived or unconfirmed arrivals', async () => {
  const f = fixture()
  f.snapshot.archivedSessionIds.push('s2')
  f.workspace.sessionIds.push('s3')
  assert.deepEqual(await f.bridge.archiveWorkspace('w1', ['s1', 's2']), { archived: 1 })
  assert.deepEqual(f.calls, [['archive', 's1']])
})

test('batch archive reports partial progress and does not retry or continue on failure', async () => {
  const f = fixture()
  f.ctx.uiWorkspace.archiveSession = async id => {
    if (id === 's2') throw new Error('offline')
    f.calls.push(['archive', id])
  }
  await assert.rejects(f.bridge.archiveWorkspace('w1'), /已归档 1 个；后续失败：offline/)
  assert.deepEqual(f.calls, [['archive', 's1']])
})

test('Maintenance deletion forwards native ID, validates canonical receipt, then hides via official UI', async () => {
  const f = fixture()
  let request
  const message = await deleteMaintenanceSession(f.ctx, 'native-session-1', async (endpoint, options) => {
    request = { endpoint, ...options }
    assert.deepEqual(f.calls, [])
    return deletionResponse()
  })
  assert.match(message, /已从 Maintenance 删除/)
  assert.deepEqual(f.calls, [['archive', 'native-session-1']])
  assert.deepEqual(JSON.parse(request.body), { operation: 'delete-session', sessionId: 'native-session-1' })
  assert.equal(request.endpoint, '/dsh-session-maintenance/api')
  assert.equal(request.headers.authorization, undefined)
  await assert.rejects(deleteMaintenanceSession(f.ctx, 's1', async () => ({ ok: false, status: 404, json: async () => ({}) })), /未隐藏/)
  await assert.rejects(deleteMaintenanceSession(f.ctx, 's1', async () => ({
    ok: true, json: async () => ({ ok: true, logicalSessionId: 'wrong', deletion: { logicalSessionId: 'ls-1', state: 'deleted' } }),
  })), /回执/)
  assert.equal(f.calls.length, 1)
})

function deletionResponse(state = 'deleted') {
  return { ok: true, json: async () => ({ ok: true, logicalSessionId: 'ls-1',
    deletion: { logicalSessionId: 'ls-1', state, pendingOperations: state === 'deleted' ? 0 : 1 } }) }
}

test('delete menu never opens a window or confirmation and deletes exactly the selected session', async t => {
  t.mock.timers.enable({ apis: ['setTimeout'] })
  const f = fixture()
  const events = []
  f.window.open = f.window.confirm = () => { throw new Error('Popup must not be used') }
  const previousFetch = globalThis.fetch
  globalThis.fetch = async (_url, request) => {
    events.push(JSON.parse(request.body))
    return deletionResponse()
  }
  try {
    ;(await f.open())[2].click()
    await tick()
    assert.deepEqual(events, [{ operation: 'delete-session', sessionId: 's1' }])
    assert.deepEqual(f.calls, [['archive', 's1']])
  } finally { globalThis.fetch = previousFetch }
})

test('right-click attaches once, Shift passes through and disposal removes listeners/markers', async () => {
  const f = fixture()
  const cleanup = installDomIntegration(f.ctx, f.bridge)
  await tick()
  const shifted = new f.window.Event('contextmenu', { bubbles: true, cancelable: true })
  shifted.shiftKey = true
  f.row.dispatchEvent(shifted)
  assert.equal(shifted.defaultPrevented, false)
  const normal = new f.window.Event('contextmenu', { bubbles: true, cancelable: true })
  f.row.dispatchEvent(normal)
  await tick()
  assert.equal(normal.defaultPrevented, true)
  assert.equal(document.querySelectorAll('.dsh-context-menu').length, 1)
  cleanup()
  assert.equal(f.listeners.size, 0)
  const after = new f.window.Event('contextmenu', { bubbles: true, cancelable: true })
  f.row.dispatchEvent(after)
  assert.equal(after.defaultPrevented, false)
  assert.equal(document.querySelector('.dsh-context-menu'), null)
})

test('cancel batch archive performs no mutations', async () => {
  const f = fixture()
  let confirms = 0
  f.window.confirm = () => { confirms++; return false }
  ;(await f.open(f.projectRow))[2].click()
  await tick()
  assert.equal(confirms, 1)
  assert.deepEqual(f.calls, [])
})

test('recycled row cannot pin a different session after menu creation', async t => {
  t.mock.timers.enable({ apis: ['setTimeout'] })
  const f = fixture()
  const items = await f.open()
  f.row.querySelector('.rc1_title').textContent = 'Second'
  items[1].click()
  await tick()
  assert.deepEqual(f.calls, [])
  assert.deepEqual(f.bridge.listPinned(), [])
  assert.match(document.querySelector('.dsh-context-toast').textContent, /已变更/)
})

test('unavailable Maintenance leaves the native row visible and reports failure', async t => {
  t.mock.timers.enable({ apis: ['setTimeout'] })
  const f = fixture()
  const events = []
  f.window.open = () => { throw new Error('Popup must not be used') }
  const previousFetch = globalThis.fetch
  globalThis.fetch = async (_endpoint, request) => {
    events.push(JSON.parse(request.body).operation)
    return { ok: false, status: 503, json: async () => ({}) }
  }
  try {
    ;(await f.open())[2].click()
    await tick()
    assert.deepEqual(events, ['delete-session'])
    assert.deepEqual(f.calls, [])
    assert.match(document.querySelector('.dsh-context-toast').textContent, /未隐藏/)
  } finally { globalThis.fetch = previousFetch }
})

test('dispose cancels queued decoration and a fresh install has one menu', async () => {
  const f = fixture()
  f.bridge.togglePin('s1')
  const first = installDomIntegration(f.ctx, f.bridge)
  first()
  await tick()
  assert.equal(document.querySelector('.dsh-context-pin-marker'), null)
  const second = installDomIntegration(f.ctx, f.bridge)
  await tick()
  const event = new f.window.Event('contextmenu', { bubbles: true, cancelable: true })
  f.row.dispatchEvent(event)
  await tick()
  assert.equal(document.querySelectorAll('.dsh-context-menu').length, 1)
  assert.equal(document.querySelectorAll('.dsh-context-pin-marker').length, 1)
  second()
})

test('pending deletion and post-receipt UI failure are reported without claiming an unconfirmed delete', async () => {
  const f = fixture()
  assert.match(await deleteMaintenanceSession(f.ctx, 's1', async () => deletionResponse('pending-delete')), /等待现有写入收尾/)
  f.ctx.uiWorkspace.archiveSession = async () => { throw new Error('offline') }
  assert.match(await deleteMaintenanceSession(f.ctx, 's2', async () => deletionResponse()), /已从 Maintenance 删除.*当前列表未隐藏.*offline/)
})

test('switching to another same-title session invalidates an already opened destructive menu', async t => {
  t.mock.timers.enable({ apis: ['setTimeout'] })
  const f = fixture({ duplicate: true })
  const items = await f.open()
  f.select('s2')
  items[2].click()
  await tick()
  assert.deepEqual(f.calls, [])
  assert.match(document.querySelector('.dsh-context-toast').textContent, /已变更/)
})

test('missing official selection explains disabled enhancements instead of guessing by title', async () => {
  const f = fixture()
  f.ctx.sessions.list.getSnapshot = () => ({ byId: f.byId })
  const items = await f.open()
  assert.equal(items[0].disabled, false)
  assert.equal(items[1].disabled, true)
  assert.equal(items[2].disabled, true)
  assert.match(document.querySelector('[role="status"]').textContent, /官方会话 ID/)
})
