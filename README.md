# dsh-session-context-menu

DSH **0.2.0-rc.2** 的会话与工作区右键增强插件，复用官方已有的管理界面。当前候选版本 **0.3.5-dsh02.1**；候选构建不代表已安装或通过真实 UI 验收。

## 当前功能

### 会话右键

- **官方会话操作…**：打开所点击行的官方菜单，使用 DSH 自己的重命名、
  分支和归档交互。不是另一套分支或会话持久化实现。
- **置顶／取消置顶**：调用官方 `uiWorkspace.pinSession/unpinSession`，读取宿主置顶状态。
  与官方菜单中的置顶保持一致，支持未分组会话，不另绘重复标记。
- **删除会话**：直接向 Session Maintenance 提交真源删除；不打开新窗口或管理页。
  收到删除回执后通过官方归档接口隐藏当前行。删除的是 Maintenance 中的会话，
  不修改 Codex 原始会话。沿用 Maintenance 的 Checkpoint、逻辑删除与恢复策略。
  有未完成写入时会明确提示“已登记删除，等待现有写入收尾”，不冒充最终完成。

### 工作区右键

- **官方工作区操作…**：打开官方重命名／移除工作区菜单，保留官方确认边界。
- **置顶／取消置顶**：保留已有 ID 置顶记录和官方排序调用。
- **归档此工作区全部聊天…**：先确认，仅归档确认时已列出的未归档会话；
  新到达、已迁出或已归档会话不处理。中途失败会显示已完成数量。
- **将当前工作区加入 sessionmaintenance**：把该工作区的身份交给 Session Maintenance，
  由它建立工作区映射。本插件只调用 `globalThis.dshSessionMaintenance` 桥，不自建桥、
  不直接调用 Maintenance 路由。每次点击前重新读取并校验 `apiVersion === 1`，
  因此桥在插件之后装载或被替换都能生效。桥缺失、版本不符或不含 `joinWorkspace` 时，
  该项显示为禁用并给出原因，其余工作区操作不受影响；调用失败只在菜单内提示，
  不会向宿主菜单抛出异常。仅出现在工作区菜单，会话菜单不显示。重复加入会收到
  「已在 sessionmaintenance 中，无需重复加入」而不是首次加入的提示。

## 已移除的重复或失效能力

- 自建的重命名表单和 fork/archive/workspace-delete 处理逻辑。
- 旧 window.__dshSessionManager 删除桥。
- 依赖未配置 dsh-worktree 的永久工作树菜单与私有 Host HTTP 接口。

Host 入口不再请求 webServer、workspaceRegistry 或文件系统操作权限。

## 安全与适配边界

- 当前候选限定 DSH 0.2.0-rc.2 的官方工作区 UI 依赖。
- 使用该发行渲染的 `data-row-key` 与当前公开快照确认会话／工作区 ID，支持同名与未命名会话。
  右键不切换正在查看的会话。原生键缺失对象或格式不正确时不按标题猜测。
- 执行动作前重新验证行、会话与工作区归属；虚拟列表复用、移出或删除后的旧菜单不能操作另一会话。
  保留旧版无 row-key 的兼容分支及回归用例，但不据此承诺旧宿主全量兼容。
- **Shift + 右键**绕过本插件，让浏览器或其他插件处理。
- 无法识别官方菜单按钮时不截获右键，尤其不会把未分组的“新建会话”当菜单。
- Maintenance 没装或离线时会提示失败，不走旧删除接口、不执行删除。
- 工作区加入 sessionmaintenance 同样依赖 Maintenance 侧的桥；桥未就绪时该项禁用并说明原因，
  其它右键操作（含官方工作区操作、置顶、批量归档）行为不变。
- 不直接写数据库或会话文件。仅授权的删除请求由 Maintenance 修改其真源；
  不修改 Codex 真源、Launcher、模型或上下文压缩配置。

## 安装与验收

1. 使用下方命令构建并打包，将本地 `.tgz` 作为插件安装到已核验的目标 DSH 0.2.0-rc.2 Profile。
2. 将 `dsh-session-context-menu` 放入该 Profile 的 `dsh.profile.bundles`，重载后右键会话或工作区行即可使用。
3. 要删除真源会话，需启用已完成 0.2 宿主绑定且具备 `delete-session` 能力的 Session Maintenance；缺少能力时明确失败，不降级为本地删除。
4. 使用官方归档时，当前 Maintenance 会同步撤销关联引用并归档该会话主干图；规则由 Maintenance 执行，SCM 不另存图关系。归档与真源逻辑删除是不同操作。

RC2 适配记录见 [CHANGELOG-RC2](CHANGELOG-RC2.md)。右键、同名定位、批量归档与真源删除的早期交互步骤保留在[历史验收与边界](docs/changes/2026-09-05-rc1-thin-enhancement.md)，其中 RC1 版本记录不能代替当前运行组合验收。

## 本地数据

保留既有 localStorage 键，不清空旧标记：

- dsh.session.context-menu.pins.v1
- dsh.workspace.context-menu.pins.v1

工作区置顶仍按浏览器来源隔离。0.2 会话置顶以宿主快照为准，旧会话本地标记仅保留供旧兼容分支使用，不自动写入宿主或影响其现有排序。

## 开发

需要 Node.js >=24.7.0。安装依赖时不自动填入另一版本宿主 peer。

    pnpm install --config.auto-install-peers=false
    pnpm build
    pnpm check
    pnpm test
    npm pack

DOM 回归用 linkedom（仅开发依赖），发布客户端不包含它。
详细变更见 [CHANGELOG](CHANGELOG.md)。

## 菜单动作扩展

菜单宿主 API 1 允许插件按 owner 注册会话动作，统一使用已核验的行身份及 SCM 菜单生命周期。接口、加载顺序和注销规则见 [接入文档](docs/menu-action-host.md)。


## 0.2.0-rc.2 验证

基于旧已交付 0.3.4-rc2.1 继续维护。构建、语法与 51 项合成回归通过，包含新固定身份、原生置顶、虚拟行复用和旧动作生命周期。仍保留右键增强菜单；官方更多操作按钮委托给原生菜单。真实 0.2 实例菜单交互和 Maintenance 删除联动未验收。
