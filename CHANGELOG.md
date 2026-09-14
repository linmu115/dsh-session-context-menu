# Changelog

## 0.3.1 — 2026-09-05

- Replace the popup-based Maintenance handoff with direct `delete-session`.
  Maintenance resolves the native ID within the active projection run, creates
  its existing delete checkpoint/tombstone, and returns a deletion receipt.
  Only after that receipt does SCM archive the current native row to hide it.
  No browser popup/confirmation, direct file deletion, or Codex source mutation.
- Preserve pending-delete semantics and report post-receipt UI failures separately
  from canonical deletion. Do not hide a row when the Engine request fails.
- Resolve same-title sessions through the official row click and public
  Session Controller selection, confirmed by aria-selected. Right-click selects
  that conversation. Never read React internals or guess from stale dataset IDs.
- Invalidate destructive actions when selection changes after menu creation;
  show a reason when identity cannot be established instead of silent disabling.
- Add targeted selected-ID, stale-menu, no-popup and deletion-receipt regressions.
  User click acceptance remains pending; no model/compaction or Launcher changes.

## 0.3.0 — 2026-09-05

### RC1 thin context-menu enhancement

- Replace duplicated rename/fork/archive/workspace-delete forms and handlers
  with a link to the clicked row's official RC1 menu. Official behavior and
  confirmation dialogs remain owned by DSH.
- Keep ID-based pin storage and official reorder calls. Record a new pin only
  after reordering succeeds. Pinning moves a row to the top at that moment;
  subsequent DSH manual/recency ordering is not overridden.
- Keep confirmed workspace batch archive, using the same uiWorkspace service
  as the official UI. Skip already archived/moved sessions and arrivals after
  confirmation; report partial progress on failure without automatic retries.
- Replace obsolete __dshSessionManager deletion with "Manage / delete in
  Maintenance". Use its same-origin authenticated dashboard proxy; never call
  a delete endpoint or read Engine credentials. Reserve a window in the click
  gesture, close it on failure, and reject non-HTTP(S) returned links.
- Remove the unsupported permanent-worktree menu and private Host HTTP route.
  The Host entry is now inert and requires no filesystem or workspace registry.
- Remove positional and first-title-match ID guessing and stale dataset reuse.
  Ambiguous rows retain the official menu; ID-based enhancements are disabled.
- Match exact official zh/en action accessibility labels, not the first button:
  the Ungrouped "+" action must never be mistaken for a menu.
- Shift+right-click bypasses this enhancement. Unknown DOM is not intercepted.
  Disposal removes listeners, markers and pending decoration; conversation
  streaming mutations do not trigger unrelated sidebar scans.

### Boundaries

- Targets DSH 0.1.2-rc.1 only; no RC2/Alpha2 compatibility layer. Peers remain
  open (*) as requested; capability/DOM checks guard the UI rather than
  package version locks.
- Keeps existing pin storage keys. The published browser bridge is version 3;
  duplicated renameWorkspace/removeWorkspace/createWorktree methods are removed.
- No changes to Maintenance, Canonical/Codex source, Launcher, model settings,
  official context compression, or projection adapters.
- Automated tests cover action boundaries and DOM integration. Real RC1 browser
  click acceptance remains a user check; this release is not an assertion that
  every upstream DOM variant is supported.

## 0.2.2 — 2026-09-04

- Rebuild existing context-menu entry for DSH 0.1.2-rc.1.
