import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig(({ command }) => ({
  base: command === 'serve' ? '/turnover-tracker/' : '/',
  server: {
    host: '127.0.0.1',
  },
  plugins: [react()],
}))
