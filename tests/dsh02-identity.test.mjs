import assert from 'node:assert/strict'
import test from 'node:test'
import { resolveRow } from '../src/client.js'
import { fixture, tick } from './menu-fixture.mjs'

function nativeFixture(options) {
  const f = fixture(options)
  f.row.setAttribute('data-row-key', 'session:s1')
  f.projectRow.setAttribute('data-row-key', 'workspace:w1')
  f.snapshot.pinnedSessionIds = []
  f.ctx.uiWorkspace.pinSession = async id => { f.calls.push(['pin', id]); f.snapshot.pinnedSessionIds.push(id) }
  f.ctx.uiWorkspace.unpinSession = async id => {
    f.calls.push(['unpin', id])
    f.snapshot.pinnedSessionIds = f.snapshot.pinnedSessionIds.filter(value => value !== id)
  }
  return f
}

test('0.2 stable keys resolve duplicate and unnamed rows without selecting the conversation', async () => {
  const f = nativeFixture({ duplicate: true })
  let selected = 0
  f.row.addEventListener('click', () => selected++)
  assert.equal(resolveRow(f.ctx, f.row).session.id, 's1')
  f.byId.s1.title = ''
  f.row.querySelector('.rc1_title').textContent = '未命名'
  f.row.querySelector('button').setAttribute('aria-label', '会话“未命名”的操作')
  const items = await f.open()
  assert.equal(items[1].disabled, false)
  assert.equal(items[2].disabled, false)
  assert.equal(selected, 0)
  f.snapshot.items.push({ workspaceId: 'w2', title: 'Project', sessionIds: [] })
  assert.equal(resolveRow(f.ctx, f.projectRow).workspace.workspaceId, 'w1')
})

test('unknown, blank and malformed native keys never fall back to matching titles', () => {
  const f = nativeFixture()
  for (const key of ['session:missing', 'workspace:w1', '']) {
    f.row.setAttribute('data-row-key', key)
    assert.equal(resolveRow(f.ctx, f.row).session, undefined)
  }
  f.row.setAttribute('data-row-key', 'session:s1')
  f.byId.s1.blank = true
  assert.equal(resolveRow(f.ctx, f.row).session, undefined)
  f.projectRow.setAttribute('data-row-key', 'workspace:missing')
  assert.equal(resolveRow(f.ctx, f.projectRow).workspace, undefined)
})

test('native pins remain authoritative across external changes and failed writes', async () => {
  const f = nativeFixture()
  globalThis.localStorage.setItem('dsh.session.context-menu.pins.v1', '["s1"]')
  assert.equal(f.bridge.isPinned('s1'), false)
  await f.bridge.pinSession('w1', 's1')
  assert.equal(f.bridge.isPinned('s1'), true)
  await f.bridge.togglePin('s1')
  assert.equal(f.bridge.isPinned('s1'), false)
  f.snapshot.pinnedSessionIds = ['s2']
  assert.deepEqual(f.bridge.sortPinned(['s1', 's2']), ['s2', 's1'])
  f.ctx.uiWorkspace.pinSession = async () => { throw new Error('offline') }
  await assert.rejects(f.bridge.pinSession('w1', 's1'), /offline/)
  assert.deepEqual(f.bridge.listPinned(), ['s2'])
  assert.deepEqual(f.calls, [['pin', 's1'], ['unpin', 's1']])
})

test('recycled native row rejects a stale action even with identical titles', async t => {
  t.mock.timers.enable({ apis: ['setTimeout'] })
  const f = nativeFixture({ duplicate: true })
  const items = await f.open()
  f.row.setAttribute('data-row-key', 'session:s2')
  items[1].click()
  await tick()
  assert.deepEqual(f.calls, [])
  assert.match(f.document.querySelector('[role="alert"]').textContent, /已变更/)
})

test('native pin works for an ungrouped session and never invokes old ordering', async () => {
  const f = nativeFixture()
  f.workspace.sessionIds = ['s2']
  const items = await f.open()
  assert.equal(items[1].disabled, false)
  await f.bridge.pinSession(undefined, 's1')
  assert.deepEqual(f.calls, [['pin', 's1']])
})
