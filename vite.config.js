import { defineConfig } from 'vite';
import { viteSingleFile } from 'vite-plugin-singlefile';

export default defineConfig({
  plugins: [viteSingleFile()],
  server: { port: 5173, open: true },
  // Single self-contained file in dist/ so the game runs by double-clicking it.
  build: { outDir: 'dist', sourcemap: false, assetsInlineLimit: 100000000, chunkSizeWarningLimit: 2000 }
});
