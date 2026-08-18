// dsh-progress-monitor browser half (Web UI process)
//
// Draggable floating panel in `shell.overlay`, polling the host half's
// `/dsh-progress-monitor/snapshot` route. Shows background jobs + workflows with a
// progress bar and a live ETA estimate.
//
// Self-registering closure factory (id === package name). React is provided
// by the shell module table.

window.__ModuleLoader__.load({
  id: 'dsh-progress-monitor',
  factory: (require) => {
    const React = require('react')

    return {
      inject: ['slots'],
      apply(ctx) {
        const slots = ctx.slots

        if (ctx.styles && ctx.styles.insert) {
          ctx.styles.insert(`
            .moni-panel { position: fixed; z-index: 9990; pointer-events: auto; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; font-size: 12px; color: #d7dbe0; }
            .moni-pill { display: inline-flex; align-items: center; gap: 6px; padding: 8px 12px; border-radius: 999px; background: rgba(28, 32, 40, 0.94); border: 1px solid rgba(255,255,255,0.14); box-shadow: 0 4px 16px rgba(0,0,0,0.4); cursor: grab; user-select: none; }
            .moni-pill:active { cursor: grabbing; }
            .moni-dot { width: 8px; height: 8px; border-radius: 50%; background: #34d399; flex: 0 0 auto; }
            .moni-dot.idle { background: #6b7280; }
            .moni-dot.running { background: #34d399; animation: moni-pulse 1.2s ease-in-out infinite; }
            @keyframes moni-pulse { 0%,100% { opacity: 1; } 50% { opacity: 0.35; } }
            .moni-count { font-weight: 600; color: #fff; }
            .moni-body { width: 340px; max-height: 64vh; overflow-y: auto; background: rgba(20, 24, 31, 0.97); border: 1px solid rgba(255,255,255,0.14); border-radius: 12px; box-shadow: 0 10px 36px rgba(0,0,0,0.55); }
            .moni-head { display: flex; align-items: center; justify-content: space-between; padding: 9px 12px; font-weight: 600; color: #fff; border-bottom: 1px solid rgba(255,255,255,0.08); cursor: grab; user-select: none; }
            .moni-head:active { cursor: grabbing; }
            .moni-head-title { display: flex; align-items: center; gap: 6px; }
            .moni-drag-hint { font-size: 10px; color: #6b7280; font-weight: 400; }
            .moni-task { padding: 8px 10px; border-bottom: 1px solid rgba(255,255,255,0.05); }
            .moni-task:last-child { border-bottom: none; }
            .moni-row { display: flex; align-items: center; gap: 8px; }
            .moni-badge { flex: 0 0 auto; font-size: 9px; font-weight: 700; letter-spacing: 0.3px; padding: 2px 6px; border-radius: 4px; text-transform: uppercase; background: rgba(255,255,255,0.10); color: #cbd5e1; }
            .moni-badge.job { background: rgba(167,139,250,0.20); color: #c4b5fd; }
            .moni-badge.workflow { background: rgba(251,191,36,0.20); color: #fcd34d; }
            .moni-label { flex: 1 1 auto; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; color: #e5e7eb; }
            .moni-time { flex: 0 0 auto; color: #9ca3af; font-variant-numeric: tabular-nums; }
            .moni-status { flex: 0 0 auto; font-size: 10px; }
            .moni-status.running { color: #34d399; }
            .moni-status.done { color: #6b7280; }
            .moni-status.error { color: #f87171; }
            .moni-empty { padding: 20px 10px; color: #6b7280; text-align: center; }
            .moni-sub { font-size: 10px; color: #9ca3af; padding: 0; margin-top: 4px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
            .moni-bar-wrap { display: flex; align-items: center; gap: 6px; margin-top: 5px; }
            .moni-bar { flex: 1 1 auto; height: 6px; border-radius: 3px; background: rgba(255,255,255,0.10); overflow: hidden; }
            .moni-bar-fill { height: 100%; border-radius: 3px; background: linear-gradient(90deg, #34d399, #3b82f6); transition: width 0.4s ease; }
            .moni-pct { flex: 0 0 auto; font-size: 11px; color: #93c5fd; font-variant-numeric: tabular-nums; min-width: 34px; text-align: right; }
            .moni-eta { flex: 0 0 auto; font-size: 10px; color: #9ca3af; }
          `)
        }

        const KIND_LABEL = { job: '任务', workflow: '工作流' }
        const KIND_BADGE = { job: 'job', workflow: 'workflow' }

        const fmt = (ms) => {
          if (ms < 0) return '0s'
          const s = Math.floor(ms / 1000)
          if (s < 60) return s + 's'
          const m = Math.floor(s / 60)
          if (m < 60) return m + 'm' + (s % 60) + 's'
          return Math.floor(m / 60) + 'h' + (m % 60) + 'm'
        }
        const fmtEta = (ms) => {
          if (ms < 0) return ''
          const s = Math.round(ms / 1000)
          if (s < 60) return s + 's'
          const m = Math.round(s / 60)
          if (m < 60) return m + 'm'
          const h = Math.floor(m / 60)
          return h + 'h' + (m % 60) + 'm'
        }
        const loadPos = () => {
          try {
            const raw = localStorage.getItem('dsh-progress-monitor.pos')
            if (raw) { const p = JSON.parse(raw); if (typeof p.x === 'number' && typeof p.y === 'number') return p }
          } catch (e) {}
          return null
        }
        const savePos = (x, y) => {
          try { localStorage.setItem('dsh-progress-monitor.pos', JSON.stringify({ x, y })) } catch (e) {}
        }

        const ProgressBar = (it) => {
          const p = it.progress
          const hasPct = it.status === 'running' && typeof p === 'number' && isFinite(p) && p > 0 && p < 1
          const frac = (typeof it.done === 'number' && typeof it.total === 'number' && it.total > 0)
            ? it.done + '/' + it.total
            : ''
          if (!hasPct && !frac) return null
          const pct = hasPct ? Math.min(99, Math.round(p * 100)) : (typeof p === 'number' ? Math.round(p * 100) : 0)
          const eta = it.etaMs
          return React.createElement('div', { className: 'moni-bar-wrap' },
            React.createElement('div', { className: 'moni-bar' },
              React.createElement('div', { className: 'moni-bar-fill', style: { width: pct + '%' } }),
            ),
            React.createElement('span', { className: 'moni-pct' }, frac ? frac : (pct + '%')),
            (typeof eta === 'number' && isFinite(eta) && eta > 0)
              ? React.createElement('span', { className: 'moni-eta' }, '剩余≈' + fmtEta(eta))
              : null,
          )
        }

        const Monitor = () => {
          const [snap, setSnap] = React.useState({ now: 0, items: [] })
          const [open, setOpen] = React.useState(false)
          const [pos, setPos] = React.useState(() => loadPos() || { x: null, y: null })
          const panelRef = React.useRef(null)

          React.useEffect(() => {
            let alive = true
            const poll = async () => {
              try {
                const r = await fetch('/dsh-progress-monitor/snapshot')
                if (!r.ok) return
                const s = await r.json()
                if (alive) setSnap(s)
              } catch (e) {}
            }
            poll()
            const id = setInterval(poll, 700)
            return () => { alive = false; clearInterval(id) }
          }, [])

          // Drag uses the WHOLE panel's bounding rect (via ref), not the
          // child element under the cursor — so the grab point stays put.
          const startDrag = (e) => {
            if (e.button !== 0) return
            e.preventDefault()
            const el = panelRef.current
            if (!el) return
            const rect = el.getBoundingClientRect()
            const baseLeft = rect.left
            const baseTop = rect.top
            const startX = e.clientX
            const startY = e.clientY
            const onMove = (ev) => setPos({ x: baseLeft + (ev.clientX - startX), y: baseTop + (ev.clientY - startY) })
            const onUp = (ev) => {
              document.removeEventListener('mousemove', onMove)
              document.removeEventListener('mouseup', onUp)
              const nx = baseLeft + (ev.clientX - startX)
              const ny = baseTop + (ev.clientY - startY)
              setPos({ x: nx, y: ny })
              savePos(nx, ny)
            }
            document.addEventListener('mousemove', onMove)
            document.addEventListener('mouseup', onUp)
          }
          const resetPos = () => { setPos({ x: null, y: null }); try { localStorage.removeItem('dsh-progress-monitor.pos') } catch (e) {} }

          const items = snap.items || []
          const runningCount = items.filter((i) => i.status === 'running').length
          const total = items.length

          const panelStyle = {}
          if (pos.x !== null && pos.y !== null) { panelStyle.left = pos.x + 'px'; panelStyle.top = pos.y + 'px' }
          else { panelStyle.right = 14; panelStyle.bottom = 14 }

          return React.createElement('div', { className: 'moni-panel', style: panelStyle, ref: panelRef },
            open && React.createElement('div', { className: 'moni-body' },
              React.createElement('div', { className: 'moni-head', onMouseDown: startDrag },
                React.createElement('span', { className: 'moni-head-title' },
                  React.createElement('span', null, '任务监视器'),
                  React.createElement('span', { className: 'moni-drag-hint' }, '拖动'),
                ),
                React.createElement('span', { className: 'moni-count' }, runningCount + ' 运行中'),
              ),
              total === 0
                ? React.createElement('div', { className: 'moni-empty' }, '暂无长任务')
                : items.map((it) =>
                    React.createElement('div', { key: it.key, className: 'moni-task' },
                      React.createElement('div', { className: 'moni-row' },
                        React.createElement('span', { className: 'moni-badge ' + (KIND_BADGE[it.kind] || '') }, KIND_LABEL[it.kind] || it.kind),
                        React.createElement('span', { className: 'moni-label', title: it.label }, it.label),
                        React.createElement('span', { className: 'moni-time' }, fmt(it.elapsedMs)),
                        React.createElement('span', { className: 'moni-status ' + it.status },
                          it.status === 'running' ? '●' : it.status === 'error' ? '✕' : '✓',
                        ),
                      ),
                      it.detail ? React.createElement('div', { className: 'moni-sub', title: it.detail }, it.detail) : null,
                      ProgressBar(it),
                    ),
                  ),
            ),
            React.createElement('div', { className: 'moni-pill', onMouseDown: startDrag, onClick: () => setOpen(!open), onDoubleClick: resetPos },
              React.createElement('span', { className: runningCount > 0 ? 'moni-dot running' : 'moni-dot idle' }),
              React.createElement('span', { className: 'moni-count' }, runningCount > 0 ? runningCount + ' 个长任务运行中' : '监视器'),
              React.createElement('span', { style: { color: '#9ca3af' } }, open ? '▾' : '▴'),
            ),
          )
        }

        slots.register(
          { name: 'shell.overlay', id: 'dsh-progress-monitor', order: 100 },
          () => React.createElement(Monitor),
        )
      },
    }
  },
})
