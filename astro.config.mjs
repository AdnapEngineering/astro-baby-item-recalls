import { defineConfig } from 'astro/config';
import tailwindcss from '@tailwindcss/vite';
import react from '@astrojs/react';

export default defineConfig({
  site: 'https://adnapengineering.github.io/astro-baby-item-recalls',
  base: '/astro-baby-item-recalls/',
  vite: {
    plugins: [tailwindcss()],
  },
  integrations: [react()],
});
