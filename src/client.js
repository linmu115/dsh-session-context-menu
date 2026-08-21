const STORAGE_KEY = 'dsh.session.context-menu.pins.v1'
const WORKSPACE_STORAGE_KEY = 'dsh.workspace.context-menu.pins.v1'
const CHANGE_EVENT = 'dsh-session-context-menu:change'
const STYLE_ID = 'dsh-session-context-menu/client.css'
const WORKTREE_ENDPOINT = '/dsh-session-context-menu/worktree'

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
  return String(workspace?.title ?? workspace?.name ?? '')
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

function unwrapResult(result, fallback) {
  if (result && result.ok === false) {
    throw new Error(result.error?.message ?? fallback)
  }
  return result
}

async function createPermanentWorktree(workspaceId, name, baseCommit) {
  const response = await fetch(WORKTREE_ENDPOINT, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ workspaceId, name, baseCommit }),
  })
  let payload
  try {
    payload = await response.json()
  } catch {
    payload = { ok: false, error: `永久工作树服务返回了无法解析的响应（HTTP ${response.status}）` }
  }
  if (!response.ok || payload?.ok !== true) {
    throw new Error(payload?.error ?? `永久工作树创建失败（HTTP ${response.status}）`)
  }
  return payload
}

function createBridge(ctx = {}) {
  const bridge = {
    version: 2,
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
      const pinned = bridge.toggleWorkspacePin(id)
      if (pinned && typeof ctx?.workspaces?.insertBefore === 'function') {
        const first = (workspaceSnapshot(ctx).items ?? []).find(item => workspaceIdOf(item) !== id)
        if (first !== undefined) await ctx.workspaces.insertBefore(id, workspaceIdOf(first))
      }
      return pinned
    },
    async pinSession(workspaceId, sessionId) {
      const id = String(sessionId)
      const pinned = bridge.togglePin(id)
      if (pinned && typeof ctx?.workspaces?.insertSessionBefore === 'function') {
        const workspace = (workspaceSnapshot(ctx).items ?? []).find(item => workspaceIdOf(item) === String(workspaceId))
        const first = (workspace?.sessionIds ?? []).find(candidate => String(candidate) !== id)
        if (first !== undefined) await ctx.workspaces.insertSessionBefore(String(workspaceId), id, String(first))
      }
      return pinned
    },
    async renameWorkspace(workspaceId, title) {
      if (typeof ctx?.workspaces?.rename !== 'function') throw new Error('当前 DSH 未提供工作区编辑接口')
      return ctx.workspaces.rename(String(workspaceId), String(title).trim())
    },
    async removeWorkspace(workspaceId) {
      if (typeof ctx?.workspaces?.delete !== 'function') throw new Error('当前 DSH 未提供移除项目接口')
      return ctx.workspaces.delete(String(workspaceId))
    },
    async archiveWorkspace(workspaceId) {
      if (typeof ctx?.workspaces?.archiveSession !== 'function') throw new Error('当前 DSH 未提供归档接口')
      const workspace = (workspaceSnapshot(ctx).items ?? []).find(item => workspaceIdOf(item) === String(workspaceId))
      if (workspace === undefined) throw new Error('工作区不存在或已被移除')
      const archived = new Set((workspaceSnapshot(ctx).archivedSessionIds ?? []).map(String))
      const ids = sanitizeIds(workspace.sessionIds ?? []).filter(id => !archived.has(id))
      for (const id of ids) await ctx.workspaces.archiveSession(id)
      return { archived: ids.length }
    },
    createWorktree: createPermanentWorktree,
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
.dsh-context-dialog-backdrop{position:fixed;inset:0;z-index:2147483647;display:flex;align-items:center;justify-content:center;background:rgba(0,0,0,.32);padding:24px}
.dsh-context-dialog{width:min(460px,100%);border:1px solid var(--dsw-alias-border-l2,#d9d9de);border-radius:16px;background:var(--dsw-alias-bg-module-platform,#fff);box-shadow:0 18px 60px rgba(0,0,0,.22);padding:18px;color:var(--dsw-alias-label-primary,#1f2025);font:13px/1.45 system-ui,-apple-system,"Segoe UI",sans-serif}
.dsh-context-dialog h2{margin:0 0 14px;font-size:17px}
.dsh-context-field{display:flex;flex-direction:column;gap:6px;margin:11px 0}
.dsh-context-field label{font-weight:600}
.dsh-context-field input{box-sizing:border-box;width:100%;border:1px solid var(--dsw-alias-border-l2,#d9d9de);border-radius:9px;padding:8px 10px;background:var(--dsw-alias-bg-page-primary,#fff);color:inherit;font:inherit}
.dsh-context-field input[readonly]{opacity:.7}
.dsh-context-dialog-actions{display:flex;justify-content:flex-end;gap:8px;margin-top:16px}
.dsh-context-dialog-actions button{border:1px solid var(--dsw-alias-border-l2,#d9d9de);border-radius:9px;padding:7px 13px;background:transparent;color:inherit;cursor:pointer;font:inherit}
.dsh-context-dialog-actions button.primary{border-color:#3d6fd6;background:#3d6fd6;color:#fff}
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
  marker.title = '已置顶'
  marker.textContent = '●'
  title.appendChild(marker)
}

function candidateTitle(summary) {
  if (summary?.blank === true) return '新会话'
  return sessionTitleOf(summary)
}

function decorateRows(ctx, bridge) {
  if (typeof document === 'undefined') return
  const workspaces = workspaceSnapshot(ctx).items ?? []
  const sessions = sessionsSnapshot(ctx)
  const byId = sessions.byId ?? Object.fromEntries(sessionItems(sessions).map(item => [sessionIdOf(item), item]))
  const projectRows = [...document.querySelectorAll('[role="treeitem"]')].filter(row => classContains(row, '_projectRow'))
  const usedWorkspaceIds = new Set()

  for (const row of projectRows) {
    const title = rowTitle(row)
    const workspace = workspaces.find(item => !usedWorkspaceIds.has(workspaceIdOf(item)) && workspaceTitleOf(item) === title)
    if (workspace === undefined) continue
    const workspaceId = workspaceIdOf(workspace)
    usedWorkspaceIds.add(workspaceId)
    row.dataset.dshWorkspaceId = workspaceId
    const section = closestClass(row.parentElement, '_groupSection')
    if (section !== null) section.dataset.dshWorkspaceId = workspaceId
    addPinMarker(row, bridge.isWorkspacePinned(workspaceId))

    const rows = section === null
      ? []
      : [...section.querySelectorAll('[role="treeitem"]')].filter(candidate => classContains(candidate, '_sessionRow'))
    const available = sanitizeIds(workspace.sessionIds ?? [])
    const usedSessionIds = new Set()
    for (const sessionRow of rows) {
      const titleText = rowTitle(sessionRow)
      const sessionId = available.find(id => {
        if (usedSessionIds.has(id)) return false
        const summary = byId[id]
        if (summary?.blank === true) return titleText === '新会话' || titleText === 'New Session'
        return candidateTitle(summary) === titleText
      }) ?? available.find(id => !usedSessionIds.has(id))
      if (sessionId === undefined) continue
      usedSessionIds.add(sessionId)
      sessionRow.dataset.dshSessionId = sessionId
      sessionRow.dataset.dshWorkspaceId = workspaceId
      addPinMarker(sessionRow, bridge.isPinned(sessionId))
    }
  }

  const allKnownSessions = sessionItems(sessions)
  const usedSessionIds = new Set(
    [...document.querySelectorAll('[data-dsh-session-id]')].map(row => row.dataset.dshSessionId),
  )
  const looseRows = [...document.querySelectorAll('[role="treeitem"]')]
    .filter(row => classContains(row, '_sessionRow') && !row.dataset.dshSessionId)
  for (const row of looseRows) {
    const title = rowTitle(row)
    const summary = allKnownSessions.find(item => {
      const id = sessionIdOf(item)
      return !usedSessionIds.has(id) && (candidateTitle(item) === title || (item?.blank === true && title === 'New Session'))
    })
    if (summary === undefined) continue
    const id = sessionIdOf(summary)
    usedSessionIds.add(id)
    row.dataset.dshSessionId = id
    addPinMarker(row, bridge.isPinned(id))
  }
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

function openFormDialog({ title, fields, confirmLabel = '确定' }) {
  return new Promise(resolve => {
    const backdrop = document.createElement('div')
    backdrop.className = 'dsh-context-dialog-backdrop'
    const dialog = document.createElement('form')
    dialog.className = 'dsh-context-dialog'
    dialog.setAttribute('role', 'dialog')
    dialog.setAttribute('aria-modal', 'true')
    const heading = document.createElement('h2')
    heading.textContent = title
    dialog.appendChild(heading)
    const inputs = {}

    for (const field of fields) {
      const wrapper = document.createElement('div')
      wrapper.className = 'dsh-context-field'
      const label = document.createElement('label')
      label.textContent = field.label
      const input = document.createElement('input')
      input.name = field.name
      input.value = field.value ?? ''
      input.placeholder = field.placeholder ?? ''
      input.readOnly = field.readOnly === true
      input.required = field.required === true
      label.appendChild(input)
      wrapper.appendChild(label)
      dialog.appendChild(wrapper)
      inputs[field.name] = input
    }

    const actions = document.createElement('div')
    actions.className = 'dsh-context-dialog-actions'
    const cancel = document.createElement('button')
    cancel.type = 'button'
    cancel.textContent = '取消'
    const submit = document.createElement('button')
    submit.type = 'submit'
    submit.className = 'primary'
    submit.textContent = confirmLabel
    actions.append(cancel, submit)
    dialog.appendChild(actions)
    backdrop.appendChild(dialog)
    document.body.appendChild(backdrop)

    let settled = false
    const finish = value => {
      if (settled) return
      settled = true
      backdrop.remove()
      resolve(value)
    }
    cancel.addEventListener('click', () => finish(null))
    backdrop.addEventListener('mousedown', event => {
      if (event.target === backdrop) finish(null)
    })
    backdrop.addEventListener('keydown', event => {
      if (event.key === 'Escape') finish(null)
    })
    dialog.addEventListener('submit', event => {
      event.preventDefault()
      const values = Object.fromEntries(Object.entries(inputs).map(([name, input]) => [name, input.value]))
      finish(values)
    })
    const firstEditable = Object.values(inputs).find(input => !input.readOnly)
    firstEditable?.focus()
    firstEditable?.select()
  })
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

function runMenuAction(menu, action) {
  menu.remove()
  Promise.resolve()
    .then(action)
    .catch(error => showToast(error?.message ?? String(error), 'error'))
}

function workspaceById(ctx, id) {
  return (workspaceSnapshot(ctx).items ?? []).find(item => workspaceIdOf(item) === String(id))
}

function sessionById(ctx, id) {
  const snapshot = sessionsSnapshot(ctx)
  return snapshot.byId?.[String(id)] ?? sessionItems(snapshot).find(item => sessionIdOf(item) === String(id))
}

function showWorkspaceMenu(ctx, bridge, row, x, y, scheduleDecorate) {
  const workspaceId = row.dataset.dshWorkspaceId
  const workspace = workspaceById(ctx, workspaceId)
  if (!workspaceId || workspace === undefined) return
  const menu = document.createElement('div')
  menu.className = 'dsh-context-menu'
  menu.setAttribute('role', 'menu')
  const pinned = bridge.isWorkspacePinned(workspaceId)

  const pin = makeMenuItem(pinned ? '取消置顶' : '置顶', () => runMenuAction(menu, async () => {
    const next = await bridge.pinWorkspace(workspaceId)
    scheduleDecorate()
    showToast(next ? '工作区已置顶' : '已取消置顶')
  }))
  const edit = makeMenuItem('编辑', () => runMenuAction(menu, async () => {
    const values = await openFormDialog({
      title: '编辑工作区',
      fields: [
        { name: 'title', label: '名称', value: workspaceTitleOf(workspace), required: true },
        { name: 'path', label: '文件夹', value: workspace.path ?? workspace.cwd ?? '', readOnly: true },
      ],
      confirmLabel: '保存',
    })
    if (values === null) return
    const title = values.title.trim()
    if (title === '') throw new Error('工作区名称不能为空')
    if (title !== workspaceTitleOf(workspace)) await bridge.renameWorkspace(workspaceId, title)
    showToast('工作区已更新')
  }))
  const archive = makeMenuItem('归档聊天', () => runMenuAction(menu, async () => {
    const count = sanitizeIds(workspace.sessionIds ?? []).length
    if (count === 0) return showToast('此工作区没有可归档的聊天')
    if (!window.confirm(`归档“${workspaceTitleOf(workspace)}”中的全部聊天？聊天可以在归档管理中恢复。`)) return
    const result = await bridge.archiveWorkspace(workspaceId)
    showToast(`已归档 ${result.archived} 个聊天`)
  }))
  const worktree = makeMenuItem('创建永久工作树', () => runMenuAction(menu, async () => {
    const suggested = workspaceTitleOf(workspace)
      .trim()
      .replace(/[^A-Za-z0-9._-]+/gu, '-')
      .replace(/^[-.]+|[-.]+$/gu, '')
      .slice(0, 48) || 'worktree'
    const values = await openFormDialog({
      title: '创建永久工作树',
      fields: [
        { name: 'name', label: '工作树名称', value: `${suggested}-branch`, required: true },
        { name: 'baseCommit', label: '基准提交（可选）', value: '', placeholder: '默认使用 HEAD' },
        { name: 'path', label: '仓库目录', value: workspace.path ?? workspace.cwd ?? '', readOnly: true },
      ],
      confirmLabel: '创建',
    })
    if (values === null) return
    const result = await bridge.createWorktree(workspaceId, values.name.trim(), values.baseCommit.trim())
    await ctx?.workspaces?.refresh?.()
    showToast(`永久工作树已创建：${result.path}`)
  }))
  const remove = makeMenuItem('移除项目', () => runMenuAction(menu, async () => {
    if (!window.confirm(`从 DSH 移除工作区“${workspaceTitleOf(workspace)}”？文件夹和聊天记录不会删除，聊天会进入未分组。`)) return
    await bridge.removeWorkspace(workspaceId)
    showToast('工作区登记已移除')
  }), { danger: true })

  menu.append(pin, edit, makeMenuItem('---'), archive, worktree, makeMenuItem('---'), remove)
  placeAndOpenMenu(menu, x, y)
}

function showSessionMenu(ctx, bridge, row, x, y, scheduleDecorate) {
  const sessionId = row.dataset.dshSessionId
  if (!sessionId) return
  const workspaceId = row.dataset.dshWorkspaceId
    ?? (workspaceSnapshot(ctx).items ?? []).find(item => (item.sessionIds ?? []).map(String).includes(sessionId))?.workspaceId
  const summary = sessionById(ctx, sessionId)
  const pinned = bridge.isPinned(sessionId)
  const menu = document.createElement('div')
  menu.className = 'dsh-context-menu'
  menu.setAttribute('role', 'menu')

  const pin = makeMenuItem(pinned ? '取消置顶' : '置顶', () => runMenuAction(menu, async () => {
    let next
    if (workspaceId) next = await bridge.pinSession(String(workspaceId), sessionId)
    else next = bridge.togglePin(sessionId)
    scheduleDecorate()
    showToast(next ? '聊天已置顶' : '已取消置顶')
  }))
  const rename = makeMenuItem('重命名', () => runMenuAction(menu, async () => {
    const values = await openFormDialog({
      title: '重命名聊天',
      fields: [{ name: 'title', label: '名称', value: sessionTitleOf(summary), required: true }],
      confirmLabel: '保存',
    })
    if (values === null) return
    const session = ctx?.sessions?.binding?.(sessionId)?.session
    if (session === undefined) throw new Error('当前会话尚未就绪')
    unwrapResult(await session.rename(values.title.trim()), '重命名失败')
    showToast('聊天已重命名')
  }))
  const fork = makeMenuItem('分支聊天', () => runMenuAction(menu, async () => {
    if (typeof ctx?.sessions?.fork !== 'function') throw new Error('当前 DSH 未提供会话分支接口')
    const childId = await ctx.sessions.fork({ sessionId, increaseTitle: true })
    ctx.sessions.open?.(childId)
  }))
  const archive = makeMenuItem('归档聊天', () => runMenuAction(menu, async () => {
    if (typeof ctx?.workspaces?.archiveSession !== 'function') throw new Error('当前 DSH 未提供归档接口')
    await ctx.workspaces.archiveSession(sessionId)
    showToast('聊天已归档')
  }))
  const remove = makeMenuItem('删除聊天', () => runMenuAction(menu, async () => {
    const manager = window.__dshSessionManager
    if (typeof manager?.deleteSession !== 'function') throw new Error('删除接口未就绪，请使用会话菜单中的删除功能')
    await manager.deleteSession(sessionId)
  }), { danger: true })

  menu.append(pin, rename, fork, archive, makeMenuItem('---'), remove)
  placeAndOpenMenu(menu, x, y)
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
  let scheduled = false
  const scheduleDecorate = () => {
    if (scheduled) return
    scheduled = true
    queueMicrotask(() => {
      scheduled = false
      decorateRows(ctx, bridge)
    })
  }

  const onContextMenu = event => {
    const row = event.target instanceof Element ? event.target.closest('[role="treeitem"]') : null
    if (row === null) return
    const workspaceRow = classContains(row, '_projectRow')
    const sessionRow = classContains(row, '_sessionRow')
    if (!workspaceRow && !sessionRow) return
    scheduleDecorate()
    event.preventDefault()
    event.stopPropagation()
    if (workspaceRow) showWorkspaceMenu(ctx, bridge, row, event.clientX, event.clientY, scheduleDecorate)
    else showSessionMenu(ctx, bridge, row, event.clientX, event.clientY, scheduleDecorate)
  }
  const onPointerDown = event => {
    const menu = document.querySelector('.dsh-context-menu')
    if (menu !== null && event.target instanceof Node && !menu.contains(event.target)) menu.remove()
  }
  const onKeyDown = event => {
    if (event.key === 'Escape') document.querySelector('.dsh-context-menu')?.remove()
  }
  const observer = new MutationObserver(scheduleDecorate)
  observer.observe(document.body, { childList: true, subtree: true })
  document.addEventListener('contextmenu', onContextMenu, true)
  document.addEventListener('pointerdown', onPointerDown, true)
  document.addEventListener('keydown', onKeyDown, true)
  const unsubscribeWorkspaces = ctx?.workspaces?.list?.subscribe?.(scheduleDecorate)
  const unsubscribeSessions = ctx?.sessions?.list?.subscribe?.(scheduleDecorate)
  scheduleDecorate()

  return () => {
    observer.disconnect()
    document.removeEventListener('contextmenu', onContextMenu, true)
    document.removeEventListener('pointerdown', onPointerDown, true)
    document.removeEventListener('keydown', onKeyDown, true)
    if (typeof unsubscribeWorkspaces === 'function') unsubscribeWorkspaces()
    if (typeof unsubscribeSessions === 'function') unsubscribeSessions()
    document.querySelector('.dsh-context-menu')?.remove()
    document.querySelector('.dsh-context-dialog-backdrop')?.remove()
  }
}

export const inject = ['workspaces', 'sessions']

export function apply(ctx) {
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

export { createBridge }

