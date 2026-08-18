// dsh-progress-monitor host half (Node process)
//
// Focus: long-running, multi-batch tasks — background jobs and workflows.
// Ordinary model tool calls (read/write/grep/…) are deliberately NOT tracked.
//
// Progress + ETA source (workflow explicit protocol):
//   - a workflow opts into progress by logging `progress:total=N` (or
//     `log('progress:total=N')`) once, before fanning out its batches;
//   - every `agent()` call in that workflow counts as one unit of work, so
//     `workflow/agent-end` advances `done`, and progress = done / total;
//   - ETA is extrapolated from elapsed time at the current progress fraction.
//   - Without an explicit total, we fall back to `meta.phases.length` when the
//     script declared phases, otherwise no progress bar (elapsed only).
//
// The browser half polls the `/dsh-progress-monitor/snapshot` route below.

export const name = 'dsh-progress-monitor'

export const inject = ['webServer', 'timer']

export function apply(ctx) {
  const webServer = ctx.webServer
  const timer = ctx.timer
  const tasks = new Map()
  let seq = 0

  const now = () => Date.now()
  const numOrNull = (x) => (typeof x === 'number' && isFinite(x)) ? x : null

  function snapshot() {
    const arr = []
    const t = now()
    for (const v of tasks.values()) {
      const elapsed = v.status === 'running'
        ? t - v.startedAt
        : (v.endedAt || v.startedAt) - v.startedAt
      const progress = numOrNull(v.progress)
      let etaMs = null
      if (v.status === 'running' && typeof progress === 'number' && progress > 0 && progress < 1 && elapsed > 0) {
        etaMs = Math.max(0, (elapsed / progress) - elapsed)
      }
      arr.push({
        key: v.key,
        kind: v.kind,
        label: v.label,
        status: v.status,
        detail: v.detail || '',
        startedAt: v.startedAt,
        endedAt: v.endedAt || 0,
        elapsedMs: elapsed,
        progress,
        etaMs,
        done: v.done ?? null,
        total: v.total ?? null,
      })
    }
    arr.sort((a, b) => {
      if (a.status !== b.status) return a.status === 'running' ? -1 : 1
      return b.startedAt - a.startedAt
    })
    return { now: t, items: arr }
  }

  function upsert(key, patch) {
    let v = tasks.get(key)
    if (!v) {
      v = { key, kind: 'job', label: '', status: 'running', startedAt: now(), endedAt: 0, detail: '', progress: null, done: null, total: null }
      tasks.set(key, v)
    }
    if (patch) {
      for (const k in patch) if (Object.prototype.hasOwnProperty.call(patch, k)) v[k] = patch[k]
    }
    return v
  }

  function finish(key, detail) {
    const v = tasks.get(key)
    if (v) {
      v.status = 'done'
      v.endedAt = now()
      v.progress = 1
      if (typeof v.done === 'number' && typeof v.total === 'number') v.done = v.total
      if (detail !== undefined && detail !== '') v.detail = detail
    }
  }

  function fail(key, detail) {
    const v = tasks.get(key)
    if (v) {
      v.status = 'error'
      v.endedAt = now()
      if (detail !== undefined && detail !== '') v.detail = detail
    }
  }

  // ---- background jobs (only these surfaces; ordinary tool calls excluded) ----
  const jobs = ctx.get('jobs')
  if (jobs) {
    const reflectJobs = () => {
      let list = []
      try { list = jobs.list() || [] } catch (e) { list = [] }
      const seen = new Set()
      for (const j of list) {
        const id = j && j.id ? String(j.id) : 'job:' + j
        seen.add(id)
        const status = j && j.status ? String(j.status) : 'running'
        const label = j && j.label ? String(j.label) : (j && j.kind ? String(j.kind) : '任务')
        const detail = j && j.detail ? String(j.detail) : ''
        const isTerminal = status === 'completed' || status === 'killed' || status === 'failed'
        const key = 'job:' + id
        const cur = tasks.get(key)
        if (!cur) {
          upsert(key, {
            kind: 'job',
            label,
            status: isTerminal ? (status === 'failed' ? 'error' : 'done') : 'running',
            detail: isTerminal ? (detail || status) : (status === 'stopping' ? '停止中' : detail),
          })
        } else {
          if (isTerminal && cur.status === 'running') {
            if (status === 'failed') fail(key, detail || status)
            else finish(key, detail || status)
          } else if (status === 'stopping' && cur.status === 'running') {
            cur.detail = '停止中'
          } else if (cur.status === 'running' && detail) {
            cur.detail = detail
          } else if (!isTerminal && status !== 'stopping' && cur.status !== 'running') {
            upsert(key, { status: 'running' })
          }
        }
      }
      for (const [k, v] of tasks) {
        if (v.kind === 'job' && v.status === 'running' && !seen.has(k.slice(4))) finish(k)
      }
    }
    ctx.effect(() => jobs.onJobsChanged(() => reflectJobs()))
    ctx.effect(() => jobs.onJobDone(() => reflectJobs()))
    reflectJobs()
  }

  // ---- workflows: explicit progress protocol ----
  // keyed by workflow id: { total, done }
  const wf = new Map()

  ctx.on('workflow/start', (info) => {
    const id = info && info.id ? String(info.id) : 'wf:' + (++seq)
    const name = info && info.meta && info.meta.name ? String(info.meta.name) : '工作流'
    const phases = info && info.meta && Array.isArray(info.meta.phases) ? info.meta.phases : []
    const total = phases.length > 0 ? phases.length : null
    wf.set(id, { total, done: 0 })
    upsert('wf:' + id, {
      kind: 'workflow',
      label: name,
      status: 'running',
      detail: '',
      progress: total ? 0 : null,
      done: 0,
      total,
    })
  })

  ctx.on('workflow/log', (info, message) => {
    const id = info && info.id ? String(info.id) : ''
    if (!id) return
    const msg = message ? String(message) : ''
    // explicit protocol: `progress:total=N` (legacy `dsh-monitor:total=N` still accepted)
    const m = msg.match(/(?:progress|dsh-progress-monitor|dsh-monitor)\s*:\s*total\s*=\s*(\d+)/i)
    if (m) {
      const total = parseInt(m[1], 10)
      const rec = wf.get(id)
      if (rec && total > 0) {
        rec.total = total
        const v = tasks.get('wf:' + id)
        if (v) {
          v.total = total
          v.done = rec.done
          v.progress = total > 0 ? Math.min(0.999, rec.done / total) : null
          v.detail = `0/${total}`
        }
      }
    } else {
      // narrate the latest log line as detail (bounded, no carriage noise)
      const v = tasks.get('wf:' + id)
      if (v) v.detail = msg.slice(0, 120)
    }
  })

  ctx.on('workflow/agent-end', (info) => {
    const id = info && info.id ? String(info.id) : ''
    if (!id) return
    const rec = wf.get(id)
    if (!rec) return
    rec.done += 1
    const v = tasks.get('wf:' + id)
    if (v) {
      v.done = rec.done
      if (rec.total && rec.total > 0) {
        v.progress = Math.min(0.999, rec.done / rec.total)
        v.detail = rec.done + '/' + rec.total
      } else {
        v.detail = rec.done + ' 完成'
      }
    }
  })

  ctx.on('workflow/phase', (info, title) => {
    const id = info && info.id ? String(info.id) : ''
    if (!id) return
    const t = title ? String(title) : ''
    const v = tasks.get('wf:' + id)
    if (v && t) v.detail = '阶段: ' + t
  })

  ctx.on('workflow/end', (info, result) => {
    const id = info && info.id ? String(info.id) : ''
    if (!id) return
    const v = tasks.get('wf:' + id)
    wf.delete(id)
    if (v) {
      const stop = result && result.stopReason ? String(result.stopReason) : ''
      if (stop === 'error') fail(v.key, result && result.error ? String(result.error) : stop)
      else finish(v.key, stop)
    }
  })

  // prune finished tasks older than 60s
  ctx.effect(() => {
    return timer.interval(() => {
      const cutoff = now() - 60 * 1000
      for (const [k, v] of tasks) {
        if (v.status !== 'running' && (v.endedAt || 0) < cutoff) tasks.delete(k)
      }
    }, 10000)
  })

  // ---- data bridge ----
  webServer.register({
    kind: 'exact',
    path: '/dsh-progress-monitor/snapshot',
    handler: (req, res) => {
      res.setHeader('Content-Type', 'application/json; charset=utf-8')
      res.setHeader('Cache-Control', 'no-store')
      res.end(JSON.stringify(snapshot()))
    },
  })
}
