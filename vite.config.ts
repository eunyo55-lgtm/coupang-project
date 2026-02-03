// vite.config.js
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  // 아래 base 설정을 추가하거나 수정하세요
  base: '/', 
})