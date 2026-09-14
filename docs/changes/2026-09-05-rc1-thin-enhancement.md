# RC1 context menu: change boundaries and acceptance

## Official baseline

Inspected installed @deepseek-ai/dsh-client-ui-workspace 0.1.2-rc.1:

- SessionNodeItem supplies rename/fork/archive in a Menu anchored to a button.
- WorkspaceHeader supplies rename/delete; Ungrouped has no such menu.
- The official aria labels are "Session actions for {name}" /
  "Workspace actions for {name}" and their published Chinese equivalents.
- The official archive callback calls uiWorkspace.archiveSession.
- Ordering uses workspaces.insertBefore / insertSessionBefore.

Upstream package: https://github.com/deepseek-ai/deepseek-harness/tree/master/packages/client/ui-workspace
The installed release bundle, not a moving master branch, was the API baseline.

## Maintenance boundary

Use its existing POST /dsh-session-maintenance/api:

    { operation: "delete-session", sessionId: "<native DSH ID>" }

Maintenance 0.2.16 resolves the native ID within its server-attested run and
performs canonical deletion using the existing checkpoint/tombstone policy.
SCM only hides the native row after a matching deletion receipt. Pending writes
and a later list-refresh failure have distinct truthful messages. No popup is
opened. SCM never handles Engine credentials or modifies Codex source files.

RC1 row selection is synchronous in Session Controller; aria-selected can follow
on the next render. SCM invokes the official row click and waits at most 256 ms
for that confirmation. Unknown/changed identity never enables a guessed delete.

## Focused acceptance points

1. Right-click a normal session -> official operations -> rename/fork/archive.
   Confirm the original DSH menu/dialog appears for the clicked row.
2. Pin/unpin a session or workspace; old local pin data stays readable. Check
   initial move-to-top; subsequent sorting remains under official control.
3. On a disposable workspace, cancel batch archive (no calls), then confirm
   (only confirmed, still-owned, unarchived IDs are archived).
4. On a disposable Maintenance test session, Delete -> canonical tombstone and
   hidden native row without popup. Verify the ID in Maintenance's status entry.
   An offline/mismatched response must not hide the row.
5. Same-title rows -> right-click selects the actual row and enables ID actions.
   Switch selection before using a stale menu -> no mutation. Unknown identity
   explains the disabled entries; Ungrouped/Shift/disposal behavior stays intact.

Only drill into a failing point. Do not bulk-delete real sessions to test.
Automated checks pass; installed-profile acceptance is performed by the user.
