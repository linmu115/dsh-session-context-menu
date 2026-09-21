import assert from 'node:assert/strict'
import test from 'node:test'
import { joinWorkspaceWithMaintenance, maintenanceBridge } from '../src/client.js'
import { fixture, tick } from './menu-fixture.mjs'

const JOIN_LABEL = '将当前工作区加入 sessionmaintenance'
const WORKSPACE_MENU = ['官方工作区操作…', '置顶', '归档此工作区全部聊天…', JOIN_LABEL]

test.afterEach(() => {
  delete globalThis.document
  delete globalThis.dshSessionMaintenance
})

function bridgeHandle(joinWorkspace, apiVersion = 1) {
  return { apiVersion, joinWorkspace }
}

test('workspace menu hands the row-resolved workspace to the Maintenance bridge', async t => {
  t.mock.timers.enable({ apis: ['setTimeout'] })
  const f = fixture()
  const inputs = []
  globalThis.dshSessionMaintenance = bridgeHandle(async input => {
    inputs.push(input)
    return { ok: true, code: 'joined', message: 'engine mapped the workspace' }
  })

  const items = await f.open(f.projectRow)
  assert.deepEqual(items.map(item => item.textContent), WORKSPACE_MENU)
  assert.equal(items[3].disabled, false)

  items[3].click()
  await tick()

  // Identity comes from the row through the public snapshot, never from the DOM.
  assert.deepEqual(inputs, [{ workspaceId: 'w1', workspaceName: 'Project', workspacePath: 'D:/project' }])
  assert.equal(document.querySelector('.dsh-context-menu'), null)
  assert.match(document.querySelector('.dsh-context-toast').textContent, /已将当前工作区加入 sessionmaintenance/)
})

test('the hand-off never enters the session menu', async t => {
  t.mock.timers.enable({ apis: ['setTimeout'] })
  const f = fixture()
  const inputs = []
  globalThis.dshSessionMaintenance = bridgeHandle(async input => {
    inputs.push(input)
    return { ok: true, code: 'joined', message: '' }
  })

  const sessionItems = await f.open()
  assert.deepEqual(sessionItems.map(item => item.textContent), ['官方会话操作…', '置顶', '删除会话'])
  assert.equal(sessionItems.some(item => item.textContent === JOIN_LABEL), false)

  const workspaceItems = await f.open(f.projectRow)
  assert.equal(workspaceItems.some(item => item.textContent === JOIN_LABEL), true)
  assert.deepEqual(inputs, [])
})

for (const [description, handle] of [
  ['no bridge is installed', undefined],
  ['the bridge declares another apiVersion', bridgeHandle(async () => ({ ok: true, code: 'joined', message: '' }), 2)],
  ['the bridge omits apiVersion', { joinWorkspace: async () => ({ ok: true, code: 'joined', message: '' }) }],
  ['the bridge exposes no joinWorkspace', { apiVersion: 1 }],
  ['the global is not an object', 'dshSessionMaintenance'],
]) {
  test(`the hand-off is disabled and inert when ${description}`, async t => {
    t.mock.timers.enable({ apis: ['setTimeout'] })
    const f = fixture()
    if (handle !== undefined) globalThis.dshSessionMaintenance = handle

    const items = await f.open(f.projectRow)
    assert.deepEqual(items.map(item => item.textContent), WORKSPACE_MENU)
    const join = items[3]
    assert.equal(join.disabled, true)
    assert.match(join.title, /维护插件桥不可用/)
    assert.deepEqual(f.calls, [])
    assert.equal(f.bridge.isWorkspacePinned('w1'), false)

    // Every pre-existing workspace action keeps working exactly as before.
    items[1].click()
    await tick()
    assert.equal(f.bridge.isWorkspacePinned('w1'), true)
    assert.match(document.querySelector('.dsh-context-toast').textContent, /工作区已移到顶部/)
  })
}

test('a click reaching the handler without a bridge reports locally instead of throwing', async t => {
  t.mock.timers.enable({ apis: ['setTimeout'] })
  const f = fixture()
  const items = await f.open(f.projectRow)
  // A real browser never dispatches click on a disabled button; linkedom does,
  // so this proves the per-call bridge revalidation stays local either way.
  items[3].click()
  await tick()
  assert.match(document.querySelector('[role="alert"]').textContent, /维护插件桥不可用/)
  assert.equal(document.querySelector('.dsh-context-menu'), null)
  assert.deepEqual(f.calls, [])
})

test('a rejecting bridge shows an error and other workspace actions still work', async t => {
  t.mock.timers.enable({ apis: ['setTimeout'] })
  const f = fixture()
  globalThis.dshSessionMaintenance = bridgeHandle(async () => {
    throw new Error('engine busy')
  })

  ;(await f.open(f.projectRow))[3].click()
  await tick()
  assert.match(document.querySelector('[role="alert"]').textContent, /维护插件调用失败：engine busy/)
  assert.equal(document.querySelector('.dsh-context-menu'), null)

  const items = await f.open(f.projectRow)
  assert.deepEqual(items.map(item => item.textContent), WORKSPACE_MENU)
  assert.equal(items[3].disabled, false)
  items[1].click()
  await tick()
  assert.equal(f.bridge.isWorkspacePinned('w1'), true)
  assert.deepEqual(f.calls, [])
  assert.match(document.querySelector('.dsh-context-toast').textContent, /工作区已移到顶部/)
})

test('a repeat join reports idempotence distinctly from a first join', async t => {
  t.mock.timers.enable({ apis: ['setTimeout'] })
  const f = fixture()
  const inputs = []
  globalThis.dshSessionMaintenance = bridgeHandle(async input => {
    inputs.push(input)
    return inputs.length === 1
      ? { ok: true, code: 'joined', message: 'mapped' }
      : { ok: true, code: 'already-joined', message: 'mapped' }
  })

  ;(await f.open(f.projectRow))[3].click()
  await tick()
  const first = document.querySelector('.dsh-context-toast').textContent
  ;(await f.open(f.projectRow))[3].click()
  await tick()
  const second = document.querySelector('.dsh-context-toast').textContent

  assert.notEqual(first, second)
  assert.match(first, /已将当前工作区加入 sessionmaintenance/)
  assert.match(second, /已在 sessionmaintenance 中，无需重复加入/)
  assert.deepEqual(inputs.map(input => input.workspaceId), ['w1', 'w1'])
})

test('the handle is re-read and re-validated on every call', async () => {
  assert.equal(maintenanceBridge(), undefined)
  await assert.rejects(joinWorkspaceWithMaintenance({ workspaceId: 'w1' }), /维护插件桥不可用/)

  globalThis.dshSessionMaintenance = bridgeHandle(async () => ({ ok: true, code: 'joined', message: '' }))
  assert.equal(maintenanceBridge(), globalThis.dshSessionMaintenance)
  assert.match(await joinWorkspaceWithMaintenance({ workspaceId: 'w1' }), /已将当前工作区加入 sessionmaintenance/)

  // A bridge installed or replaced later is used; the previous handle is not cached.
  const seen = []
  globalThis.dshSessionMaintenance = bridgeHandle(async input => {
    seen.push(input)
    return { ok: true, code: 'already-joined', message: '' }
  })
  assert.match(await joinWorkspaceWithMaintenance({ workspaceId: 'w2' }), /已在 sessionmaintenance 中/)
  assert.deepEqual(seen, [{ workspaceId: 'w2' }])

  // An older apiVersion is treated as "not available", never as a usable bridge.
  globalThis.dshSessionMaintenance = bridgeHandle(async () => ({ ok: true, code: 'joined', message: '' }), 2)
  await assert.rejects(joinWorkspaceWithMaintenance({ workspaceId: 'w1' }), /维护插件桥不可用/)
})

test('every documented join code has one distinct, actionable outcome', async () => {
  const respond = payload => {
    globalThis.dshSessionMaintenance = bridgeHandle(async () => payload)
  }

  respond({ ok: true, code: 'joined', message: 'mapped' })
  assert.equal(await joinWorkspaceWithMaintenance({ workspaceId: 'w1' }), '已将当前工作区加入 sessionmaintenance')
  respond({ ok: true, code: 'already-joined', message: 'mapped' })
  assert.equal(await joinWorkspaceWithMaintenance({ workspaceId: 'w1' }), '当前工作区已在 sessionmaintenance 中，无需重复加入')

  respond({ ok: false, code: 'engine-unreachable', message: '' })
  await assert.rejects(joinWorkspaceWithMaintenance({ workspaceId: 'w1' }), /维护引擎不可达/)
  respond({ ok: false, code: 'engine-error', message: 'engine busy, retry later' })
  await assert.rejects(joinWorkspaceWithMaintenance({ workspaceId: 'w1' }), /engine busy, retry later/)
  respond({ ok: true, code: 'invalid-input', message: '' })
  await assert.rejects(joinWorkspaceWithMaintenance({ workspaceId: 'w1' }), /工作区信息无效/)

  // Unknown codes are failures; the bridge message is shown when it has one.
  respond({ ok: true, code: 'brand-new-code', message: '' })
  await assert.rejects(joinWorkspaceWithMaintenance({ workspaceId: 'w1' }), /未知结果（brand-new-code）/)
  respond({ ok: true, code: 'brand-new-code', message: '维护引擎正在整理，请稍后再试' })
  await assert.rejects(joinWorkspaceWithMaintenance({ workspaceId: 'w1' }), /维护引擎正在整理，请稍后再试/)
  respond({ ok: true, code: 'joined', message: '' })
  globalThis.dshSessionMaintenance = bridgeHandle(async () => ({ ok: false, code: 'joined', message: '' }))
  await assert.rejects(joinWorkspaceWithMaintenance({ workspaceId: 'w1' }), /未确认加入成功/)

  respond(undefined)
  await assert.rejects(joinWorkspaceWithMaintenance({ workspaceId: 'w1' }), /无法识别的结果/)
  globalThis.dshSessionMaintenance = bridgeHandle(async () => {
    throw new Error('bridge exploded')
  })
  await assert.rejects(joinWorkspaceWithMaintenance({ workspaceId: 'w1' }), /维护插件调用失败：bridge exploded/)
})
