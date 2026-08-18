// dsh-monitor host half (Node side)
//
// Tracks in-flight work — model tool calls, background jobs, subagents and
// workflows — in a process-local store, derives progress/ETA, and serves a
// lossless-JSON snapshot the client half renders.
//
// This mirrors the proven dynamic-plugin logic (moni-1/pkg-4) adapted to the
// desktop-plugin bundle shape. The store is keyed purely by strings and only
// leaf scalars ever leave it (no live Service/Session objects).

function createMonitorStore(ctx) {
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
      v = { key, kind: 'tool', label: '', status: 'running', startedAt: now(), endedAt: 0, detail: '', progress: null }
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

  // ---- model tool calls ----
  ctx.on('tools/pre-execute', (exec, next) => {
    const name = exec && exec.name ? String(exec.name) : 'tool'
    upsert('tool:' + name + ':' + (++seq), {
      kind: 'tool',
      label: name === 'bash' ? '命令' : name,
      status: 'running',
    })
    return next()
  })
  ctx.on('tools/result', () => {
    for (const v of tasks.values()) {
      if (v.kind === 'tool' && v.status === 'running') { finish(v.key); return }
    }
  })

  // ---- background jobs ----
  const jobs = ctx.get('jobs')
  if (jobs) {
    function reflectJobs() {
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

  // ---- subagents ----
  ctx.on('subagent/start', (info) => {
    const id = info && info.id ? String(info.id) : 'sub:' + (++seq)
    const label = info && info.label ? String(info.label) : '子代理'
    upsert('sub:' + id, { kind: 'subagent', label, status: 'running' })
  })
  ctx.on('subagent/end', (info) => {
    const id = info && info.id ? String(info.id) : ''
    if (id) finish('sub:' + id)
  })

  // ---- workflows (progress + ETA via phase titles) ----
  const wfMeta = new Map()
  ctx.on('workflow/start', (info) => {
    const id = info && info.id ? String(info.id) : 'wf:' + (++seq)
    const name = info && info.meta && info.meta.name ? String(info.meta.name) : '工作流'
    const phases = info && info.meta && Array.isArray(info.meta.phases) ? info.meta.phases : []
    wfMeta.set(id, {
      phaseCount: phases.length,
      phaseTitles: phases.map((p) => (p && p.title ? String(p.title) : '')),
    })
    upsert('wf:' + id, { kind: 'workflow', label: name, status: 'running', detail: '', progress: phases.length > 0 ? 0 : null })
  })
  ctx.on('workflow/phase', (info, title) => {
    const id = info && info.id ? String(info.id) : ''
    if (!id) return
    const t = title ? String(title) : ''
    const v = tasks.get('wf:' + id)
    const m = wfMeta.get(id)
    if (v) v.detail = t
    if (m && m.phaseCount > 0) {
      const idx = m.phaseTitles.indexOf(t)
      if (idx >= 0 && v) v.progress = Math.min(0.99, (idx + 1) / m.phaseCount)
    }
  })
  ctx.on('workflow/end', (info, result) => {
    const id = info && info.id ? String(info.id) : ''
    if (!id) return
    const v = tasks.get('wf:' + id)
    wfMeta.delete(id)
    if (v) {
      const stop = result && result.stopReason ? String(result.stopReason) : ''
      if (stop === 'error') fail(v.key, result && result.error ? String(result.error) : stop)
      else finish(v.key, stop)
    }
  })

  // prune finished tasks older than 60s
  ctx.effect(() => {
    const t = ctx.get('timer')
    if (!t) return undefined
    return t.interval(() => {
      const cutoff = now() - 60 * 1000
      for (const [k, v] of tasks) {
        if (v.status !== 'running' && (v.endedAt || 0) < cutoff) tasks.delete(k)
      }
    }, 10000)
  })

  return { snapshot }
}

export function apply(ctx) {
  const store = createMonitorStore(ctx)
  // Publish a read-only face for the client half (and any test) to consume.
  ctx.provide('dshMonitor', Object.freeze({
    snapshot: () => store.snapshot(),
  }))
}
