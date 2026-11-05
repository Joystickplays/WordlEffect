import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  // the daily word, as vercel.json fetches it once deployed (Wordle's own server won't answer other sites' pages)
  server: {
    proxy: {
      '/wordle': { target: 'https://www.nytimes.com', changeOrigin: true, rewrite: p => p.replace(/^\/wordle/, '/svc/wordle/v2') },
      '/api': { target: 'https://wordleffect.vercel.app', changeOrigin: true }, // the deployed functions (TURN credentials)
    },
  },
})
