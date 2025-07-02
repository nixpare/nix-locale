import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import nixLocale from "@nixpare/nix-locale/plugin"

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react(),
    nixLocale({
      include: ['src/**/*.tsx'],
      locales: ["it", "en"],
      default: 'it',
      useLocaleImportPath: 'src/hooks/locale'
    })
  ],
})
