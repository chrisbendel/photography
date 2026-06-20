// @ts-check
import { defineConfig } from 'astro/config';

// https://astro.build/config
export default defineConfig({
  site: 'https://photos.cbendel.me',
  image: {
    service: { entrypoint: 'astro/assets/services/sharp' },
  },
});
