# dsh-session-context-menu

为 DeepSeek Harness EAC 的会话列表和工作区补充原生右键菜单，针对 EAC 4.4.1 / DSH 0.1.1-rc.2。

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

插件使用 DSH rc.2 的 `workspaces` / `sessions` 官方客户端服务，不覆盖 `@deepseek-ai/dsh-client-ui-workspace`。工作树功能通过本地同源端点连接 Host，不依赖 rc.2 已移除的旧浏览器模块。

置顶状态保存在浏览器本地存储中，键为：

- `dsh.session.context-menu.pins.v1`
- `dsh.workspace.context-menu.pins.v1`

开发与验证：

```powershell
npm run build
npm run check
npm test
```

