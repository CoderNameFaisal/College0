import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// Resolve app root from this config file so .env is always loaded from college0-app/
// even if a tool starts Vite with a different process.cwd().
const appRoot = path.dirname(fileURLToPath(import.meta.url))

// https://vite.dev/config/
export default defineConfig({
  root: appRoot,
  envDir: appRoot,
  plugins: [react(), tailwindcss()],
})
