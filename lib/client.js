window.__ModuleLoader__.load({ id: "dsh-session-context-menu", factory: (require) => {
var module = { exports: {} }; var exports = module.exports;
Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });
const STORAGE_KEY = "dsh.session.context-menu.pins.v1";
const WORKSPACE_STORAGE_KEY = "dsh.workspace.context-menu.pins.v1";
const CHANGE_EVENT = "dsh-session-context-menu:change";
const REMOTE_PACKAGE = "dsh-session-context-menu";
function looseCodec() { return { mode: "strict", typeSymbol: "dsh-session-context-menu/json", schema: { parse: (value) => value } }; }
function remoteDescriptor(method, parameters) {
  return { id: `${REMOTE_PACKAGE}#sessionContextMenu/${method}`, service: "sessionContextMenu", namespace: "sessionContextMenu", method, invocation: { kind: "direct" }, parameters: parameters.map((name) => ({ name, wire: name, source: "json", codec: looseCodec() })), result: looseCodec() };
}
const WORKTREE_REMOTE = { package: REMOTE_PACKAGE, descriptors: [remoteDescriptor("createWorktree", ["workspaceId", "name", "baseCommit"])] };
function sanitizeIds(value) {
  if (!Array.isArray(value)) return [];
  const result = [];
  const seen = new Set();
  for (const item of value) {
    const id = String(item ?? "").trim();
    if (id === "" || seen.has(id)) continue;
    seen.add(id);
    result.push(id);
  }
  return result;
}
function readPins() {
  try { return sanitizeIds(JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "[]")); }
  catch { return []; }
}
function readWorkspacePins() {
  try { return sanitizeIds(JSON.parse(localStorage.getItem(WORKSPACE_STORAGE_KEY) ?? "[]")); }
  catch { return []; }
}
function writePins(ids) {
  const next = sanitizeIds(ids);
  localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  window.dispatchEvent(new CustomEvent(CHANGE_EVENT, { detail: { pins: next, workspacePins: readWorkspacePins() } }));
  return next;
}
function writeWorkspacePins(ids) {
  const next = sanitizeIds(ids);
  localStorage.setItem(WORKSPACE_STORAGE_KEY, JSON.stringify(next));
  window.dispatchEvent(new CustomEvent(CHANGE_EVENT, { detail: { pins: readPins(), workspacePins: next } }));
  return next;
}
function sortPinnedIds(ids, pinned) {
  const cleanIds = sanitizeIds(ids);
  const order = new Map(pinned.map((id, index) => [id, index]));
  return cleanIds.map((id, index) => ({ id, index, pin: order.get(id) })).sort((a, b) => {
    const aPinned = a.pin !== undefined, bPinned = b.pin !== undefined;
    if (aPinned !== bPinned) return aPinned ? -1 : 1;
    if (aPinned && bPinned) return a.pin - b.pin;
    return a.index - b.index;
  }).map((entry) => entry.id);
}
function createBridge(createWorktree) {
  return {
    version: 1,
    eventName: CHANGE_EVENT,
    listPinned() { return readPins(); },
    isPinned(sessionId) { return readPins().includes(String(sessionId)); },
    togglePin(sessionId) {
      const id = String(sessionId);
      const pins = readPins();
      const index = pins.indexOf(id);
      if (index === -1) pins.unshift(id); else pins.splice(index, 1);
      return writePins(pins).includes(id);
    },
    sortPinned(sessionIds) {
      return sortPinnedIds(sessionIds, readPins());
    },
    listWorkspacePinned() { return readWorkspacePins(); },
    isWorkspacePinned(workspaceId) { return readWorkspacePins().includes(String(workspaceId)); },
    toggleWorkspacePin(workspaceId) {
      const id = String(workspaceId), pins = readWorkspacePins(), index = pins.indexOf(id);
      if (index === -1) pins.unshift(id); else pins.splice(index, 1);
      return writeWorkspacePins(pins).includes(id);
    },
    sortPinnedWorkspaces(workspaceIds) { return sortPinnedIds(workspaceIds, readWorkspacePins()); },
    createWorktree: createWorktree ?? (async () => ({ ok: false, error: "永久工作树远程接口未就绪" }))
  };
}
const inject = ["remote"];
function apply(ctx) {
  let remoteDispose = null;
  let remoteFailure = null;
  const remoteReady = typeof ctx?.remote?.$mount === "function" ? ctx.remote.$mount(WORKTREE_REMOTE).then((dispose) => {
    remoteDispose = dispose;
    return ctx.get("remote.sessionContextMenu");
  }).catch((error) => {
    remoteFailure = String(error?.message ?? error);
    console.warn("dsh-session-context-menu: worktree remote unavailable", error);
    return null;
  }) : Promise.resolve(null);
  const bridge = createBridge(async (workspaceId, name, baseCommit) => {
    const service = await remoteReady;
    if (service === null || typeof service.createWorktree !== "function") return { ok: false, error: remoteFailure ?? "永久工作树远程接口未就绪" };
    return service.createWorktree(workspaceId, name, baseCommit);
  });
  window.__dshSessionContextMenu = bridge;
  window.dispatchEvent(new CustomEvent(CHANGE_EVENT, { detail: { pins: bridge.listPinned(), workspacePins: bridge.listWorkspacePinned() } }));
  const dispose = () => {
    if (window.__dshSessionContextMenu === bridge) delete window.__dshSessionContextMenu;
    if (typeof remoteDispose === "function") { try { remoteDispose(); } catch {} remoteDispose = null; }
    window.dispatchEvent(new CustomEvent(CHANGE_EVENT, { detail: { pins: [], workspacePins: [] } }));
  };
  if (typeof ctx?.effect === "function") ctx.effect(() => dispose);
}
exports.apply = apply;
exports.inject = inject;
return module.exports; } });
