# dsh-monitor

> 会话内进度监视器：可拖动的悬浮面板，实时追踪长时间运行的工具调用、后台任务、子代理与工作流，显示耗时、状态，并为工作流给出进度条与预计完成时间。
> A session-internal progress monitor: a draggable floating panel that live-tracks long-running tool calls, background jobs, subagents and workflows, with elapsed time, status, and — for workflows — a progress bar and ETA.

Session-internal progress monitor for **DeepSeek Harness (DSH)** — a draggable
floating panel that live-tracks long-running work in the current session:
model tool calls, background jobs, subagents, and workflows, with elapsed time,
status, and (for workflows) a progress bar plus an ETA estimate.

## What it shows

| Kind | Source | Progress / ETA |
| --- | --- | --- |
| 工具 `tool` | model tool calls (`bash`, `write`, `read`, …) | elapsed + status only |
| 任务 `job` | background jobs (foreground/background `bash`, `subagent`) | elapsed + status + detail |
| 子代理 `subagent` | `subagent` / `subagent_fork` children | elapsed + status |
| 工作流 `workflow` | multi-stage `workflow` runs | **progress bar + % + 剩余≈ ETA** from `meta.phases` / `phase()` |

The pill collapses to a small badge in the bottom-right. Drag the pill or the
panel header to move it; the position is remembered in `localStorage`.

## Repository layout

```
dsh-monitor/
├── package.json              # npm package + DSH bundle (`dsh.bundle.patch` + `dsh.client`)
├── cordis.patch.yml          # bundle layer: inserts the `dsh-monitor` host row
├── .dsh-plugin/
│   └── package.json          # Oh-DSH Desktop marketplace manifest
└── dist/
    ├── index.js              # host half: event listeners → store → HTTP route
    └── client.js             # browser half: window.__ModuleLoader__ panel factory
```

This is a **dual-half plugin** per the official `dsh-plugin-tutorial`:

- **Host half** (`dist/index.js`, `exports["."]`) listens to `tools/*`,
  `jobs`, `subagent/*`, and `workflow/*`, maintains a process-local store, and
  serves a lossless JSON snapshot at `GET /dsh-monitor/snapshot` via the
  `webServer` service.
- **Browser half** (`dist/client.js`, `exports["./client"]`) is a
  `window.__ModuleLoader__.load({ id, factory })` closure that registers a
  React panel into `shell.overlay` and polls that route.

## Install

```bash
# DSH CLI (registry/bundle path)
dsh plugin --profile web add ./dsh-monitor
dsh --profile web

# or via the Oh-DSH Desktop marketplace once the catalog has picked up
# this repository (see `.dsh-plugin/package.json`).
```

## Notes

- `dsh.bundle.patch` → `cordis.patch.yml` inserts one host row
  (`id: dsh-monitor`, `name: dsh-monitor`).
- Browser half `id` MUST equal package `name` (`dsh-monitor`).
- `shell.overlay` is a `list` slot, so the panel adds a fresh id beside the
  shipped entries rather than replacing anything.

## License

MIT
