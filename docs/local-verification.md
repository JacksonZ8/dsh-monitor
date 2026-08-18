# 本地实测清单 / Local verification

把 `dsh-monitor` 在 DSH web profile 里真实装载并验证面板 + 数据通道。

## 0. 前置

- Node `^22.19 || >=24`，能跑 `npx @deepseek-ai/dsh`（或已装 `dsh` CLI）。
- 本仓库已 `npm install`（其实无依赖，但 CLI 需要从 `node_modules` 或 `$DSH_HOME/profiles/node_modules` 解析包名）。

## 1. 装配进 web profile（关键）

> 官方 guide 明确：**装进内置 `web` profile，别建新 profile**（新 profile 默认是 agent profile，不带 Web UI）。

```bash
cd /path/to/dsh-monitor

# 从父目录安装（路径指向本包）：
cd ..
dsh plugin --profile web add ./dsh-monitor

# 启动 web：
dsh --profile web
# 或
npx @deepseek-ai/dsh --profile web
```

预期启动日志出现：
- loader 装载 `dsh-monitor` 行（来自 `cordis.patch.yml` 的 `insert`）
- host 半 `apply` 执行（`webServer` 路由注册，无输出也正常）
- 浏览器半 factory 物化（`shell.overlay` 注册 `id: dsh-monitor`）

## 2. 验证数据路由（host 半）

启动后，浏览器或 curl：

```bash
curl -s http://127.0.0.1:3080/dsh-monitor/snapshot
# 预期返回 JSON：{"now":..., "items":[...]}
```

> 端口以 web 启动日志打印的 URL 为准（默认 3080，可能被 `--port` 覆盖）。

## 3. 验证面板（浏览器半）

1. 打开 web UI，右下角应出现「监视器」pill（绿点/灰点）。
2. 点 pill 展开面板，空载显示「暂无任务」。
3. 拖 pill 或面板 header，位置应跟手，刷新后经纬度记忆生效。

## 4. 验证进度追踪

在**同一 profile 起的会话里**制造任务并看面板：

```bash
# 后台 job（绿点 → 完成后 ✓）
dsh --profile web   # 在它的会话里让 agent 跑：
#   "跑一个 30 秒的后台 for 循环任务"

# workflow（进度条 + % + 剩余≈）
# 让 agent 用 workflow 工具跑一个带 meta.phases 的多阶段脚本
```

预期：
- 后台 job 行显示「任务」徽章 + 命令 + 耗时，状态 ●/✓/✕；
- workflow 行显示「工作流」徽章 + 进度条 + 百分比 + `剩余≈`。

## 5. 若面板不显示 / 数据为空

按以下顺序排查：

1. **host 路由有没有**：`curl .../dsh-monitor/snapshot` 是否 200/JSON。
2. **browser 半 factory 是否物化**：浏览器 console 有无
   `window.__ModuleLoader__.load` 相关报错；确认 `id: 'dsh-monitor'` 与包名一致。
3. **`inject: ['slots']` 是否满足**：`@deepseek-ai/dsh-client-ui-slots` 是否在
   `dsh.client.inject` 列表里（当前 package.json 已含）。
4. **`shell.overlay` 是 list 槽**：`id` 必须给且不与内置冲突（当前用
   `dsh-monitor`）。

## 6. 已知尚未验证点

- `ctx.styles.insert` 在浏览器半 factory 的 `apply(ctx)` 里是否可用：本包已
  做 `ctx.styles && ctx.styles.insert` 容错，若该对象不存在，样式需改为
   `<style>` 注入或依赖运行时提供的 `styles` 内建（见 `cordis-plugin-development`
   skill 的 Builtin 列表）。
- `fetch('/dsh-monitor/snapshot')` 的相对路径在 web 部署下是否命中 host 路由
  —— 若面板在其他 origin 下需改为绝对 URL（从 `window.location.origin` 拼）。
