import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  build: {
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes('@mlc-ai/web-llm')) return 'web-llm';
          if (id.includes('react-beautiful-dnd')) return 'dnd';
          if (id.includes('leaflet') || id.includes('@react-google-maps/api')) return 'maps';
          if (id.includes('react-router-dom')) return 'router';
          if (id.includes('i18next') || id.includes('react-i18next')) return 'i18n';
          if (id.includes('lucide-react')) return 'icons';
          if (id.includes('node_modules')) return 'vendor';
        },
      },
    },
  },
  server: {
    proxy: {
      '/api': {
        target: 'http://localhost:8788',
        changeOrigin: true,
      },
    },
  },
  test: {
    environment: 'jsdom',
    setupFiles: ['tests/offline/setup.ts'],
    include: ['tests/**/*.test.ts'],
  },
})
