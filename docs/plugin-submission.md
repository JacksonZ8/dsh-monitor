# 收录申请 / Plugin submission

> 复制下面 `---` 之后的正文到 issue，标题填 `[收录] dsh-progress-monitor`。
> 目标仓库：https://github.com/whyihaveyou/dsh-suite/issues/new
> 模板：`.github/ISSUE_TEMPLATE/plugin-submission.md`，标签 `catalog, needs-compat-check`。

---

## 插件信息 / Plugin info

- **npm 包名 / package name**：`dsh-progress-monitor`（`dsh-monitor` 名已被占用，故改用此名）
- **GitHub 仓库 / repo**：`JacksonZ8/dsh-monitor`
- **一句话描述 / one-line description**（en，≤140 字）：
  Draggable in-session progress monitor tracking only long multi-batch work — background jobs and workflows — with a progress bar, a done/total count and a live ETA.
- **一句话描述 / one-line description**（zh，≤140 字）：
  会话内可拖动进度监视器，只追踪长时间多批次工作（后台任务与工作流），显示进度条、done/total 计数与动态预计完成时间。
- **分类 / category**：`ui`

## 为什么值得收录 / Why it belongs

DSH 的 agent 常派生长时间、多批次的任务（后台 `bash`、`run_in_background` 子代理、多阶段 `workflow`），但用户没有一个会话内、跨任务类型统一的可视化进度入口，尤其缺少"进度条 + 剩余时间"。

本插件：

- 用一个 **frame 级 `shell.overlay` 悬浮面板**（可拖动、位置记忆、双击复位）统一展示后台任务与工作流；
- 对 `workflow` 通过一个**显式进度协议**（脚本 `log('progress:total=N')` 声明批次总数，每个 `agent()` 完成即推进 `done`）计算**进度条 + `done/total` + 动态 ETA**；
- host 半只监听 `jobs` 与 `workflow/*`（**刻意不追踪**普通高频工具调用，避免刷屏），维护内存快照并经 `webServer` 的一个 HTTP 路由提供给浏览器半；
- 与同类（如 `widget-dock` 纯面板容器、不归并任务事件）不同，本插件**直接对接 DSH 的 jobs/event seam**，聚焦"长任务进度 + ETA"这一个痛点。

## 兼容性 / Compatibility

- **DSH 最低版本 / min DSH version**：已用 `dsh@0.1.0-rc.7` 本地实测装载通过（`--dump-config` 组装成功 + `webServer` 路由生效）。建议 `compat.status` 先填 `unknown`，待 CI 日检确认。
- **是否已在 DSH 上实测 / verified on DSH?**：是（本地 `dsh plugin --profile test add ./dsh-monitor` + `dsh --profile test --port 0`，验证了 bundle 组装、browser bundle serve、`GET /dsh-progress-monitor/snapshot` 返回 JSON）。

## 备注 / Notes

- **license**：MIT
- **维护状态**：新项目，单作者
- **双半插件**：host 半（`dist/index.js`，`exports["."]`，`inject: [webServer, timer]`）+ 浏览器半（`dist/client.js`，`window.__ModuleLoader__.load({id:'dsh-progress-monitor', factory})`），遵循 `dsh-plugin-tutorial` 面板规范。
- **已知坑**：`shell.overlay` 为 `list` 槽，本插件用独立 `id: dsh-progress-monitor`，不与内置条目冲突。
- **进度协议约定**：workflow 脚本在派发批次前 `log('progress:total=N')`（也兼容旧 `dsh-monitor:total=N`）；未声明 total 时回退 `meta.phases` 数量，仍无则只显示耗时。
