import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
// QFEX_PROXY_TARGET override is used by the e2e mock server; defaults to prod API.
export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      '/qfex': {
        target: process.env.QFEX_PROXY_TARGET || 'https://api.qfex.com',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/qfex/, ''),
      },
    },
  },
})
