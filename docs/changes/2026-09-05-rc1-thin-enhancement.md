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

    { operation: "dashboard", sessionId: "<native DSH ID>" }

Maintenance resolves the native ID and issues the management URL. This plugin
does not implement delete, unlink, checkpoint, source mutation, or raw Engine
authentication. If Maintenance is absent/offline the failure is visible and no
deletion occurs. The menu label deliberately does not promise direct deletion.

## Focused acceptance points

1. Right-click a normal session -> official operations -> rename/fork/archive.
   Confirm the original DSH menu/dialog appears for the clicked row.
2. Pin/unpin a session or workspace; old local pin data stays readable. Check
   initial move-to-top; subsequent sorting remains under official control.
3. On a disposable workspace, cancel batch archive (no calls), then confirm
   (only confirmed, still-owned, unarchived IDs are archived).
4. Manage/delete in Maintenance -> correct management page, no immediate delete.
   Backend failures must not leave an empty reserved page.
5. Same-title rows / Ungrouped / Shift+right-click -> no guessed-ID mutation
   or accidental new session. Disable/re-enable -> no duplicate menu handlers.

Only drill into a failing point. Do not bulk-delete real sessions to test.
No current Profile replacement or service restart is performed by this commit.
