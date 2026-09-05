import assert from 'node:assert/strict'
import test from 'node:test'
import { parseHTML } from 'linkedom'
import { createBridge, uniqueByTitle, resolveRow, nativeMenuButton, maintenanceDashboard,
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
    sessions: { list: { getSnapshot: () => ({ byId }), subscribe } },
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
  const bridge = createBridge(ctx)
  const lifetime = { busy: false, disposed: false }
  const open = (target = row) => {
    assert.equal(showEnhancementMenu(ctx, bridge, target, { clientX: 100, clientY: 100 }, () => {}, lifetime), true)
    return [...document.querySelector('.dsh-context-menu').querySelectorAll('button')]
  }
  return { ctx, calls, snapshot, workspace, byId, bridge, row, projectRow: rows[0], open, document, window, listeners }
}

test.afterEach(() => { delete globalThis.document })
const tick = () => new Promise(resolve => setImmediate(resolve))

test('right-click enhancement delegates to the exact official row button', async () => {
  const f = fixture()
  nativeMenuButton(f.row).addEventListener('click', () => f.calls.push(['official']))
  const items = f.open()
  assert.deepEqual(items.map(item => item.textContent),
    ['官方会话操作…', '置顶', '在 Maintenance 中管理／删除…'])
  items[0].click()
  await tick()
  assert.deepEqual(f.calls, [['official']])
  assert.equal(document.querySelector('.dsh-context-menu'), null)
  assert.equal(f.bridge.renameWorkspace, undefined)
  assert.equal(f.bridge.removeWorkspace, undefined)
  assert.equal(f.bridge.createWorktree, undefined)
})

test('same-title sessions do not acquire guessed IDs; official menu stays available', () => {
  const f = fixture({ duplicate: true })
  f.row.dataset.dshSessionId = 'stale-id'
  assert.equal(resolveRow(f.ctx, f.row).session, undefined)
  const items = f.open()
  assert.equal(items[0].disabled, false)
  assert.equal(items[1].disabled, true)
  assert.equal(items[2].disabled, true)
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

test('Ungrouped new-session button and unknown DOM are never clicked as a menu', () => {
  const f = fixture()
  nativeMenuButton(f.projectRow).remove()
  assert.equal(nativeMenuButton(f.projectRow), undefined)
  assert.equal(showEnhancementMenu(f.ctx, f.bridge, f.projectRow, {}, () => {}, {}), false)
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

test('Maintenance handoff only requests dashboard for native session ID, never deletion', async () => {
  let request
  const url = await maintenanceDashboard('native-session-1', async (endpoint, options) => {
    request = { endpoint, ...options }
    return { ok: true, json: async () => ({ ok: true, url: 'http://127.0.0.1:1799/?launch=test' }) }
  })
  assert.equal(url, 'http://127.0.0.1:1799/?launch=test')
  assert.deepEqual(JSON.parse(request.body), { operation: 'dashboard', sessionId: 'native-session-1' })
  assert.equal(request.endpoint, '/dsh-session-maintenance/api')
  assert.equal(request.headers.authorization, undefined)
  await assert.rejects(maintenanceDashboard('s1', async () => ({ ok: false, status: 404 })), /未执行删除/)
  await assert.rejects(maintenanceDashboard('s1', async () => ({
    ok: true, json: async () => ({ ok: true, url: 'javascript:alert(1)' }),
  })), /不支持/)
})

test('Maintenance page is reserved in user gesture and receives returned link', async () => {
  const f = fixture()
  const events = []
  const page = { opener: {}, location: { replace: url => events.push(['navigate', url]) }, close: () => events.push(['close']) }
  f.window.open = (...args) => { events.push(['open', ...args]); return page }
  const previousFetch = globalThis.fetch
  globalThis.fetch = async () => {
    events.push(['fetch'])
    return { ok: true, json: async () => ({ ok: true, url: 'http://127.0.0.1:1799/?launch=test' }) }
  }
  try {
    f.open()[2].click()
    await tick()
    assert.deepEqual(events.map(item => item[0]), ['open', 'fetch', 'navigate'])
    assert.equal(page.opener, null)
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
  f.open(f.projectRow)[2].click()
  await tick()
  assert.equal(confirms, 1)
  assert.deepEqual(f.calls, [])
})

test('recycled row cannot pin a different session after menu creation', async t => {
  t.mock.timers.enable({ apis: ['setTimeout'] })
  const f = fixture()
  const items = f.open()
  f.row.querySelector('.rc1_title').textContent = 'Second'
  items[1].click()
  await tick()
  assert.deepEqual(f.calls, [])
  assert.deepEqual(f.bridge.listPinned(), [])
  assert.match(document.querySelector('.dsh-context-toast').textContent, /已变更/)
})

test('unavailable Maintenance closes reserved page and performs no delete', async t => {
  t.mock.timers.enable({ apis: ['setTimeout'] })
  const f = fixture()
  const events = []
  f.window.open = () => ({
    opener: {},
    location: { replace: () => events.push('navigate') },
    close: () => events.push('close'),
  })
  const previousFetch = globalThis.fetch
  globalThis.fetch = async (_endpoint, request) => {
    events.push(JSON.parse(request.body).operation)
    return { ok: false, status: 503 }
  }
  try {
    f.open()[2].click()
    await tick()
    assert.deepEqual(events, ['dashboard', 'close'])
    assert.match(document.querySelector('.dsh-context-toast').textContent, /未执行删除/)
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
  assert.equal(document.querySelectorAll('.dsh-context-menu').length, 1)
  assert.equal(document.querySelectorAll('.dsh-context-pin-marker').length, 1)
  second()
})
