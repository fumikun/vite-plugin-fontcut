import { defineConfig } from 'vite';
import fontcut from '../src/index.js';

export default defineConfig({
  server: {
    fs: {
      allow: ['..'],
    },
  },
  build: {
    outDir: 'dist',
  },
  plugins: [fontcut()],
});
