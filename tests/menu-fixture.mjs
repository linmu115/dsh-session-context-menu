// Shared RC1/RC2 menu fixture. Moved verbatim out of rc1-thin-menu.test.mjs so
// additional menu behaviour can be tested against the same rows, snapshot and
// bridge wiring without duplicating it.
import assert from 'node:assert/strict'
import { parseHTML } from 'linkedom'
import { createBridge, showEnhancementMenu } from '../src/client.js'

export const tick = () => new Promise(resolve => setImmediate(resolve))

export function fixture({ duplicate = false } = {}) {
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
