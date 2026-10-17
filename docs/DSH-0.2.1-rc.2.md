# DSH 0.2.1-rc.2 本地维护候选

宿主：687f282e8625c6b8d11ff58211a90524be2e4317，精确 0.2.1-rc.2。候选：0.3.5-dsh021.1。
开发树通过 pnpm-workspace overrides 指向 Launcher 当前已构建宿主全部包，避免旧 npm host 遮蔽。宿主与运行实例均未写入。发行 package.json 的 engines.dsh 精确覆盖 0.2.1-rc.2，第三方 peer 精确协调候选版本。

当前只读代码/测试/发行验收；运行实例安装、真实网页视觉及交互统一由主任务完成。没有重装已退役独立 Sidechat。

## 复现开发环境

准备官方 `dsh-v0.2.1-rc.2`（提交 `687f282e8625c6b8d11ff58211a90524be2e4317`）的已构建源码树。宿主包尚未发布到 npm，本维护树通过受 Git 忽略的 `.dsh-host/` 链接读取它；开发依赖和 workspace overrides 均使用相对路径。宿主源码只读使用。

```powershell
$env:DSH_HOST_SOURCE = 'D:/path/to/built-dsh-0.2.1-rc.2'
node scripts/prepare-host.mjs
pnpm install --ignore-scripts
```

也可直接传入目录：`node scripts/prepare-host.mjs "D:/path/to/built-dsh-0.2.1-rc.2"`。脚本校验宿主名称、精确版本及直接开发依赖的构建入口，再创建 Windows junction 或其他系统的目录 symlink；已有相同链接可重复运行。`pnpm run dev:host <目录>` 提供同一入口。

存在已跟踪 `pnpm-lock.yaml` 的仓库可追加 `--frozen-lockfile`。跨插件 `link:../dsh-better-sidebar` 需将同批 BetterSidebar 源码放在同级目录，并先完成其开发环境准备。不要在其他宿主版本上复用此维护候选。
