import { defineConfig } from 'vite'
import { resolve } from 'path'

export default defineConfig({
  base: '/2d-star-system-map/',
  build: {
    rollupOptions: {
      input: {
        main: resolve(__dirname, 'index.html'),
        test: resolve(__dirname, 'test.html'),
      },
    },
  },
})
