# khala — dev & E2E commands. Full manuals: AGENTS.md (agent operations),
# docs/e2e.md (browser E2E walkthrough).

# default: desktop app
default: dev

# Desktop app: Tauri shell + vite (opens a native window)
dev:
    pnpm tauri dev

# Browser mode: khala-server + vite -> http://localhost:14033 (E2E entry point)
dev-web:
    node scripts/dev-web.mjs

# Release-mode browser E2E: build the frontend, serve dist/ + API from one origin
e2e-dist:
    pnpm build
    cargo run -p khala-server -- --port 14033 --static ./dist

# Rust tests + frontend typecheck & build
check: check-rust check-web

check-rust:
    cargo test --workspace

check-web:
    pnpm build

test:
    cargo test --workspace

# Optional lints, require the rustfmt/clippy components:
fmt:
    cargo fmt --all --check

clippy:
    cargo clippy --workspace --all-targets -- -D warnings
