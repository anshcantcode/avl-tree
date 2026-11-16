# Contributing

Open an issue describing the problem or improvement, with reproduction steps where relevant. Keep pull requests focused and preserve keyboard navigation, mobile layouts, and reduced-motion behavior.

Serve the project with `python -m http.server 8000`, then exercise the affected controls in a browser. Check both a desktop viewport and a narrow phone viewport for layout changes.

For algorithm changes, run `pwsh -File build.ps1` and `node test/test_wasm.cjs`. Commit the updated `js/avl-wasm.js` alongside `src/avl.c` so the checked-in application uses the new implementation. Keep generated binaries and local tooling output out of commits.

Contributions to the code are licensed under the project's MIT license. Preserve third-party image credits and licenses.
