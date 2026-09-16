// Vite configuration for Tal's Whiteboard.  The base path matches the
// GitHub Pages address https://talgross-bu.github.io/whiteboard/ so that
// the built asset URLs resolve correctly there.

import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  base: '/whiteboard/',
  plugins: [react()],
  build: {
    outDir: 'dist',
    sourcemap: true,
    // The Neon SDK brings its auth stack with it, which puts the single
    // bundle a little over Rollup's default warning size.  That is expected.
    chunkSizeWarningLimit: 800,
  },
})
