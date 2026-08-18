# 收录申请 / Plugin submission

> 这个文件是你向 `whyihaveyou/dsh-suite` 提交收录 issue 时可直接复制的正文。
> 复制到 issue 正文（标题填 `[收录] dsh-monitor`），维护者核实后再进目录。

---

## 插件信息 / Plugin info

- **npm 包名 / package name**：`dsh-monitor`（暂未发布到 npm；代码即本仓库）
- **GitHub 仓库 / repo**：`JacksonZ8/dsh-monitor`
- **一句话描述 / one-line description**（en，≤140 字）：
  Draggable in-session progress monitor: tracks long-running tool calls, background jobs, subagents and workflows with elapsed time, status, and ETA for workflows.
- **一句话描述 / one-line description**（zh，≤140 字）：
  会话内可拖动进度监视器：跟踪长时间运行的工具调用、后台任务、子代理与工作流，显示耗时、状态，并为工作流给出预计完成时间。
- **分类 / category**：`ui`（候选 `tools` 或 `utility`，见备注）

## 为什么值得收录 / Why it belongs

DSH 的 agent 常派生长时间任务（后台 `bash`、`subagent`、多阶段 `workflow`），但用户没有一个会话内、跨任务类型统一的可视化进度入口。本插件：

- 用一个 **frame 级 `shell.overlay` 悬浮面板**（可拖动、位置记忆）统一展示四类任务；
- 对 `workflow` 依据 `meta.phases` / `phase()` 计算**进度条 + 百分比 + 剩余时间**；
- host 半监听 `tools/*`、`jobs`、`subagent/*`、`workflow/*` 事件维护内存快照，并通过 `webServer` 的一个 HTTP 路由把快照提供给浏览器半；
- 与同类（如 `widget-dock`，纯面板容器、无任务事件归并）不同，本插件**直接对接 DSH 的 jobs/event seam**，聚焦"长任务进度"这一个痛点。

## 兼容性 / Compatibility

- **DSH 最低版本 / min DSH version**：未实测，留空（建议 `compat.status: unknown`）
- **是否已在 DSH 上实测 / verified on DSH?**：否（尚未发布 npm，也未经 DSH profile 装载验证）

## 备注 / Notes

- **license**：MIT
- **维护状态**：新项目，单作者
- **已知坑**：`shell.overlay` 为 `list` 槽，本插件用独立 `id: dsh-monitor`，不与内置条目冲突。
- 双半插件：host 半（`dist/index.js`）+ 浏览器半（`dist/client.js`，`window.__ModuleLoader__` factory），遵循 `dsh-plugin-tutorial` 的面板规范。
