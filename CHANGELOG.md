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

- Chat avatars: the Grok Bot mark engine ported 1:1 as a TS/SVG component — 53 states, 25 body shapes, 11 colors, 9 expressions with blinks, cursor-following gaze, spin/nod/bounce reactions, and deterministic per-agent identity from an id seed.
- Chat avatars: a WeChat-style preset (`<GrokBotMark preset="wechat">`) — single green speech bubble (#07C160) with white oval eyes, running on the same state engine.
- Apps gallery: "Grok Bot Mark" showcase — state/shape/color/seed pickers, poke/blink/look controls, cursor tracking, and live state & shape grids.
- Appearance (light / dark / follow system).
- `?mock=showcase`: sample session covering every message-block type.
- `?shot=1`: disables animations and transitions for deterministic screenshots.
- `?settings=<section>`: deep-links straight to a settings section.
- Task rows: `data-blocks` kind tokens, ⋯ menu button, F2 opens the context menu.
- Sidebar: drag to reorder sessions within a project or the unfiled zone; a semi-transparent clone follows the pointer with an insertion line, and the order persists.
- Settings gear: right-click opens a quick menu anchored above the button; Theme and Interface language expand into side flyouts.
- Chat markdown: fenced `mermaid` blocks render as diagrams, with a diagram/source toggle and re-render on theme switch.
- Chat markdown: LaTeX math via KaTeX — inline `$...$`, `$$` blocks and ```latex fences render as formulas; money-like text stays plain.
- Chat markdown: fenced `plantuml` blocks render as UML diagrams — local engine, sanitized output, theme-following.
- Apps gallery: Mermaid playground with live rendering and presets; a notice shows when the renderer is absent.
- Frameless main window: the title bar and the sidebar top band drag the window; minimize / maximize / close controls sit at the title bar's right end (Tauri builds).
- Composer: the attach button opens a file picker; picked files show as chips above the input, removable one by one, and clear on send or session switch.
- Sidebar projects view: the Pinned / Projects / Chats zone headers collapse on click; the state persists.

### Changed

- `?mock=` accepts comma-combined values.
- Startup opens the New Task draft.
- Sidebar header reads "Sessions"; the unfiled zone header reads "Chats".
- Sidebar session list: no visible scrollbar; the top/bottom fade masks mark the scrollable ends.
- Group heads: the count badge sits right after the name, left-aligned.
- Sidebar session rows: the relative time and the archive button now share one right-edge slot, swapping in place on hover/focus (touch shows only the button).

### Removed

- "Show more / Show all" folding in task lists.

### Fixed

- Task-row tail buttons (archive, ⋯) receive clicks again; the faded-out time label no longer stacks invisibly above them.
- Task-row buttons: a press with pointer drift no longer arms the row drag and swallows the click.

## [0.1.0] - 2026-11-08

### Added

- Greet UI with history and reset; Debug HUD; ErrorBoundary.
- Dual-transport frontend: `src/lib/rpc.ts` picks Tauri IPC or HTTP at runtime; typed command wrappers.
- `crates/khala-server`: axum mirror exposing the command layer over HTTP, loopback only.
- `crates/khala-core`: transport-agnostic command layer (DTOs, `AppError`, `dispatch()`), with commands `greet` / `reset` / `info`.
- Pre-commit hooks, including a guard against direct commits to `main`.
- Tauri 2 + React 19 + TypeScript desktop app scaffold.
