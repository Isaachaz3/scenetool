import { resolve } from 'node:path';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Two entry points: the GM window and the chrome-less player window.
export default defineConfig({
  base: './',
  plugins: [react()],
  build: {
    target: 'es2022',
    chunkSizeWarningLimit: 800, // React + Konva are shared by both windows
    rollupOptions: {
      input: {
        index: resolve(__dirname, 'index.html'),
        player: resolve(__dirname, 'player.html'),
      },
    },
  },
});
