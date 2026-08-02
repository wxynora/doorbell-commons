# Vendored upstream

- Repository: https://github.com/tutusagi/aifarm-oss
- Commit: `3c3246af784e7ec2adbec5cec9b3ca3ec9aab1a6`
- Imported: 2026-07-15
- License declared by upstream: MIT

The upstream source, built `dist/` runtime, content files, README, and package metadata are kept together. Local farm saves under `data/*.json` remain runtime-only and are not committed.

Downstream patch: `src/index.ts`, `src/server.ts`, `dist/index.js`, and `dist/server.js` default the HTTP listener to `127.0.0.1` and accept `HOST`, so the private sidecar is not exposed directly. No game rules or content were changed.
