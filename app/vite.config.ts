import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import mdx from '@mdx-js/rollup';
import remarkMath from 'remark-math';
import remarkGfm from 'remark-gfm';
import { viteSingleFile } from 'vite-plugin-singlefile';
// @ts-ignore -- plain JS remark plugin
import remarkSteps from './remark-steps.js';
// @ts-ignore -- plain JS remark plugin
import remarkTexRuntime from './remark-tex-runtime.js';

export default defineConfig(({ command }) => ({
  base: './',
  plugins: [
    {
      enforce: 'pre',
      ...mdx({
        remarkPlugins: [remarkMath, remarkGfm, remarkTexRuntime, remarkSteps],
        providerImportSource: '@mdx-js/react',
      }),
    },
    react({ include: /\.(mdx|js|jsx|ts|tsx)$/ }),
    ...(command === 'build' ? [viteSingleFile()] : []),
  ],
  build: {
    outDir: 'dist',
    assetsInlineLimit: 100_000_000,
    chunkSizeWarningLimit: 100_000,
  },
  test: {
    include: ['src/**/*.test.ts'],
  },
}));
