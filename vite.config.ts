import { fileURLToPath, URL } from 'node:url'
import vue from '@vitejs/plugin-vue'
import { defineConfig } from 'vitest/config'

export default defineConfig({
  // GitHub Pages sert le jeu sous /nkg-ages/.
  base: process.env.GITHUB_PAGES ? '/nkg-ages/' : '/',
  plugins: [vue()],
  resolve: {
    alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
  },
  worker: { format: 'es' },
  test: {
    include: ['tests/**/*.test.ts'],
    setupFiles: ['tests/setup.ts'],
    environment: 'node',
    coverage: {
      provider: 'v8',
      include: ['src/**/*.{ts,vue}'],
      // Le rendu WebGL, le Worker et la vue carte se vérifient dans Chromium (pnpm e2e).
      exclude: [
        'src/main.ts',
        'src/env.d.ts',
        'src/host/worker.ts',
        'src/render/webgl/**',
        'src/render/overlay.ts',
        'src/ui/components/MapView.vue',
        'src/ui/App.vue',
      ],
      reporter: ['text-summary', 'json-summary'],
      reportsDirectory: 'ci-out/coverage',
      thresholds: { lines: 90, functions: 90, branches: 85, statements: 90 },
    },
  },
})
