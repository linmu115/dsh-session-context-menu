# dsh-session-context-menu

为 DeepSeek Harness（DSH）Web 会话列表和工作区补充右键菜单。

插件直接运行在官方 DSH profile 中，不依赖外置桌面壳。当前版本已在官方 DSH `0.1.1-rc.2` 的 `web` profile 中验证。

## 会话右键

- 置顶/取消置顶（按会话 ID 保存）
- 重命名
- 创建分支聊天
- 归档聊天
- 调用 `dsh-session-manager` 的带确认删除

## 工作区右键

- 置顶/取消置顶（按工作区 ID 保存，并调用 DSH 官方顺序接口移到顶部）
- 编辑：修改名称并显示只读文件夹路径
- 归档聊天：归档该工作区中全部未归档聊天
- 创建永久工作树：调用已启用的 `dsh-worktree`，创建后登记为 `[worktree] 名称` 工作区
- 移除项目：只移除 DSH 工作区登记，保留文件夹与会话记录

## 运行方式与依赖边界

插件由两部分组成：

- 客户端使用 DSH 提供的模块加载器以及 `workspaces` / `sessions` 客户端服务，在官方会话侧栏上增加菜单，不覆盖 `@deepseek-ai/dsh-client-ui-workspace`。
- Host 端使用 DSH 的 `webServer` / `workspaceRegistry` 服务，为永久工作树操作提供本机同源接口。

以下能力是可选的插件间协作：

- “创建永久工作树”需要启用 `dsh-worktree`；未启用时，只有这一个菜单项无法完成操作。
- “删除聊天”调用 `dsh-session-manager` 暴露的确认删除桥；桥未就绪时，其他菜单功能仍可使用。

会话和工作区定位会识别官方 DSH 侧栏的树节点及其 UI 类名片段。DSH 大版本若重构会话侧栏 DOM，可能需要更新这层适配，但不需要引入桌面壳。

## 安装

将插件包安装到目标 DSH profile，并把 `dsh-session-context-menu` 加入该 profile 的 bundles。安装、更新或启用状态发生变化后，重启对应的 DSH profile。

不同 DSH profile 的安装状态和浏览器本地置顶数据彼此独立。

## 本地数据

置顶状态保存在浏览器本地存储中，键为：

- `dsh.session.context-menu.pins.v1`
- `dsh.workspace.context-menu.pins.v1`

## 开发与验证

```powershell
npm run build
npm run check
npm test
```

