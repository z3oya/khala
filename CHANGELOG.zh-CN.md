# 更新日志

本文件记录本项目所有值得注意的变更。English version: [CHANGELOG.md](CHANGELOG.md)。

格式依据 [Keep a Changelog](https://keepachangelog.com/zh-CN/1.1.0/)，版本号遵循[语义化版本](https://semver.org/lang/zh-CN/)。

<!--
纲领：
- 遵循 https://keepachangelog.com/。
- 条目仅应包括本次变更相对上一版本的净值结果，不得包含含本次变更的中间演化过程。
- 每条可注意的变更一行，不得过度解释实现细节。
-->

## [Unreleased]

### Added

- 侧栏会话拖动排序（projects 视图），手排顺序持久化到 localStorage。
- 拖拽排序设计与调研文档（`docs/sidebar-dnd-*.md`）。

### Changed

- 侧栏会话条目的相对时间与归档按钮共用行尾同一位置，悬停/聚焦时原位切换（触屏仅显示按钮）。

### Removed

- 任务列表「显示更多 / 显示全部」折叠。

## [0.1.0] - 2026-11-08

### Added

- Greet 界面（含历史与重置）；Debug HUD；ErrorBoundary。
- 双传输前端：`src/lib/rpc.ts` 运行时自动选择 Tauri IPC 或 HTTP；类型化命令封装。
- `crates/khala-server`：命令层的 axum 镜像，通过 HTTP 暴露，仅绑定回环地址。
- `crates/khala-core`：与传输无关的命令层（DTO、`AppError`、`dispatch()`），命令 `greet` / `reset` / `info`。
- Pre-commit 钩子，含禁止直接提交到 `main` 的保护。
- Tauri 2 + React 19 + TypeScript 桌面应用脚手架。
