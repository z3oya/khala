# Changelog

All notable changes to this project will be documented in this file.
中文版见 [CHANGELOG.zh-CN.md](CHANGELOG.zh-CN.md)。

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.1.0] - 2026-11-08

### Added

- Greet UI with history and reset; Debug HUD; ErrorBoundary.
- Dual-transport frontend: `src/lib/rpc.ts` picks Tauri IPC or HTTP at runtime; typed command wrappers.
- `crates/khala-server`: axum mirror exposing the command layer over HTTP, loopback only.
- `crates/khala-core`: transport-agnostic command layer (DTOs, `AppError`, `dispatch()`), with commands `greet` / `reset` / `info`.
- Pre-commit hooks, including a guard against direct commits to `main`.
- Tauri 2 + React 19 + TypeScript desktop app scaffold.
