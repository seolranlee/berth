import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import path from 'node:path';

const root = import.meta.dirname; // web/

export default defineConfig({
  root,
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      '@': path.resolve(root, 'src'),
      '@shared': path.resolve(root, '../shared/types.ts'),
    },
  },
  server: {
    port: 5173,
    // 개발 시 API는 데몬(8787)으로 프록시
    proxy: { '/api': 'http://127.0.0.1:8787' },
  },
  build: {
    outDir: 'dist', // web/dist — 데몬이 prod에서 이 폴더를 정적 서빙
    emptyOutDir: true,
  },
});
