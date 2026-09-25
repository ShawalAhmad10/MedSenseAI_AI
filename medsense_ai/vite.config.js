import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')

  const backendTarget =
    env.VITE_BACKEND_TARGET || 'http://127.0.0.1:5005'

  const aiTarget =
    env.VITE_AI_TARGET || 'http://127.0.0.1:8000'

  return {
    plugins: [react()],
    server: {
      proxy: {
        '/ai-api': {
          target: aiTarget,
          changeOrigin: true,
          secure: false,
          rewrite: (path) =>
            path.replace(/^\/ai-api/, '/api/v1'),
        },
        '/api': {
          target: backendTarget,
          changeOrigin: true,
          secure: false,
        },
        '/health': {
          target: backendTarget,
          changeOrigin: true,
          secure: false,
        },
      },
    },
  }
})
