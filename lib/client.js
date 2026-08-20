window.__ModuleLoader__.load({ id: "dsh-session-context-menu", factory: (require) => {
var module = { exports: {} }; var exports = module.exports;
Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });
const STORAGE_KEY = "dsh.session.context-menu.pins.v1";
const CHANGE_EVENT = "dsh-session-context-menu:change";
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
function writePins(ids) {
  const next = sanitizeIds(ids);
  localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  window.dispatchEvent(new CustomEvent(CHANGE_EVENT, { detail: { pins: next } }));
  return next;
}
function createBridge() {
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
      const ids = sanitizeIds(sessionIds);
      const order = new Map(readPins().map((id, index) => [id, index]));
      return ids.map((id, index) => ({ id, index, pin: order.get(id) })).sort((a, b) => {
        const aPinned = a.pin !== undefined;
        const bPinned = b.pin !== undefined;
        if (aPinned !== bPinned) return aPinned ? -1 : 1;
        if (aPinned && bPinned) return a.pin - b.pin;
        return a.index - b.index;
      }).map((entry) => entry.id);
    }
  };
}
const inject = [];
function apply(ctx) {
  const bridge = createBridge();
  window.__dshSessionContextMenu = bridge;
  window.dispatchEvent(new CustomEvent(CHANGE_EVENT, { detail: { pins: bridge.listPinned() } }));
  const dispose = () => {
    if (window.__dshSessionContextMenu === bridge) delete window.__dshSessionContextMenu;
    window.dispatchEvent(new CustomEvent(CHANGE_EVENT, { detail: { pins: [] } }));
  };
  if (typeof ctx?.effect === "function") ctx.effect(() => dispose);
}
exports.apply = apply;
exports.inject = inject;
return module.exports; } });
