# 0.3.4-rc2.1

Add one workspace-only right-click entry, 「将当前工作区加入 sessionmaintenance」, that hands the workspace identity to the Maintenance plugin through the `globalThis.dshSessionMaintenance` bridge (apiVersion 1). The handle is re-read and re-validated on every call; a missing, older or malformed bridge renders the entry disabled and never reaches the host menu as an exception. Session menus are unchanged.

# 0.3.3-rc2.1

Build from the installed release source, bind the DSH 0.1.5-rc.2 UI peer cohort, and preserve existing behavior. Checked official RC2 DOM markers and public workspace operations; run existing behavior and package checks before packing.
