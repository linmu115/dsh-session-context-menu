# Session menu action host, API 1

The `window.__dshSessionContextMenu` bridge is `version: 4` in the DSH 0.2
candidate. `menuApiVersion: 1` and its registration/lifetime contract are unchanged.
On the native host, `togglePin(sessionId)` now returns a Promise of the resulting
pin state; callers must await it. `pinSession` was already asynchronous.
Pin reads use the host snapshot and never import legacy local markers.

## Registration

```js
const dispose = bridge.registerActions('dsh-session-maintenance', [{
  id: 'dashboard',
  label: '在维护看板中打开',
  getState: target => ({ enabled: true }), // optional and synchronous
  run: async (target, { signal }) => {
    // Invoke the plugin's existing same-origin proxy using target.nativeSessionId.
    // Respect signal before further work or UI changes; return { message } or void.
  },
}])
```

`owner` is a nonempty string. Each owner's action IDs must be nonempty and
unique; label and run are required. Invalid registration throws without
replacing the previous valid owner. Registering an owner replaces its whole
action set and aborts its old invocation signals. The returned disposer is
idempotent; an old disposer cannot remove that owner's newer registration.

The target is frozen `{ nativeSessionId: string, workspaceId: string | null }`.
The host obtains the native row key, validates the public session snapshot, and
rechecks the row identity and workspace immediately before invocation. It accepts no
consumer-supplied logical ID and never resolves a session from a title. A
missing session identity disables plugin actions. Workspace menus retain their
existing behavior and do not receive these session actions.

Optional `getState(target)` returns `{ visible?, enabled?, disabledReason? }`.
`visible: false` omits the action; `enabled: false` or a nonempty disabledReason
disables it. A disabled reason is shown in the button and title. Predicate
errors disable only that action with an explanation. The predicate runs again
at click time and must be synchronous and free of side effects.

`run` receives an AbortSignal that aborts when the owner is replaced/removed or
the host is disposed. Abort is a cancellation request, not proof a remote
operation was rolled back. Consumers must preserve their own receipt rules and
stop subsequent work when aborted. Host-generated success/error feedback is
suppressed after cancellation or disposal; an active failure is shown as an
error without hiding the native row. Existing Maintenance deletion still
validates its receipt before requesting official UI hiding.

## Loading order and disposal

Listen first, then inspect the current global bridge. Each host activation
emits `dsh-session-context-menu:ready` with detail `{ menuApiVersion: 1, bridge }`.
Host disposal removes its global and emits `dsh-session-context-menu:unavailable`
with the same detail. Reload disposes the previous host before publishing the
new one. Registrations are not copied across hosts; consumers re-register.

```js
let current
let unregister
function connect(bridge) {
  if (bridge?.menuApiVersion !== 1 || bridge === current) return
  unregister?.()
  current = bridge
  unregister = bridge.registerActions('my-plugin', actions)
}
const ready = event => connect(event.detail.bridge)
const unavailable = event => {
  if (event.detail.bridge !== current) return
  unregister?.()
  unregister = undefined
  current = undefined
}
window.addEventListener('dsh-session-context-menu:ready', ready)
window.addEventListener('dsh-session-context-menu:unavailable', unavailable)
connect(window.__dshSessionContextMenu)
// On consumer unload:
const disposeConsumer = () => {
  unregister?.()
  window.removeEventListener('dsh-session-context-menu:ready', ready)
  window.removeEventListener('dsh-session-context-menu:unavailable', unavailable)
}
```

A consumer using this host must stop installing its competing document menu
listener. If the host is absent, retain independent settings/sidebar entry
points; do not claim API 1 exists merely because the old bridge exists.
Maintenance consumer integration is a separate dependent change.

## Interaction

Right-click retains the native-menu/pin/delete entries and appends registered
session actions in registration order. Shift-right-click still passes through.
Context Menu key and Shift+F10 open from the focused row. Arrow keys, Home and
End move between enabled buttons; native button Enter/Space activation remains
available. Escape closes and returns focus to the row; Tab dismisses the menu.
Right-click no longer changes the viewed session on 0.2. The legacy no-key
fallback retains its delayed-selection cancellation guard. Unload disconnects observers/list subscriptions,
removes listeners and menus, and aborts pending plugin actions.
