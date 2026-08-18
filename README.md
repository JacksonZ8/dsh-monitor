# dsh-progress-monitor

> 会话内进度监视器：可拖动的悬浮面板，只追踪长时间、多批次的工作——后台任务与工作流，显示耗时、状态，并为工作流给出进度条、`done/total` 计数与动态预计完成时间。
> A session-internal progress monitor: a draggable floating panel that tracks only long, multi-batch work — background jobs and workflows — with elapsed time, status, and, for workflows, a progress bar, a `done/total` count and a live ETA.

Session-internal progress monitor for **DeepSeek Harness (DSH)** — a draggable
floating panel that tracks only long-running, multi-batch work: background jobs
and workflows, with elapsed time, status, and (for workflows) a progress bar,
a `done/total` count, and a live ETA estimate.

> npm 包名是 `dsh-progress-monitor`（`dsh-monitor` 已被占用）；GitHub 仓库名仍为 `dsh-monitor`。

## What it shows

Only **long-running, multi-batch work** — ordinary model tool calls are
deliberately NOT tracked:

| Kind | Source | Progress / ETA |
| --- | --- | --- |
| 任务 `job` | background jobs (`run_in_background` bash / subagent) | elapsed + status + detail |
| 工作流 `workflow` | multi-batch `workflow` runs | **progress bar + `done/total` + 剩余≈ ETA** via the explicit protocol below |

### Workflow progress protocol

A workflow opt into a progress bar by logging its total batch count once,
before fanning out:

```js
log('progress:total=42')   // legacy `dsh-monitor:total=42` also accepted
```

Every `agent()` call in that workflow then counts as one completed unit, so
the monitor shows `3/42` with a bar and an ETA extrapolated from elapsed time
at the current fraction. Without an explicit total, the monitor falls back to
`meta.phases.length` when phases are declared, otherwise elapsed only.

The pill collapses to a small badge in the bottom-right. Drag the pill or the
panel header to move it; the position is remembered in `localStorage`
(double-click the pill to reset it).

## Repository layout

```
dsh-monitor/                  # GitHub repo (npm 名 dsh-progress-monitor)
├── package.json              # npm package + DSH bundle (`dsh.bundle.patch` + `dsh.client`)
├── cordis.patch.yml          # bundle layer: inserts the `dsh-progress-monitor` host row
├── .dsh-plugin/
│   └── package.json          # Oh-DSH Desktop marketplace manifest
└── dist/
    ├── index.js              # host half: event listeners → store → HTTP route
    └── client.js             # browser half: window.__ModuleLoader__ panel factory
```

This is a **dual-half plugin** per the official `dsh-plugin-tutorial`:

- **Host half** (`dist/index.js`, `exports["."]`) listens to `jobs` and
  `workflow/*` (not ordinary tool calls), maintains a process-local store,
  derives progress/ETA, and serves a lossless JSON snapshot at
  `GET /dsh-progress-monitor/snapshot` via the `webServer` service.
- **Browser half** (`dist/client.js`, `exports["./client"]`) is a
  `window.__ModuleLoader__.load({ id, factory })` closure that registers a
  draggable React panel into `shell.overlay` and polls that route.

## Install

```bash
# DSH CLI (registry/bundle path) — package name is dsh-progress-monitor
dsh plugin --profile web add dsh-progress-monitor
dsh --profile web

# from a local checkout:
dsh plugin --profile web add ./dsh-monitor
```

## Notes

- `dsh.bundle.patch` → `cordis.patch.yml` inserts one host row
  (`id: dsh-progress-monitor`, `name: dsh-progress-monitor`).
- Browser half `id` MUST equal package `name` (`dsh-progress-monitor`).
- `shell.overlay` is a `list` slot, so the panel adds a fresh id beside the
  shipped entries rather than replacing anything.

## License

MIT
