# DSH 0.2.1-rc.2 本地维护候选

宿主：687f282e8625c6b8d11ff58211a90524be2e4317，精确 0.2.1-rc.2。候选：0.3.5-dsh021.1。
开发树通过 pnpm-workspace overrides 指向 Launcher 当前已构建宿主全部包，避免旧 npm host 遮蔽。宿主与运行实例均未写入。发行 package.json 的 engines.dsh 精确覆盖 0.2.1-rc.2，第三方 peer 精确协调候选版本。

当前只读代码/测试/发行验收；运行实例安装、真实网页视觉及交互统一由主任务完成。没有重装已退役独立 Sidechat。
