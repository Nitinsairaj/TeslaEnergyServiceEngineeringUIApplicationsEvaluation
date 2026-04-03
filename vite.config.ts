import react from '@vitejs/plugin-react'
import { defineConfig } from 'vitest/config'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  preview: {
    port: 8000,
  },
  server: {
    port: 8000,
    proxy: {
      '/api': {
        changeOrigin: true,
        target: 'http://127.0.0.1:8787',
      },
    },
  },
  test: {
    css: true,
    environment: 'jsdom',
    globals: true,
    setupFiles: './src/test/setup.ts',
  },
})
