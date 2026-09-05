# dsh-session-context-menu

DSH **0.1.2-rc.1** 的薄右键增强插件，不再重复维护官方已有的会话管理界面。

## 当前功能（0.3.1）

### 会话右键

- **官方会话操作…**：打开所点击行的官方菜单，使用 DSH 自己的重命名、
  分支和归档交互。不是另一套分支或会话持久化实现。
- **置顶／取消置顶**：按 ID 保存本地标记，置顶时调用官方接口移到顶部。
  后续手动排序、按最近更新排序仍由 DSH 管理，不强行固定位置。
- **删除会话**：直接向 Session Maintenance 提交真源删除；不打开新窗口或管理页。
  收到删除回执后通过官方归档接口隐藏当前行。删除的是 Maintenance 中的会话，
  不修改 Codex 原始会话。沿用 Maintenance 的 Checkpoint、逻辑删除与恢复策略。
  有未完成写入时会明确提示“已登记删除，等待现有写入收尾”，不冒充最终完成。

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
- RC1 官方行未暴露稳定 ID。右键会先通过该行的官方点击行为选中会话，
  然后从公开 Session Controller 的 current 取得精确 ID，以 aria-selected 确认。
  因此右键其他会话会同步切换当前会话；不根据标题、位置、旧 DOM 属性或 React 私有字段猜 ID。
- 无法确认官方选择或工作区身份时显示原因，官方菜单仍可用；已打开菜单会在切换会话后失效。
- **Shift + 右键**绕过本插件，让浏览器或其他插件处理。
- 无法识别官方菜单按钮时不截获右键，尤其不会把未分组的“新建会话”当菜单。
- Maintenance 没装或离线时会提示失败，不走旧删除接口、不执行删除。
- 不直接写数据库或会话文件。仅授权的删除请求由 Maintenance 修改其真源；
  不修改 Codex 真源、Launcher、模型或上下文压缩配置。

## 安装与验收

安装构建包，并将 dsh-session-context-menu 放入目标 Profile 的
dsh.profile.bundles。包更新后按 DSH 插件更新流程重载对应 Profile。
Session Maintenance 为可选协作方，仅删除操作依赖其 0.2.16 的 delete-session 能力。
没有给包添加硬版本依赖；不支持此操作的旧版会明确返回失败，不降级为本地删除。

右键菜单／官方菜单切换、同名定位、批量归档及真源删除需在实际 RC1 页面人工验收。
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
