import { defineConfig } from "vite";

// Relative base './' ensures identical asset resolution on both
// GitHub Pages subpaths and offline iOS WKURLSchemeHandler bundles.
export default defineConfig({
  base: "./",
  build: {
    outDir: "dist",
    assetsDir: "assets",
    sourcemap: false,
    // Three.js is bundled locally (offline / App Store safe), so it gets its own cacheable chunk.
    chunkSizeWarningLimit: 800,
    rollupOptions: {
      output: {
        manualChunks: id => (id.includes("node_modules/three") ? "three" : undefined)
      }
    }
  }
});
