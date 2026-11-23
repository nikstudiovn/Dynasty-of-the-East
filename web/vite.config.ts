import { defineConfig } from "vite";

// Relative base './' ensures identical asset resolution on both
// GitHub Pages subpaths and offline iOS WKURLSchemeHandler bundles.
export default defineConfig({
  base: "./",
  build: {
    outDir: "dist",
    assetsDir: "assets",
    sourcemap: false
  }
});
