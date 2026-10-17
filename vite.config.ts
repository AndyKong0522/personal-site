import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  // three.js 那个包（约 900 KB，gzip 约 240 KB）是首屏渲染后才懒加载的，不阻塞首屏。
  build: { chunkSizeWarningLimit: 1000 },
})
