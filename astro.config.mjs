// @ts-check
import { defineConfig, sessionDrivers } from 'astro/config';

import cloudflare from '@astrojs/cloudflare';

export default defineConfig({
  site: 'https://photos.cbendel.me',
  // No sessions on a photo site. Without this the Cloudflare adapter adds a
  // SESSION KV binding with no id, which inherits whatever the live worker has —
  // and that pointed at a KV namespace deleted with the old /studio setup.
  session: { driver: sessionDrivers.null() },

  // /gallery/ was the mosaic before it became the homepage.
  redirects: { "/gallery": "/" },

  image: {
    service: { entrypoint: 'astro/assets/services/sharp' },
  },

  adapter: cloudflare(),
});