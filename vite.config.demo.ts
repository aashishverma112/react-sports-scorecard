import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { defineConfig } from 'vite'

// Demo-app build config — deliberately NOT library mode.
// Used only for deploying the live demo (e.g. to Vercel).
// The main vite.config.ts stays in library mode for `npm run build` (npm publish).
export default defineConfig({
  plugins: [react(), tailwindcss()],
  build: {
    outDir: 'dist-demo',
  },
})