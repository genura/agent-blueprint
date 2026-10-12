import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'
import { flowFiles } from './vite-plugin-flow.ts'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), flowFiles()],
  server: {
    // Sema dosyalari degisince sayfa yenilenmesin; SSE ile canli guncellenir
    watch: { ignored: ['**/schema/**', '**/*.flow', '**/flow.config.json'] },
  },
})
