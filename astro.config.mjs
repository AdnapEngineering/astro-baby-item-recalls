import { defineConfig } from 'astro/config';
import { defineConfig } from 'astro/config';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  site: 'https://adnapengineering.github.io/astro-baby-item-recalls',
  base: '/astro-baby-item-recalls/',
  vite: {
    plugins: [tailwindcss()],
  },
});
