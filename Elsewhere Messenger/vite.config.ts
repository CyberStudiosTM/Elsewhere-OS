/// <reference types="vitest/config" />
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'
import { treasurePreview } from './scripts/treasure-preview.mjs'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), treasurePreview()],
  // Tests read the Studio stylesheet to check every skin token has a Classic default.
  test: { css: { include: [/Studio\.css/] } },
})
