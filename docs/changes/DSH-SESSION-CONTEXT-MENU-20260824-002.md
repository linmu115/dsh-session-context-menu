# DSH-SESSION-CONTEXT-MENU-20260824-002：移除现行 EAC 身份残留

## 背景

`dsh-session-context-menu` 最初在 EAC 4.4.1 承载的 DSH 环境中开发，后来已迁移到官方 DSH `web` profile。源码仍可独立运行，但 README、包描述和预发布版本号继续把 EAC 写成插件身份或兼容前提，容易让维护者误判为运行时依赖。

## 耦合核查

| 层次 | 结果 |
| --- | --- |
| Host 运行时 | 仅注入 DSH `webServer`、`workspaceRegistry`，并按需获取 `worktree` 服务；没有 EAC 路径、进程或配置调用。 |
| Web 客户端 | 使用 DSH 模块加载器以及 `workspaces`、`sessions` 服务；没有 Electron 或 EAC API。 |
| UI 适配 | 依赖官方 DSH 会话侧栏的树节点和类名片段。这是 DSH Web UI 兼容边界，不是 EAC 耦合。 |
| 插件协作 | 永久工作树可选依赖 `dsh-worktree`；确认删除可选依赖 `dsh-session-manager` 的浏览器桥。 |
| 现行文档与元数据 | README、description 和 `0.1.0-eac.5` 版本号存在 EAC 身份残留。 |
| 历史记录 | `DSH-SESSION-CONTEXT-MENU-20260822-001.md` 记录当时 EAC profile 的真实迁移状态，应保留为不可改写的历史证据。该目录不在 npm 发布文件清单中。 |

## 修改前

- README 将插件描述为“DeepSeek Harness EAC”的扩展，并把 EAC 4.4.1 写成目标环境。
- 包版本为 `0.1.0-eac.5`，description 同样声明 EAC 4.4.1。
- 测试名称把工作区服务固定称为“rc.2 workspace service”。

## 修改后

- README 改为官方 DSH `web` profile 的独立插件说明，明确不依赖 EAC、Electron 或桌面壳。
- README 分开说明 DSH 核心服务、UI 适配边界和两个可选插件协作点。
- 包版本更新为首个中性 DSH 版本 `0.2.0`，移除 EAC 后缀和 EAC description。
- 测试名称改为不绑定特定宿主或预发布小版本的表述。
- 功能源码、数据键和插件 ID 均未改变；更新后现有置顶数据可以继续使用。

## 验证

在仓库根目录执行：

```powershell
npm run build
npm run check
npm test
npm pack --dry-run
```

另以全文检索确认：除本文件与历史变更记录外，现行源码、README 和包元数据不再出现 EAC、Electron、`web-desktop` 或旧 EAC 路径。

## 回退

修改前基线为 Git 提交 `3612793c97cc085d53e711bfff2814c30b75490f`。如需恢复旧的发布身份，可回退本次提交；旧 `0.1.0-eac.5` 构建产物和历史记录不应覆盖删除。

## 数据与安全

本次不修改会话、工作区、置顶存储键、附件、密钥或 DSH profile，只更新仓库文档、包元数据和测试名称。
