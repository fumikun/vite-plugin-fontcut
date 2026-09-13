import { defineConfig } from 'vite';
import dts from 'vite-plugin-dts';

export default defineConfig({
  build: {
    target: 'node18',
    sourcemap: true,
    minify: false,
    lib: {
      entry: 'src/index.ts',
      formats: ['es', 'cjs'],
      fileName: (format) => (format === 'es' ? 'index.js' : 'index.cjs'),
    },
    rollupOptions: {
      external: [/^node:/, 'postcss', 'postcss-value-parser', 'subset-font', 'vite', 'rollup'],
    },
  },
  plugins: [
    dts({
      tsconfigPath: 'tsconfig.build.json',
    }),
  ],
});
