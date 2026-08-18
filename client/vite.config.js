import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import process from 'node:process'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss()],

  server: {
    // Bind to every interface so the dev server is reachable from outside the
    // container / VM this runs in.
    host: true,
    port: 5173,

    // Accept any Host header. Vite blocks unknown hosts by default, which
    // breaks cloud IDEs and preview URLs that proxy the dev server.
    allowedHosts: true,

    /**
     * Why this proxy exists
     * ---------------------
     * The browser calls relative URLs such as `/api/jobs`. Vite forwards those
     * to the Express API on port 5000. That means:
     *   - the frontend never hard-codes a backend hostname,
     *   - there are no cross-origin (CORS) problems in development,
     *   - the exact same code works in production behind Nginx or Vercel.
     */
    proxy: {
      '/api': {
        target: process.env.VITE_API_PROXY_TARGET || 'http://127.0.0.1:5000',
        changeOrigin: true,
      },
    },
  },
})
