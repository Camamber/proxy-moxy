import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

// In development the UI talks to the backend through Vite's proxy, so there is no CORS.
// In production the backend serves `dist/` itself on the same origin.
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      '/api': {
        target: process.env.API_URL ?? 'http://127.0.0.1:4000',
        changeOrigin: true,
      },
    },
  },
});
