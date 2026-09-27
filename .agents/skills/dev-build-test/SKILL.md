---
name: dev-build-test
description: Steps to compile DIWA TypeScript assets and test them inside the local Obsidian environment.
---

# Developer Build & Test Runbook

Use this skill when you need to bundle DIWA plugin files or verify local development builds.

## 1. Project Scripts
Refer to scripts in [`package.json`](file:///Users/K26/Development/diwa/package.json):
*   **Production Build**: `npm run build`
    *   Compiles typescript definitions (`tsc -noEmit -skipLibCheck`)
    *   Runs esbuild packaging to bundle `main.js`
*   **Development Watcher**: `npm run dev`
    *   Launches esbuild watcher that recompiles assets on file changes
*   **Clean Assets**: `npm run clean`
    *   Removes intermediate build assets

---

## 2. Compilation and Deployment Workflow
1.  **Modify Source**: Write changes in the `src/` directory.
2.  **Verify Types**: Run the TypeScript compiler check to verify type safety:
    ```bash
    npm run build
    ```
3.  **Deploy Output**: The compilation pipeline automatically copies build files to the active deployment vault plugin directory:
    *   Path: `/Users/K26/Obsidian/K0000/.obsidian/plugins/obsidian_DIWA` (case-insensitive target; resolves to `Obsidian_diwa` in `esbuild.config.mjs`)
    *   Assets deployed: `main.js`, `manifest.json`, `styles.css`.
4.  **Refresh Obsidian**: In Obsidian, go to Settings -> Community Plugins, toggle the **diwa** plugin off and back on to load the latest compiled code. Open developer tools (`Cmd+Option+I` on Mac) to view debug logs.
