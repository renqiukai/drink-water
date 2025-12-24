喝水小应用（Electron）

目标是做一个非常轻量的桌面喝水提醒应用：一个小窗口悬浮在桌面上，点击按钮即记录一次 300ml 喝水；若上次喝水后 2 小时内没有再次记录，则提醒用户喝水；所有喝水记录会保存并同步到服务器。

功能清单
- 迷你桌面窗口：常驻、可拖动、尽量不打扰
- 一键记录：点击按钮记录一次 300ml
- 提醒规则：距离上次喝水 2 小时未记录则提醒
- 记录保存：本地持久化、支持离线
- 记录同步：上传服务器、支持失败重试

核心交互
- 主窗口：显示今天已喝水总量、最近一次喝水时间、以及“我喝了 300ml”按钮
- 提醒：系统通知或应用内提示（可配置）

数据模型（建议）
- DrinkRecord
  - id: string
  - amountMl: number (固定 300)
  - drankAt: number (Unix ms)
  - createdAt: number
  - synced: boolean
- Settings
  - remindIntervalMs: number (默认 2 小时)
  - remindEnabled: boolean
  - serverBaseUrl: string

提醒逻辑（建议）
- 每次记录后更新 lastDrankAt
- 计时器每 1-5 分钟轮询
- 如果 now - lastDrankAt >= remindIntervalMs 且提醒未触发，发送提醒
- 再次喝水时重置提醒状态

同步策略（建议）
- 本地优先：记录先落本地，再入待同步队列
- 后台同步：定时或触发式将未同步记录上传
- 失败重试：指数退避，或简单固定间隔

API 约定（示例）
- POST /api/drinks
  - body: { id, amountMl, drankAt }
  - response: { ok: true }
- GET /api/drinks?from=...&to=...
  - 返回服务器已记录数据，用于对账或同步

技术选型
- Electron + Node.js
- 本地存储：SQLite / JSON 文件（任选其一）
- 通知：Electron Notification 或系统通知

项目结构（建议）
- app/
  - main/      # 主进程
  - renderer/  # UI
  - shared/    # 共享逻辑
- data/        # 本地数据

开发计划（简版）
1. 搭建 Electron 项目与基本窗口
2. 完成“记录 300ml”功能与本地持久化
3. 实现提醒定时器与通知
4. 实现同步逻辑与失败重试
5. 完成设置项与简单配置页面

备注
- 窗口尽量小且不遮挡
- 允许用户关闭提醒或调整提醒间隔
