Drink Water (Electron)

一个极简的桌面喝水提醒应用：小窗口固定在右下角，点击按钮记录一次 300ml，距离上次喝水超过 2 小时会提醒；记录本地保存并按开发/生产环境上报到服务器。

功能

- 迷你悬浮窗口，常驻桌面
- 一键记录 300ml
- 超过 2 小时未喝水提醒
- 本地保存、离线可用
- 自动上报（开发/生产环境）
- 支持初始化清空记录

运行

1. 安装依赖
   - `pnpm i`
2. 启动
   - `pnpm start`

设置项

- 用户 ID：必填，用于上报
- 提醒间隔：默认 2 小时
- 提醒开关：可关闭提醒

上报格式

- 接口：`POST /api/ReportRecordProject/receive_report_db`
- 请求体：
  - `app_key`: 固定
  - `index_field`: `userid_drinktime`
  - `docs`: `[{ userid_drinktime, user_id, water, drink_time }]`
- `userid_drinktime` 规则：`${user_id}_${YYYY-MM-DD HH:mm:ss}`

图标

- 运行时使用 `water.png`
- 打包时使用 `build/icon.icns`

打包（macOS）

1. 生成 `build/icon.icns`
   - 参考：`iconutil` + `sips`（项目根目录执行）
2. 打包
   - `pnpm run dist`
3. 产物
   - `dist/` 下的 `.dmg` 和 `.zip`

目录结构

- `main.js` 主进程（提醒/存储/上报）
- `preload.js` 安全桥接
- `renderer/` UI

环境的变化只有在开发环境可以设置，打完包是不让修改的；
下次提醒时间，要显示出来；
打包后，安装后的显示图标不对，打开后 dock 里显示是好的

提醒时间字要小 放在上次喝水的时间的右边即可，只要时间不要日期
可以设置提醒的内容
