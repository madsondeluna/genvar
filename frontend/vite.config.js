import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  // Caminho base do app. Vazio/'/' para o deploy raiz (TCC); '/beta/' para o
  // deploy beta. Controlado por env para o build raiz nao ser afetado.
  base: process.env.VITE_BASE_PATH || '/',
  plugins: [react(), tailwindcss()],
  test: {
    // O volume e exFAT e o macOS escreve um sidecar "._nome" ao lado de cada
    // arquivo. O vitest tentava importar "._pdf.test.js" como suite e reprovava
    // o build por um arquivo que nao e codigo. O hook de pre-commit os remove
    // antes de commitar; aqui eles saem tambem entre um commit e outro.
    exclude: ['**/node_modules/**', '**/dist/**', '**/._*'],
  },
  server: {
    port: 3000,
    proxy: {
      '/api': {
        target: 'http://localhost:8000',
        changeOrigin: true,
      },
    },
  },
})
