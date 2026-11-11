# Changelog

All notable changes to this project will be documented in this file.
中文版见 [CHANGELOG.zh-CN.md](CHANGELOG.zh-CN.md)。

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

<!--
Guidelines:
- Follow https://keepachangelog.com/ (section names and order, [Unreleased] on top, ISO dates).
- Entries describe the net result versus the previous release only — never the
  intermediate evolution within a change.
- One line per notable change; no over-explaining. Details belong in docs/.
-->

## [Unreleased]

### Added

- Sidebar session drag sorting in the projects view; manual order persists in localStorage.
- Drag-sort design and research docs (`docs/sidebar-dnd-*.md`).

### Changed

- Sidebar session rows: the relative time and the archive button now share one right-edge slot, swapping in place on hover/focus (touch shows only the button).

### Removed

- "Show more / Show all" folding in task lists.

## [0.1.0] - 2026-11-08

### Added

- Greet UI with history and reset; Debug HUD; ErrorBoundary.
- Dual-transport frontend: `src/lib/rpc.ts` picks Tauri IPC or HTTP at runtime; typed command wrappers.
- `crates/khala-server`: axum mirror exposing the command layer over HTTP, loopback only.
- `crates/khala-core`: transport-agnostic command layer (DTOs, `AppError`, `dispatch()`), with commands `greet` / `reset` / `info`.
- Pre-commit hooks, including a guard against direct commits to `main`.
- Tauri 2 + React 19 + TypeScript desktop app scaffold.
