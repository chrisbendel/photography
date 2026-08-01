// @ts-check
import { defineConfig } from 'astro/config';

import cloudflare from '@astrojs/cloudflare';

export default defineConfig({
  site: 'https://photos.cbendel.me',
  // /gallery/ was the mosaic before it became the homepage.
  redirects: { "/gallery": "/" },

  image: {
    service: { entrypoint: 'astro/assets/services/sharp' },
  },

  adapter: cloudflare(),
});