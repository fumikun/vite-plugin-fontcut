import { defineConfig } from 'vite';
import subfont from '../src/index.js';

export default defineConfig({
  server: {
    fs: {
      allow: ['..'],
    },
  },
  build: {
    outDir: 'dist',
  },
  plugins: [subfont()],
});
