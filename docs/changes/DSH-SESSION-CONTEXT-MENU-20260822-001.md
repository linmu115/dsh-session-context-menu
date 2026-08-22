---
changeId: "DSH-SESSION-CONTEXT-MENU-20260822-001"
plugin: "dsh-session-context-menu"
status: completed
baselineCommit: "9b384848d43f12097f554a69bad954568f7d398e"
branch: "change/dsh-session-context-menu-20260822-001-adopt-independent-repository"
createdAt: "2026-08-22T06:16:06.097Z"
summary: "将本地维护历史迁移到独立 Git 仓库"
completedAt: "2026-08-22T06:16:56.548Z"
validationCommand: "pnpm test && pnpm build"
---

# DSH-SESSION-CONTEXT-MENU-20260822-001: 将本地维护历史迁移到独立 Git 仓库

## 现象

将本地维护历史迁移到独立 Git 仓库

## 根因

原插件与 sidechat、设置滚轮插件共享一个 Git 仓库，导致会话菜单的兼容分支、提交标签和回退无法独立于其他插件演进。

## 影响范围

仅建立 `dsh-session-context-menu` 的独立源码历史和维护登记。EAC profile 继续使用原 `dsh-session-context-menu-0.1.0-eac.5.tgz`。

## 修改内容

使用 `git subtree split --prefix=dsh-session-context-menu` 保留路径历史，建立 `D:\AI\DSH-Plugin-Repositories\dsh-session-context-menu`。保留会话菜单、工作区操作和 rc.2 补全共 3 个提交，并登记为 `local/Tier 1`。

## 验证结果

拆分前旧目录 tree 与新仓库初始 HEAD tree 均为 `33a289599d05ba97aef44615ef96ab6e8a05c34b`。`pnpm test` 的 4 项测试通过，`pnpm build` 通过，生成文件 blob 与 HEAD 一致。

## 回退方法

旧 monorepo、原 tgz 和当前 profile 均未删除或改写。需要回退时继续使用旧 monorepo 及原打包产物即可。

## 用户数据影响

无。未接触会话、工作区登记、附件、密钥或 EAC 配置。
