import assert from 'node:assert/strict'
import test from 'node:test'
import { parseHTML } from 'linkedom'
import { createBridge, uniqueByTitle, resolveRow, nativeMenuButton, deleteMaintenanceSession,
  showEnhancementMenu, installDomIntegration, apply } from '../src/client.js'

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

test('owner replacement keeps new registration when the old disposer runs', async () => {
  const f = fixture({ duplicate: true })
  const targets = []
  const old = f.bridge.registerActions('maintenance', [{ id: 'open', label: '旧动作', run: () => assert.fail('stale action') }])
  const remove = f.bridge.registerActions('maintenance', [{ id: 'open', label: '维护看板', run: target => targets.push(target) }])
  old()
  const buttons = await f.open()
  assert.equal(buttons.some(button => button.textContent === '旧动作'), false)
  buttons.find(button => button.textContent === '维护看板').click()
  await tick()
  assert.deepEqual(targets, [{ nativeSessionId: 's1', workspaceId: 'w1' }])
  assert.equal(Object.isFrozen(targets[0]), true)
  remove(); remove()
  assert.equal((await f.open()).length, 3)
})

test('registration validates atomically and stale open actions cannot execute', async () => {
  const f = fixture()
  f.bridge.registerActions('owner', [{ id: 'action', label: '动作', run: () => assert.fail('stale') }])
  assert.throws(() => f.bridge.registerActions('owner', [{ id: 'bad', label: 'bad' }]), /Invalid/)
  const buttons = await f.open()
  f.bridge.registerActions('owner', [])
  buttons.find(button => button.textContent === '动作').click()
  await tick()
  assert.match(document.querySelector('.dsh-context-toast').textContent, /已更新/)
  assert.deepEqual(f.calls, [])
})

test('action state failure is local, hidden actions stay hidden, and state is checked again at click', async () => {
  const f = fixture()
  let enabled = true
  f.bridge.registerActions('owner', [
    { id: 'bad', label: '坏状态', getState: () => { throw new Error('离线') }, run: () => assert.fail() },
    { id: 'hidden', label: '隐藏', getState: () => ({ visible: false }), run: () => assert.fail() },
    { id: 'later', label: '稍后', getState: () => ({ enabled, disabledReason: enabled ? '' : '不可用' }), run: () => assert.fail() },
  ])
  const buttons = await f.open()
  assert.equal(buttons[0].disabled, false)
  assert.equal(buttons.find(button => button.textContent.startsWith('坏状态')).disabled, true)
  assert.equal(buttons.some(button => button.textContent === '隐藏'), false)
  enabled = false
  buttons.find(button => button.textContent === '稍后').click()
  await tick()
  assert.match(document.querySelector('.dsh-context-toast').textContent, /不可用/)
  assert.deepEqual(f.calls, [])
})

test('plugin actions revalidate same-title selected identity and recycled rows', async () => {
  for (const mutate of [f => f.select('s2'), f => f.row.remove()]) {
    const f = fixture({ duplicate: true })
    f.bridge.registerActions('owner', [{ id: 'action', label: '动作', run: () => assert.fail('wrong identity') }])
    const buttons = await f.open()
    mutate(f)
    buttons.find(button => button.textContent === '动作').click()
    await tick()
    assert.match(document.querySelector('.dsh-context-toast').textContent, /重新打开菜单/)
    assert.deepEqual(f.calls, [])
  }
})

test('plugin failure reports an error without hiding the native session', async () => {
  const f = fixture()
  f.bridge.registerActions('owner', [{ id: 'action', label: '动作', run: async () => { throw new Error('服务离线') } }])
  ;(await f.open()).find(button => button.textContent === '动作').click()
  await tick()
  assert.match(document.querySelector('[role="alert"]').textContent, /服务离线/)
  assert.deepEqual(f.calls, [])
})

test('ready supports consumers arriving before or after host, and reload invalidates the old host', async () => {
  const f = fixture()
  const disposers = []
  f.ctx.effect = fn => disposers.push(fn())
  const ready = []
  const unavailable = []
  window.addEventListener('dsh-session-context-menu:ready', event => {
    ready.push(event.detail.bridge)
    event.detail.bridge.registerActions('early', [{ id: 'a', label: '提前加载', run: () => {} }])
  })
  window.addEventListener('dsh-session-context-menu:unavailable', event => unavailable.push(event.detail.bridge))
  apply(f.ctx)
  const first = window.__dshSessionContextMenu
  assert.equal(first.menuApiVersion, 1)
  assert.equal(first.version, 3)
  first.registerActions('late', [{ id: 'b', label: '稍后加载', run: () => {} }])
  const life = { busy: false, disposed: false }
  await showEnhancementMenu(f.ctx, first, f.row, { clientX: 0, clientY: 0 }, () => {}, life)
  assert.match(document.querySelector('.dsh-context-menu').textContent, /提前加载.*稍后加载/)
  apply(f.ctx)
  const second = window.__dshSessionContextMenu
  assert.notEqual(second, first)
  assert.deepEqual(ready, [first, second])
  assert.deepEqual(unavailable, [first])
  assert.throws(() => first.registerActions('dead', []), /卸载/)
  disposers[0]()
  assert.equal(window.__dshSessionContextMenu, second)
  disposers[1]()
  assert.equal(window.__dshSessionContextMenu, undefined)
  assert.deepEqual(unavailable, [first, second])
})

test('unregister aborts a running plugin and suppresses its late result', async () => {
  const f = fixture()
  let resolve, signal
  const remove = f.bridge.registerActions('owner', [{ id: 'a', label: '等待', run: (_target, options) => {
    signal = options.signal
    return new Promise(done => { resolve = done })
  } }])
  ;(await f.open()).find(button => button.textContent === '等待').click()
  remove()
  assert.equal(signal.aborted, true)
  resolve({ message: '不应显示' })
  await tick()
  assert.equal(document.querySelector('.dsh-context-toast'), null)
})

test('host disposal aborts pending action and suppresses late rejection', async () => {
  const f = fixture()
  let dispose, reject, signal
  f.ctx.effect = fn => { dispose = fn() }
  apply(f.ctx)
  window.__dshSessionContextMenu.registerActions('owner', [{ id: 'a', label: '等待', run: (_target, options) => {
    signal = options.signal
    return new Promise((_resolve, fail) => { reject = fail })
  } }])
  const event = new window.Event('contextmenu', { bubbles: true, cancelable: true })
  f.row.dispatchEvent(event)
  await tick()
  document.querySelector('.dsh-context-menu button:last-child').click()
  dispose()
  assert.equal(signal.aborted, true)
  reject(new Error('晚到错误'))
  await tick()
  assert.equal(document.querySelector('.dsh-context-toast'), null)
  assert.equal(document.querySelector('.dsh-context-menu'), null)
})

test('keyboard opens one menu, moves focus, and Escape returns focus to the row', async () => {
  const f = fixture()
  const dispose = installDomIntegration(f.ctx, f.bridge)
  const focused = []
  f.window.HTMLElement.prototype.focus = function () { focused.push(this) }
  const key = (target, name, shiftKey = false) => {
    const event = new window.Event('keydown', { bubbles: true, cancelable: true })
    Object.assign(event, { key: name, shiftKey })
    target.dispatchEvent(event)
    return event
  }
  key(f.row, 'F10', true)
  await tick()
  const buttons = [...document.querySelectorAll('.dsh-context-menu button')]
  assert.equal(buttons.length, 3)
  assert.equal(focused.at(-1), buttons[0])
  key(buttons[0], 'ArrowDown')
  assert.equal(focused.at(-1), buttons[1])
  key(buttons[1], 'End')
  assert.equal(focused.at(-1), buttons[2])
  key(buttons[2], 'Escape')
  assert.equal(document.querySelector('.dsh-context-menu'), null)
  assert.equal(focused.at(-1), f.row)
  key(f.row, 'ContextMenu')
  await tick()
  assert.equal(document.querySelectorAll('.dsh-context-menu').length, 1)
  dispose()
})

test('Escape cancels a delayed row selection before a menu can appear', async () => {
  const f = fixture()
  f.row.click = () => { f.select('s2') }
  const dispose = installDomIntegration(f.ctx, f.bridge)
  f.row.dispatchEvent(new window.Event('contextmenu', { bubbles: true, cancelable: true }))
  const escape = new window.Event('keydown', { bubbles: true, cancelable: true })
  escape.key = 'Escape'
  f.row.dispatchEvent(escape)
  await new Promise(resolve => setTimeout(resolve, 300))
  assert.equal(document.querySelector('.dsh-context-menu'), null)
  dispose()
})

test('plugin actions never enter workspace menus or infer missing selected session IDs', async () => {
  const f = fixture()
  let checks = 0
  f.bridge.registerActions('owner', [{ id: 'a', label: '插件动作', getState: () => { checks++; return {} }, run: () => assert.fail() }])
  assert.equal((await f.open(f.projectRow)).some(button => button.textContent.includes('插件动作')), false)
  f.row.click = () => {}
  const buttons = await f.open()
  const plugin = buttons.find(button => button.textContent.includes('插件动作'))
  assert.equal(plugin.disabled, true)
  assert.match(plugin.textContent, /官方会话 ID/)
  assert.equal(checks, 0)
})
