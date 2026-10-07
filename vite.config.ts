import { sveltekit } from '@sveltejs/kit/vite';
import adapter from '@sveltejs/adapter-static';
import { defineConfig } from 'vitest/config';
export default defineConfig({ plugins: [sveltekit({ adapter: adapter({ fallback: '200.html' }) })], test: { include: ['src/**/*.test.ts'] } });
