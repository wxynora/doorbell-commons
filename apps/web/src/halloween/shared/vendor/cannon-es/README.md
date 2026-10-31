This candidate vendors the upstream `cannon-es@0.20.0` ESM bundle and MIT license from the npm registry tarball.

`dist/cannon-es.mjs` is the upstream `dist/cannon-es.js` bundle with only its extension changed so Node loads it as ESM without relying on package-level module settings. `upstream-package.json` preserves the original package metadata; this directory is a focused vendor copy, not a complete npm package. The server imports the bundle directly from `farm/pile-physics.mjs`.
