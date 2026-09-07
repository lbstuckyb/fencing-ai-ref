import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  // GitHub Pages serves project sites from /<repo>/, so the built asset URLs
  // need that prefix. Only the GH Pages build sets GH_PAGES=true (see the
  // deploy workflow) — local dev and `vite preview` stay at `/`.
  base: process.env.GH_PAGES ? '/fencing-ai-ref/' : '/',
  plugins: [react(), tailwindcss()],
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./src/test/setup.ts'],
    include: ['src/**/*.{test,spec}.{ts,tsx}'],
  },
});
