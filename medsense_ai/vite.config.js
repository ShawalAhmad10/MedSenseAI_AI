import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      // MedsenseAI Python/FastAPI backend (DDI, AI features)
      '/ai-api': {
        target: 'http://localhost:8000',
        changeOrigin: true,
        secure: false,
        rewrite: (path) => path.replace(/^\/ai-api/, '/api/v1'),
      },
      // Existing Node.js backend (auth, products, orders, etc.)
      '/api': {
        target: 'http://localhost:5005',
        changeOrigin: true,
        secure: false,
        rewrite: (path) => path,
      },
      '/health': {
        target: 'http://localhost:5005',
        changeOrigin: true,
        secure: false,
      },
    },
  },
})
