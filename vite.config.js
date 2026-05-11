import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  build: {
    // Disable minification to avoid Rolldown/oxc TDZ bug
    // where const declarations cause "Cannot access X before initialization"
    minify: false,
  },
})
