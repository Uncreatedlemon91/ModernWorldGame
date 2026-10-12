import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  base: './',
  build: { chunkSizeWarningLimit: 4000 },
  test: { environment: 'node', testTimeout: 180000 },
} as never);
