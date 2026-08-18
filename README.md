# dsh-monitor

> 会话内进度监视器：可拖动的悬浮面板，只追踪长时间、多批次的工作——后台任务与工作流，显示耗时、状态，并为工作流给出进度条、`done/total` 计数与动态预计完成时间。
> A session-internal progress monitor: a draggable floating panel that tracks only long, multi-batch work — background jobs and workflows — with elapsed time, status, and, for workflows, a progress bar, a `done/total` count and a live ETA.

Session-internal progress monitor for **DeepSeek Harness (DSH)** — a draggable
floating panel that tracks only long-running, multi-batch work: background jobs
and workflows, with elapsed time, status, and (for workflows) a progress bar,
a `done/total` count, and a live ETA estimate.

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
log('dsh-monitor:total=42')   // or log('progress:total=42')
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

- **Host half** (`dist/index.js`, `exports["."]`) listens to `jobs` and
  `workflow/*` (not ordinary tool calls), maintains a process-local store,
  derives progress/ETA, and serves a lossless JSON snapshot at
  `GET /dsh-monitor/snapshot` via the `webServer` service.
- **Browser half** (`dist/client.js`, `exports["./client"]`) is a
  `window.__ModuleLoader__.load({ id, factory })` closure that registers a
  draggable React panel into `shell.overlay` and polls that route.

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
