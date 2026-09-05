# dsh-session-context-menu

DSH **0.1.2-rc.1** 的薄右键增强插件，不再重复维护官方已有的会话管理界面。

## 当前功能（0.3.0）

### 会话右键

- **官方会话操作…**：打开所点击行的官方菜单，使用 DSH 自己的重命名、
  分支和归档交互。不是另一套分支或会话持久化实现。
- **置顶／取消置顶**：按 ID 保存本地标记，置顶时调用官方接口移到顶部。
  后续手动排序、按最近更新排序仍由 DSH 管理，不强行固定位置。
- **在 Maintenance 中管理／删除…**：通过已安装的 Session Maintenance
  代理打开目标会话的维护页。删除由维护页确认执行，右键插件不直接删会话。

### 工作区右键

- **官方工作区操作…**：打开官方重命名／移除工作区菜单，保留官方确认边界。
- **置顶／取消置顶**：保留已有 ID 置顶记录和官方排序调用。
- **归档此工作区全部聊天…**：先确认，仅归档确认时已列出的未归档会话；
  新到达、已迁出或已归档会话不处理。中途失败会显示已完成数量。

## 已移除的重复或失效能力

- 自建的重命名表单和 fork/archive/workspace-delete 处理逻辑。
- 旧 window.__dshSessionManager 删除桥。
- 依赖未配置 dsh-worktree 的永久工作树菜单与私有 Host HTTP 接口。

Host 入口不再请求 webServer、workspaceRegistry 或文件系统操作权限。

## 安全与适配边界

- 仅面向 RC1，不维护旧 DSH 的兼容分支；peer 仍为 *，不硬锁版本。
- RC1 官方行未暴露稳定 ID，插件只在标题及归属能唯一匹配时启用 ID 操作。
  不根据列表位置、旧 DOM 属性或第一个同名会话猜测 ID。
- 同名/无法定位时，官方菜单仍可用；置顶和维护跳转可能不可用。
- **Shift + 右键**绕过本插件，让浏览器或其他插件处理。
- 无法识别官方菜单按钮时不截获右键，尤其不会把未分组的“新建会话”当菜单。
- Maintenance 没装或离线时会提示失败，不走旧删除接口、不执行删除。
- 不修改 Codex 真源、Maintenance 内容、Launcher、模型或上下文压缩配置。

## 安装与验收

安装构建包，并将 dsh-session-context-menu 放入目标 Profile 的
dsh.profile.bundles。包更新后按 DSH 插件更新流程重载对应 Profile。
Session Maintenance 为可选协作方，仅维护页入口依赖它。

右键菜单／官方菜单切换、批量归档及维护页跳转需在实际 RC1 页面人工验收。
针对性步骤见 [验收与边界](docs/changes/2026-09-05-rc1-thin-enhancement.md)。

## 本地数据

继续使用既有 localStorage 键，不迁移或清空已有标记：

- dsh.session.context-menu.pins.v1
- dsh.workspace.context-menu.pins.v1

数据按浏览器来源隔离；这不是 Maintenance 真源中的跨浏览器置顶关系。

## 开发

    pnpm install --config.auto-install-peers=false
    pnpm build
    pnpm check
    pnpm test

DOM 回归用 linkedom（仅开发依赖），发布客户端不包含它。
详细变更见 [CHANGELOG](CHANGELOG.md)。
