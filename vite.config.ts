import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  server: {
    host: true,
    port: 5173,
    open: true,
    // Headers para permitir cámara en contexto inseguro
    headers: {
      'Permissions-Policy': 'camera=(self)',
      'Feature-Policy': 'camera *'
    }
  },
  build: {
    target: 'es2020'
  }
})