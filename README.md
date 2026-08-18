# dsh-monitor

Session-internal progress monitor for **Oh-DSH Desktop** (DeepSeek Harness).

A draggable floating panel that live-tracks long-running work in the current
session — model tool calls, background jobs, subagents, and workflows — with
elapsed time, status, and (for workflows) a progress bar plus an ETA estimate.

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
├── package.json              # npm package (the `dsh-monitor` bundle)
├── .dsh-plugin/
│   └── package.json          # marketplace manifest (dsh.profile + dsh.client)
└── dist/
    ├── index.js              # host half: event listeners + progress store
    └── client.js             # client half: draggable floating panel UI
```

The marketplace manifest at `.dsh-plugin/package.json` is what the Oh-DSH
Desktop catalog and transaction manager read. `dsh.profile.bundles` points at
`dsh-monitor` (this npm package), which carries both the host half
(`dist/index.js`) and the browser half (`dist/client.js` through the `dsh.client`
declaration).

## Install

```bash
dsh plugin add dsh-monitor
```

or install through the Oh-DSH Desktop plugin marketplace once the catalog has
picked up this repository.

## Status & remaining work (read this before relying on it)

The monitor logic is a port of a fully working dynamic-plugin implementation
and keeps the same event sources and progress math. Two integration points are
**not yet end-to-end verified** against this deployment's desktop-plugin
host↔client contract, because that contract lives inside the Electron main
process and is not part of the readable runtime source:

1. **Host→client service bridge** — `dist/index.js` publishes `ctx.provide('dshMonitor', …)`
   and `dist/client.js` reads it with `ctx.get('dshMonitor')`. Confirm the
   desktop bundle actually wires a browser `ctx.get` to the host-side provider
   (some desktop shapes require a Remote descriptor instead of a raw service).
2. **`dsh.client` `inject` spec** — pin the exact `inject` list (currently
   `@deepseek-ai/dsh-client-runtime`) and `platform`/`immediately` values to
   the deployment's `dsh-client-modules` contract.

Until those two are verified, treat the bundle as **structurally complete but
integration-pending**. The `.dsh-plugin/package.json` already satisfies the
manifest schema (`name`, `dependencies`, `dsh.profile`, `dsh.client`) the
desktop transaction manager validates.

## License

MIT
