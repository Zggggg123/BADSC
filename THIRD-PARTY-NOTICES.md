# Third-party notices

The root MIT license covers BADSC's original code and documentation. It does not
replace third-party licenses or grant rights to the game or its assets.

## brotli-wasm 3.0.1

- Source: <https://github.com/httptoolkit/brotli-wasm>
- Vendored files: `web/vendor/`.
- License: Apache-2.0; the complete license is retained at `web/vendor/LICENSE`.
- These browser JavaScript and WASM files are distributed with the website.

## BA-Units dictionary source

- Upstream: <https://github.com/JohnJinHM/BA-Units>.
- Input: the upstream `Options.json` export, identified in the immutable snapshot
  metadata as version `1.1.1.1`, date `2026-08-08`.
- BADSC maps five option fields into `web/dictionaries/` using
  `tools/build-dictionary.cjs`. It does not execute the upstream extractor.
- Upstream repository license: MIT, copyright (c) 2026 Starfall. Its complete
  notice is retained at `licenses/BA-Units-MIT.txt`.
- The snapshot includes source hashes and extraction metadata. The upstream
  project license is not a claim of ownership or permission from the game's
  publisher over game-derived data. BADSC does not relicense game assets.

## Playwright

- Development-only dependency: <https://github.com/microsoft/playwright>.
- License: Apache-2.0, retained in the installed npm package.
- Playwright and its browsers are not shipped in the static website.

## Broken Arrow

Broken Arrow and related names, formats, and game content belong to their
respective rights holders. BADSC is an independent community conversion utility
and is not an official game service. The `.dek` interoperability key in the
codec is part of its existing format implementation, not an account credential.
