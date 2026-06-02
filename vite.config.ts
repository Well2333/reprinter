import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  base: '/',
  plugins: [
    react(),
    tailwindcss(),
  ],
  optimizeDeps: {
    exclude: ['pdfjs-dist'],
  },
  build: {
    // ofd.js bundles to ~5 MB; raise limit to suppress false-positive warning
    chunkSizeWarningLimit: 6000,
  },
})
