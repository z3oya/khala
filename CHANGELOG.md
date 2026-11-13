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

-Appearance (light / dark / follow system);
- `?mock=showcase`: sample session covering every message-block type.
- `?shot=1`: disables animations and transitions for deterministic screenshots.
- `?settings=<section>`: deep-links straight to a settings section.
- Task rows: `data-blocks` kind tokens, ⋯ menu button, F2 opens the context menu.
- Sidebar: drag to reorder sessions within a project or the unfiled zone; a semi-transparent clone follows the pointer with an insertion line, and the order persists.
- Settings gear: right-click opens a quick menu anchored above the button; Theme and Interface language expand into side flyouts.

### Changed

- `?mock=` accepts comma-combined values.

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
