window.__ModuleLoader__.load({ id: "dsh-session-context-menu", factory: (require) => {
var module = { exports: {} }; var exports = module.exports;
Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });
const STORAGE_KEY = 'dsh.session.context-menu.pins.v1'
const WORKSPACE_STORAGE_KEY = 'dsh.workspace.context-menu.pins.v1'
const CHANGE_EVENT = 'dsh-session-context-menu:change'
const STYLE_ID = 'dsh-session-context-menu/client.css'

function sanitizeIds(value) {
  if (!Array.isArray(value)) return []
  const result = []
  const seen = new Set()
  for (const item of value) {
    const id = String(item ?? '').trim()
    if (id === '' || seen.has(id)) continue
    seen.add(id)
    result.push(id)
  }
  return result
}

function readStoredIds(key) {
  try {
    return sanitizeIds(JSON.parse(localStorage.getItem(key) ?? '[]'))
  } catch {
    return []
  }
}

function readPins() {
  return readStoredIds(STORAGE_KEY)
}

function readWorkspacePins() {
  return readStoredIds(WORKSPACE_STORAGE_KEY)
}

function emitChange(pins = readPins(), workspacePins = readWorkspacePins()) {
  if (typeof window?.dispatchEvent !== 'function') return
  const EventType = globalThis.CustomEvent
  if (typeof EventType === 'function') {
    window.dispatchEvent(new EventType(CHANGE_EVENT, { detail: { pins, workspacePins } }))
  }
}

function writeStoredIds(key, ids) {
  const next = sanitizeIds(ids)
  localStorage.setItem(key, JSON.stringify(next))
  emitChange(
    key === STORAGE_KEY ? next : readPins(),
    key === WORKSPACE_STORAGE_KEY ? next : readWorkspacePins(),
  )
  return next
}

function toggleStoredId(key, rawId) {
  const id = String(rawId)
  const ids = readStoredIds(key)
  const index = ids.indexOf(id)
  if (index === -1) ids.unshift(id)
  else ids.splice(index, 1)
  return writeStoredIds(key, ids).includes(id)
}

function sortPinnedIds(ids, pinned) {
  const cleanIds = sanitizeIds(ids)
  const order = new Map(pinned.map((id, index) => [id, index]))
  return cleanIds
    .map((id, index) => ({ id, index, pin: order.get(id) }))
    .sort((left, right) => {
      const leftPinned = left.pin !== undefined
      const rightPinned = right.pin !== undefined
      if (leftPinned !== rightPinned) return leftPinned ? -1 : 1
      if (leftPinned && rightPinned) return left.pin - right.pin
      return left.index - right.index
    })
    .map(entry => entry.id)
}

function workspaceSnapshot(ctx) {
  return ctx?.workspaces?.list?.getSnapshot?.() ?? { items: [], archivedSessionIds: [] }
}

function sessionsSnapshot(ctx) {
  return ctx?.sessions?.list?.getSnapshot?.() ?? { items: [], byId: {}, current: undefined }
}

function workspaceIdOf(workspace) {
  return String(workspace?.workspaceId ?? workspace?.id ?? '')
}

function workspaceTitleOf(workspace) {
  return String(workspace?.title || workspace?.path?.replace(/[\\/]+$/u, '').split(/[\\/]/u).pop() || '')
}

function sessionIdOf(session) {
  return String(session?.id ?? session?.sessionId ?? '')
}

function sessionTitleOf(session) {
  return String(session?.displayTitle ?? session?.title ?? '')
}

function sessionItems(snapshot) {
  if (Array.isArray(snapshot?.items)) return snapshot.items
  if (snapshot?.byId && typeof snapshot.byId === 'object') return Object.values(snapshot.byId)
  return []
}

function createBridge(ctx = {}) {
  const bridge = {
    version: 3,
    eventName: CHANGE_EVENT,
    listPinned: readPins,
    isPinned(sessionId) {
      return readPins().includes(String(sessionId))
    },
    togglePin(sessionId) {
      return toggleStoredId(STORAGE_KEY, sessionId)
    },
    sortPinned(sessionIds) {
      return sortPinnedIds(sessionIds, readPins())
    },
    listWorkspacePinned: readWorkspacePins,
    isWorkspacePinned(workspaceId) {
      return readWorkspacePins().includes(String(workspaceId))
    },
    toggleWorkspacePin(workspaceId) {
      return toggleStoredId(WORKSPACE_STORAGE_KEY, workspaceId)
    },
    sortPinnedWorkspaces(workspaceIds) {
      return sortPinnedIds(workspaceIds, readWorkspacePins())
    },
    workspaces() {
      return [...(workspaceSnapshot(ctx).items ?? [])]
    },
    sessions() {
      return sessionItems(sessionsSnapshot(ctx))
    },
    async pinWorkspace(workspaceId) {
      const id = String(workspaceId)
      if (!(workspaceSnapshot(ctx).items ?? []).some(item => workspaceIdOf(item) === id)) {
        throw new Error('工作区已变更，请重新打开菜单')
      }
      if (typeof ctx?.workspaces?.insertBefore !== 'function') throw new Error('官方排序接口未就绪')
      const pinned = !bridge.isWorkspacePinned(id)
      if (pinned && typeof ctx?.workspaces?.insertBefore === 'function') {
        const first = (workspaceSnapshot(ctx).items ?? []).find(item => workspaceIdOf(item) !== id)
        if (first !== undefined) await ctx.workspaces.insertBefore(id, workspaceIdOf(first))
      }
      bridge.toggleWorkspacePin(id)
      return pinned
    },
    async pinSession(workspaceId, sessionId) {
      const id = String(sessionId)
      const owner = (workspaceSnapshot(ctx).items ?? []).find(item => workspaceIdOf(item) === String(workspaceId))
      if (!owner?.sessionIds.includes(id)) throw new Error('会话归属已变更，请重新打开菜单')
      if (typeof ctx?.workspaces?.insertSessionBefore !== 'function') throw new Error('官方排序接口未就绪')
      const pinned = !bridge.isPinned(id)
      if (pinned && typeof ctx?.workspaces?.insertSessionBefore === 'function') {
        const workspace = (workspaceSnapshot(ctx).items ?? []).find(item => workspaceIdOf(item) === String(workspaceId))
        const first = (workspace?.sessionIds ?? []).find(candidate => String(candidate) !== id)
        if (first !== undefined) await ctx.workspaces.insertSessionBefore(String(workspaceId), id, String(first))
      }
      bridge.togglePin(id)
      return pinned
    },
    async archiveWorkspace(workspaceId, confirmedIds) {
      if (typeof ctx?.uiWorkspace?.archiveSession !== 'function') throw new Error('当前 DSH 未提供归档接口')
      const workspace = (workspaceSnapshot(ctx).items ?? []).find(item => workspaceIdOf(item) === String(workspaceId))
      if (workspace === undefined) throw new Error('工作区不存在或已被移除')
      const archived = new Set((workspaceSnapshot(ctx).archivedSessionIds ?? []).map(String))
      const ids = sanitizeIds(workspace.sessionIds ?? []).filter(id => !archived.has(id))
      const selected = confirmedIds === undefined ? ids : ids.filter(id => confirmedIds.includes(id))
      let completed = 0
      for (const id of selected) {
        const current = workspaceSnapshot(ctx)
        if (!current.items.find(item => workspaceIdOf(item) === String(workspaceId))?.sessionIds.includes(id)) continue
        if (current.archivedSessionIds?.includes(id)) continue
        try { await ctx.uiWorkspace.archiveSession(id); completed++ }
        catch (error) { throw new Error(`已归档 ${completed} 个；后续失败：${error?.message ?? error}`) }
      }
      return { archived: completed }
    },
  }
  return bridge
}

const CSS = `
.dsh-context-menu{position:fixed;z-index:2147483646;min-width:224px;padding:6px;border:1px solid var(--dsw-alias-border-l2,#d9d9de);border-radius:12px;background:var(--dsw-alias-bg-module-platform,#fff);box-shadow:0 14px 40px rgba(0,0,0,.18);color:var(--dsw-alias-label-primary,#1f2025);font:13px/1.35 system-ui,-apple-system,"Segoe UI",sans-serif}
.dsh-context-menu button{display:flex;width:100%;align-items:center;gap:10px;border:0;border-radius:8px;padding:8px 10px;background:transparent;color:inherit;text-align:left;cursor:pointer;font:inherit}
.dsh-context-menu button:hover,.dsh-context-menu button:focus-visible{outline:none;background:var(--dsw-alias-interactive-bg-hover,rgba(90,92,110,.09))}
.dsh-context-menu button.danger{color:#c43f50}
.dsh-context-menu button[disabled]{opacity:.48;cursor:default}
.dsh-context-separator{height:1px;margin:5px 4px;background:var(--dsw-alias-border-l2,#e4e4e8)}
.dsh-context-pin-marker{display:inline-flex;flex:none;margin-left:5px;color:#d68b00;font-size:11px;vertical-align:middle}
.dsh-context-toast{position:fixed;z-index:2147483647;right:24px;bottom:24px;max-width:min(440px,calc(100vw - 48px));border-radius:10px;padding:10px 14px;background:#25262b;color:#fff;box-shadow:0 10px 30px rgba(0,0,0,.22);font:13px/1.4 system-ui,-apple-system,"Segoe UI",sans-serif}
`

function ensureCss() {
  if (typeof document === 'undefined') return () => {}
  const existing = document.querySelector(`style[data-plugin-css="${STYLE_ID}"]`)
  if (existing !== null) return () => {}
  const tag = document.createElement('style')
  tag.dataset.plugin = 'dsh-session-context-menu'
  tag.dataset.pluginCss = STYLE_ID
  tag.textContent = CSS
  document.head.appendChild(tag)
  return () => tag.remove()
}

function classContains(element, token) {
  return element instanceof Element && [...element.classList].some(name => name.includes(token))
}

function closestClass(element, token) {
  let current = element instanceof Element ? element : element?.parentElement
  while (current !== null && current !== undefined) {
    if (classContains(current, token)) return current
    current = current.parentElement
  }
  return null
}

function rowTitle(row) {
  const title = [...row.querySelectorAll('span')].find(element => classContains(element, '_title'))
  if (title === undefined) return row.textContent?.trim() ?? ''
  const clone = title.cloneNode(true)
  clone.querySelectorAll('.dsh-context-pin-marker').forEach(element => element.remove())
  return clone.textContent?.trim() ?? ''
}

function addPinMarker(row, pinned) {
  const existing = row.querySelector('.dsh-context-pin-marker')
  if (!pinned) {
    existing?.remove()
    return
  }
  if (existing !== null) return
  const title = [...row.querySelectorAll('span')].find(element => classContains(element, '_title'))
  if (title === undefined) return
  const marker = document.createElement('span')
  marker.className = 'dsh-context-pin-marker'
  marker.setAttribute('aria-hidden', 'true')
  marker.title = '已置顶（置顶时移至顶部，后续排序由 DSH 管理）'
  marker.textContent = '●'
  title.appendChild(marker)
}

// RC1 has no public row-ID attribute: ambiguous titles must not become IDs.
function uniqueByTitle(items, title, titleOf) {
  const matches = items.filter(item => titleOf(item) === title)
  return matches.length === 1 ? matches[0] : undefined
}

function resolveRow(ctx, row) {
  const workspaces = workspaceSnapshot(ctx).items ?? []
  if (classContains(row, '_projectRow')) {
    return { workspace: uniqueByTitle(workspaces, rowTitle(row), workspaceTitleOf) }
  }
  const section = closestClass(row.parentElement, '_groupSection')
  const projectRow = section && [...section.querySelectorAll('[role="treeitem"]')]
    .find(item => classContains(item, '_projectRow'))
  const workspace = projectRow && uniqueByTitle(workspaces, rowTitle(projectRow), workspaceTitleOf)
  const snapshot = sessionsSnapshot(ctx)
  const all = sessionItems(snapshot).filter(item => !item.blank)
  const candidates = workspace ? all.filter(item => workspace.sessionIds.includes(sessionIdOf(item))) : all
  const selected = row.getAttribute('aria-selected') === 'true'
    ? candidates.find(item => sessionIdOf(item) === snapshot.current && sessionTitleOf(item) === rowTitle(row))
    : undefined
  const session = selected ?? uniqueByTitle(candidates, rowTitle(row), sessionTitleOf)
  const owners = session ? workspaces.filter(item => item.sessionIds.includes(sessionIdOf(session))) : []
  return { session, workspace: workspace ?? (owners.length === 1 ? owners[0] : undefined) }
}

function nativeMenuButton(row) {
  const actions = [...row.querySelectorAll('span')].find(element => classContains(element, '_rowActions'))
  const title = rowTitle(row)
  // Exact RC1 accessibility labels, not button position: Ungrouped has only "+".
  const labels = classContains(row, '_projectRow')
    ? [`工作区“${title}”的操作`, `Workspace actions for ${title}`]
    : [`会话“${title}”的操作`, `Session actions for ${title}`]
  return [...(actions?.querySelectorAll('button') ?? [])]
    .find(button => labels.includes(button.getAttribute('aria-label')))
}

function decorateRows(ctx, bridge) {
  if (typeof document === 'undefined') return
  for (const row of document.querySelectorAll('[role="treeitem"]')) {
    if (!classContains(row, '_projectRow') && !classContains(row, '_sessionRow')) continue
    const { workspace, session } = resolveRow(ctx, row)
    addPinMarker(row, classContains(row, '_projectRow')
      ? !!workspace && bridge.isWorkspacePinned(workspaceIdOf(workspace))
      : !!session && bridge.isPinned(sessionIdOf(session)))
  }
}

async function deleteMaintenanceSession(ctx, sessionId, fetchImpl = fetch) {
  // Only the host resolves native ID -> current-run canonical ID. No popup,
  // browser Engine token, direct native deletion, or Codex source write.
  const response = await fetchImpl('/dsh-session-maintenance/api', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ operation: 'delete-session', sessionId }),
  })
  const result = await response.json()
  if (!response.ok || result.ok !== true) throw new Error(result.error || `Maintenance 删除未确认（HTTP ${response.status}），未隐藏会话`)
  const receipt = result.deletion
  if (!receipt || typeof result.logicalSessionId !== 'string' || receipt.logicalSessionId !== result.logicalSessionId ||
      !['deleted', 'pending-delete'].includes(receipt.state)) throw new Error('Maintenance 未返回有效删除回执；未隐藏会话，请检查状态')
  const message = receipt.state === 'deleted' ? '已从 Maintenance 删除会话；Codex 原始会话不变'
    : 'Maintenance 已登记删除，等待现有写入收尾；Codex 原始会话不变'
  try {
    if (typeof ctx?.uiWorkspace?.archiveSession !== 'function') throw new Error('官方列表刷新接口未就绪')
    await ctx.uiWorkspace.archiveSession(sessionId)
    return message
  } catch (error) {
    return `${message}。当前列表未隐藏，请刷新：${error?.message ?? error}`
  }
}

async function selectSessionRow(ctx, row, lifetime) {
  // RC1 exposes no row ID. Its native onClick selects the exact node.id in the
  // public Session Controller; wait only for aria-selected to confirm that row.
  row.click()
  const expectedId = sessionsSnapshot(ctx).current
  if (!expectedId) return undefined
  for (let attempt = 0; attempt < 16; attempt++) {
    if (!row.isConnected || lifetime.disposed || sessionsSnapshot(ctx).current !== expectedId) return undefined
    if (row.getAttribute('aria-selected') === 'true') {
      const target = resolveRow(ctx, row)
      return sessionIdOf(target.session) === expectedId ? target : undefined
    }
    await new Promise(resolve => setTimeout(resolve, 16))
  }
  return undefined
}

function showToast(message, kind = 'ok') {
  if (typeof document === 'undefined') return
  document.querySelector('.dsh-context-toast')?.remove()
  const toast = document.createElement('div')
  toast.className = 'dsh-context-toast'
  toast.setAttribute('role', kind === 'error' ? 'alert' : 'status')
  toast.textContent = String(message)
  document.body.appendChild(toast)
  setTimeout(() => toast.remove(), kind === 'error' ? 6500 : 3500)
}

function makeMenuItem(label, action, options = {}) {
  if (label === '---') {
    const separator = document.createElement('div')
    separator.className = 'dsh-context-separator'
    separator.setAttribute('role', 'separator')
    return separator
  }
  const button = document.createElement('button')
  button.type = 'button'
  button.setAttribute('role', 'menuitem')
  button.textContent = label
  button.classList.toggle('danger', options.danger === true)
  button.disabled = options.disabled === true
  button.addEventListener('click', action)
  return button
}

async function showEnhancementMenu(ctx, bridge, row, event, scheduleDecorate, lifetime) {
  if (!nativeMenuButton(row)) return false
  const workspaceRow = classContains(row, '_projectRow')
  const selectedTarget = workspaceRow ? undefined : await selectSessionRow(ctx, row, lifetime)
  if (!row.isConnected || lifetime.disposed) return false
  const target = workspaceRow ? resolveRow(ctx, row) : (selectedTarget ?? {})
  const currentTarget = () => {
    if (!row.isConnected || lifetime.disposed) throw new Error('列表已刷新，请重新打开菜单')
    const current = resolveRow(ctx, row)
    if ((!workspaceRow && (row.getAttribute('aria-selected') !== 'true' || sessionsSnapshot(ctx).current !== sessionIdOf(target.session))) ||
        sessionIdOf(current.session) !== sessionIdOf(target.session) ||
        workspaceIdOf(current.workspace) !== workspaceIdOf(target.workspace)) {
      throw new Error('会话或工作区已变更，请重新打开菜单')
    }
    return current
  }
  const menu = document.createElement('div')
  menu.className = 'dsh-context-menu'
  menu.setAttribute('role', 'menu')
  const item = (label, action, enabled = true) => {
    menu.appendChild(makeMenuItem(label, async () => {
      if (lifetime.busy || lifetime.disposed) return
      lifetime.busy = true
      menu.remove()
      try { await action() }
      catch (error) { if (!lifetime.disposed) showToast(error?.message ?? String(error), 'error') }
      finally { lifetime.busy = false; scheduleDecorate() }
    }, { disabled: !enabled }))
  }
  item(workspaceRow ? '官方工作区操作…' : '官方会话操作…', () => {
    if (!row.isConnected || lifetime.disposed) throw new Error('官方菜单已刷新，请重试')
    const button = nativeMenuButton(row)
    if (!button) throw new Error('官方菜单已刷新，请重试')
    button.click() // Official dialogs, fork boundary and archive behavior.
  })
  if (workspaceRow) {
    const workspace = target.workspace
    item(workspace && bridge.isWorkspacePinned(workspaceIdOf(workspace)) ? '取消置顶' : '置顶', async () => {
      const current = currentTarget().workspace
      const pinned = await bridge.pinWorkspace(workspaceIdOf(current))
      if (!lifetime.disposed) showToast(pinned ? '工作区已移到顶部' : '已取消置顶标记')
    }, !!workspace)
    item('归档此工作区全部聊天…', async () => {
      const current = currentTarget().workspace
      const archived = new Set(workspaceSnapshot(ctx).archivedSessionIds ?? [])
      const ids = sanitizeIds(current.sessionIds).filter(id => !archived.has(id))
      if (!ids.length) return showToast('没有未归档聊天')
      if (!window.confirm(`归档“${workspaceTitleOf(current)}”中的 ${ids.length} 个聊天？不会删除会话内容。`)) return
      const result = await bridge.archiveWorkspace(workspaceIdOf(current), ids)
      if (!lifetime.disposed) showToast(`已归档 ${result.archived} 个聊天`)
    }, !!workspace)
  } else {
    const session = target.session
    item(session && bridge.isPinned(sessionIdOf(session)) ? '取消置顶' : '置顶', async () => {
      const current = currentTarget()
      const pinned = await bridge.pinSession(workspaceIdOf(current.workspace), sessionIdOf(current.session))
      if (!lifetime.disposed) showToast(pinned ? '聊天已移到顶部' : '已取消置顶标记')
    }, !!session && !!target.workspace)
    item('删除会话', async () => {
      const current = currentTarget()
      const message = await deleteMaintenanceSession(ctx, sessionIdOf(current.session))
      if (!lifetime.disposed) showToast(message)
    }, !!session)
  }
  if (workspaceRow ? !target.workspace : !target.session) {
    const reason = document.createElement('div')
    reason.setAttribute('role', 'status')
    reason.style.cssText = 'max-width:280px;padding:8px 10px;opacity:.8'
    reason.textContent = workspaceRow ? '工作区身份不唯一；可使用上方官方操作。'
      : '未能确认此行的官方会话 ID；请先左键选中后重试。'
    menu.appendChild(reason)
  }
  placeAndOpenMenu(menu, event.clientX, event.clientY)
  return true
}

function placeAndOpenMenu(menu, x, y) {
  document.querySelector('.dsh-context-menu')?.remove()
  document.body.appendChild(menu)
  const margin = 8
  const rect = menu.getBoundingClientRect()
  menu.style.left = `${Math.max(margin, Math.min(x, window.innerWidth - rect.width - margin))}px`
  menu.style.top = `${Math.max(margin, Math.min(y, window.innerHeight - rect.height - margin))}px`
  menu.querySelector('button:not([disabled])')?.focus()
}

function installDomIntegration(ctx, bridge) {
  if (typeof document === 'undefined') return () => {}
  const lifetime = { disposed: false, busy: false }
  let scheduled = false
  const scheduleDecorate = () => {
    if (scheduled || lifetime.disposed) return
    scheduled = true
    queueMicrotask(() => {
      scheduled = false
      if (!lifetime.disposed) decorateRows(ctx, bridge)
    })
  }

  const onContextMenu = event => {
    if (event.defaultPrevented || event.shiftKey || lifetime.busy || lifetime.disposed) return
    const row = event.target instanceof Element ? event.target.closest('[role="treeitem"]') : null
    if (row === null) return
    const workspaceRow = classContains(row, '_projectRow')
    const sessionRow = classContains(row, '_sessionRow')
    if (!workspaceRow && !sessionRow) return
    if (!nativeMenuButton(row)) return
    event.preventDefault()
    event.stopPropagation()
    lifetime.busy = true
    void showEnhancementMenu(ctx, bridge, row, event, scheduleDecorate, lifetime)
      .catch(error => { if (!lifetime.disposed) showToast(error?.message ?? error, 'error') })
      .finally(() => { lifetime.busy = false })
  }
  const onPointerDown = event => {
    const menu = document.querySelector('.dsh-context-menu')
    if (menu !== null && event.target instanceof Node && !menu.contains(event.target)) menu.remove()
  }
  const onKeyDown = event => {
    if (event.key === 'Escape') document.querySelector('.dsh-context-menu')?.remove()
  }
  const observer = new MutationObserver(records => {
    // Conversation streaming is unrelated to sidebar decoration.
    if (records.some(record => {
      const target = record.target instanceof Element ? record.target : record.target.parentElement
      return target?.closest('[role="treeitem"]') ||
        [...record.addedNodes].some(node => node instanceof Element &&
          (node.matches('[role="treeitem"]') || node.querySelector('[role="treeitem"]')))
    })) scheduleDecorate()
  })
  observer.observe(document.body, { childList: true, subtree: true, characterData: true })
  document.addEventListener('contextmenu', onContextMenu, true)
  document.addEventListener('pointerdown', onPointerDown, true)
  document.addEventListener('keydown', onKeyDown, true)
  const unsubscribeWorkspaces = ctx?.workspaces?.list?.subscribe?.(scheduleDecorate)
  const unsubscribeSessions = ctx?.sessions?.list?.subscribe?.(scheduleDecorate)
  scheduleDecorate()

  return () => {
    lifetime.disposed = true
    observer.disconnect()
    document.removeEventListener('contextmenu', onContextMenu, true)
    document.removeEventListener('pointerdown', onPointerDown, true)
    document.removeEventListener('keydown', onKeyDown, true)
    if (typeof unsubscribeWorkspaces === 'function') unsubscribeWorkspaces()
    if (typeof unsubscribeSessions === 'function') unsubscribeSessions()
    document.querySelector('.dsh-context-menu')?.remove()
    document.querySelector('.dsh-context-toast')?.remove()
    document.querySelectorAll('.dsh-context-pin-marker').forEach(marker => marker.remove())
  }
}

const inject = ['workspaces', 'sessions', 'uiWorkspace']

function apply(ctx) {
  const bridge = createBridge(ctx)
  window.__dshSessionContextMenu = bridge
  const removeCss = ensureCss()
  const removeDom = installDomIntegration(ctx, bridge)
  emitChange(bridge.listPinned(), bridge.listWorkspacePinned())

  const dispose = () => {
    removeDom()
    removeCss()
    if (window.__dshSessionContextMenu === bridge) delete window.__dshSessionContextMenu
    emitChange([], [])
  }
  if (typeof ctx?.effect === 'function') ctx.effect(() => dispose)
}
exports.apply = apply;
exports.inject = inject;
exports.createBridge = createBridge;
return module.exports; } });
